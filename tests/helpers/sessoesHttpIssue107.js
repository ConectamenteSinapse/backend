import assert from "node:assert/strict";
import { instante } from "./tempoJogoCicloIssue107.js";

export const dadosSessaoHttp = extras => ({ permissaoAtiva: true, limiteTempoDiario: 1,
  tempoUsadoHoje: 0, dataReferenciaTempo: "2026-10-29", sessaoJogoVersao: 0,
  sessaoJogoEstado: "encerrada", sessaoJogoId: null, sessaoJogoContabilizadoEm: instante(0),
  sessaoJogoExpiraEm: instante(30000), ...extras });
export const erroSessaoHttp = codigo => ({ erro: true, codigo,
  mensagem: codigo === "CONFLITO_SESSAO" ? "Não foi possível atualizar a sessão"
    : codigo === "SESSAO_JA_ATIVA" ? "Já existe uma sessão de jogo ativa"
    : codigo === "LIMITE_TEMPO_ATINGIDO" ? "O limite de tempo diário foi atingido"
    : codigo === "PERMISSAO_INATIVA" ? "A permissão para jogar está inativa"
    : "A sessão de jogo não está disponível" });

// Mesmos contratos para HTTP com persistência simulada e MongoDB real.
// Cada caso cria suas fixtures; nenhum Service é substituído por resultado pronto.
export async function cenariosSessoesHttp(t, h) {
  const iniciar = f => h.request(f, "POST", `/${f.jogo._id}/sessao`);
  const patch = (f, acao, sessaoId) => h.request(f, "PATCH", `/sessao/${acao}`, { sessaoId });
  async function fixture(s, extras) {
    s.mock.timers.enable({ apis: ["Date"], now: instante(0) });
    return h.fixture(s, extras);
  }
  for (const [metodo, caminho, body] of [["POST", "/ID/sessao"],
    ["PATCH", "/sessao/heartbeat", { sessaoId: "sessao" }],
    ["PATCH", "/sessao/pausar", { sessaoId: "sessao" }],
    ["PATCH", "/sessao/encerrar", { sessaoId: "sessao" }]]) {
    for (const [nome, auth, status, mensagem] of [
      ["sem JWT", null, 401, "Token nao informado"],
      ["responsável", { perfil: "responsavel" }, 403, "Acesso negado para esse perfil"],
      ["JWT inválido", "Bearer invalido", 401, "Token invalido ou expirado"],
    ]) await t.test(`${metodo} ${caminho}: ${nome}`, async s => {
      const f = await fixture(s), antes = await h.ler(f);
      const res = await h.request(f, metodo, caminho.replace("ID", String(f.jogo._id)), body, auth);
      assert.deepEqual(res, { status, dados: { erro: true, mensagem } });
      assert.deepEqual(await h.ler(f), antes);
    });
  }
  await t.test("criança inicia com 201 e segunda inicialização recebe 409", async s => {
    const f = await fixture(s), res = await iniciar(f);
    assert.equal(res.status, 201);
    assert.equal(res.dados.estado, "ativa");
    assert.equal(res.dados.tempoUsadoHoje, 0);
    assert.equal(res.dados.expiraEm, instante(30000).toISOString());
    assert.match(res.dados.sessaoId, /^[0-9a-f-]{36}$/i);
    assert.equal(String(res.dados.jogoSalvo._id), String(f.jogo._id));
    const antes = await h.ler(f);
    assert.equal(antes.sessaoJogoId, res.dados.sessaoId);
    assert.deepEqual(await iniciar(f), { status: 409, dados: erroSessaoHttp("SESSAO_JA_ATIVA") });
    assert.deepEqual(await h.ler(f), antes);
  });
  await t.test("heartbeat retorna consumo e expiração atualizados, sem duplicar segundos", async s => {
    const f = await fixture(s), inicio = await iniciar(f);
    assert.equal(inicio.status, 201);
    s.mock.timers.tick(10000);
    const res = await patch(f, "heartbeat", inicio.dados.sessaoId);
    assert.equal(res.status, 200);
    assert.equal(res.dados.tempoUsadoHoje, 10);
    assert.equal(res.dados.expiraEm, instante(40000).toISOString());
    assert.equal((await patch(f, "heartbeat", inicio.dados.sessaoId)).dados.tempoUsadoHoje, 10);
    assert.equal((await h.ler(f)).tempoUsadoHoje, 10);
  });
  await t.test("duas inicializações HTTP simultâneas têm somente uma vencedora", async s => {
    const f = await fixture(s);
    const respostas = await Promise.all([iniciar(f), iniciar(f)]);
    assert.deepEqual(respostas.map(res => res.status).sort(), [201, 409]);
    const vencedora = respostas.find(res => res.status === 201);
    assert.deepEqual(respostas.find(res => res.status === 409).dados, erroSessaoHttp("SESSAO_JA_ATIVA"));
    const atual = await h.ler(f);
    assert.equal(atual.sessaoJogoId, vencedora.dados.sessaoId);
    assert.equal(atual.sessaoJogoVersao, 1);
    assert.equal(atual.tempoUsadoHoje, 0);
  });
  await t.test("sessão expirada responde 409 e persiste consumo até a validade", async s => {
    const f = await fixture(s), inicio = await iniciar(f);
    s.mock.timers.tick(31000);
    assert.deepEqual(await patch(f, "heartbeat", inicio.dados.sessaoId), { status: 409, dados: erroSessaoHttp("SESSAO_EXPIRADA") });
    const atual = await h.ler(f);
    assert.equal(atual.tempoUsadoHoje, 30);
    assert.equal(atual.sessaoJogoEstado, "encerrada");
    assert.equal(atual.sessaoJogoExpiraEm, null);
  });
  for (const [acao, estado] of [["pausar", "pausada"], ["encerrar", "encerrada"]]) {
    await t.test(`${acao}: 200, consumo pendente contabilizado e continuidade bloqueada`, async s => {
      const f = await fixture(s), inicio = await iniciar(f);
      s.mock.timers.tick(5000);
      const res = await patch(f, acao, inicio.dados.sessaoId);
      assert.equal(res.status, 200);
      assert.equal(res.dados.estado, estado);
      assert.equal(res.dados.tempoUsadoHoje, 5);
      const antes = await h.ler(f);
      s.mock.timers.tick(20000);
      assert.deepEqual(await patch(f, "heartbeat", inicio.dados.sessaoId), { status: 409, dados: erroSessaoHttp("SESSAO_INATIVA") });
      assert.deepEqual(await h.ler(f), antes);
    });
  }
  for (const acao of ["heartbeat", "pausar", "encerrar"]) {
    for (const [nome, body] of [["body ausente", undefined], ["campo ausente", {}],
      ["null", { sessaoId: null }], ["número", { sessaoId: 42 }],
      ["vazio", { sessaoId: "" }], ["objeto", { sessaoId: {} }]]) {
      await t.test(`${acao}: sessaoId ${nome} recebe o erro padronizado 409`, async s => {
        const f = await fixture(s), antes = await h.ler(f);
        assert.deepEqual(await h.request(f, "PATCH", `/sessao/${acao}`, body), { status: 409, dados: erroSessaoHttp("SESSAO_INVALIDA") });
        assert.deepEqual(await h.ler(f), antes);
      });
    }
    await t.test(`${acao}: criança não manipula sessão de outra`, async s => {
      const f = await fixture(s), outra = await h.outra(s, f);
      const inicio = await iniciar(f), antes = [await h.ler(f), await h.ler(outra)];
      assert.deepEqual(await patch(outra, acao, inicio.dados.sessaoId), { status: 409, dados: erroSessaoHttp("SESSAO_INVALIDA") });
      assert.deepEqual([await h.ler(f), await h.ler(outra)], antes);
    });
  }
  for (const [campos, codigo] of [[{ tempoUsadoHoje: 60 }, "LIMITE_TEMPO_ATINGIDO"],
    [{ permissaoAtiva: false }, "PERMISSAO_INATIVA"]]) {
    await t.test(`início bloqueado por ${codigo} retorna 403`, async s => {
      const f = await fixture(s, campos);
      assert.deepEqual(await iniciar(f), { status: 403, dados: erroSessaoHttp(codigo) });
    });
    await t.test(`heartbeat bloqueado por ${codigo} retorna 403 após encerrar`, async s => {
      const f = await fixture(s, { ...campos, sessaoJogoEstado: "ativa", sessaoJogoId: "ativa-fixture" });
      assert.deepEqual(await patch(f, "heartbeat", "ativa-fixture"), { status: 403, dados: erroSessaoHttp(codigo) });
      assert.equal((await h.ler(f)).sessaoJogoEstado, "encerrada");
    });
  }
  for (const acao of ["inicio", "heartbeat", "pausar", "encerrar"]) {
    await t.test(`${acao}: três conflitos de versão retornam 409 CONFLITO_SESSAO`, async s => {
      const f = await fixture(s, { sessaoJogoEstado: acao === "inicio" ? "encerrada" : "ativa", sessaoJogoId: "ativa-fixture" });
      const contar = h.conflitar(s, f);
      const res = acao === "inicio" ? await iniciar(f) : await patch(f, acao, "ativa-fixture");
      assert.deepEqual(res, { status: 409, dados: erroSessaoHttp("CONFLITO_SESSAO") });
      assert.equal(contar(), 3);
      assert.equal((await h.ler(f)).tempoUsadoHoje, 0);
    });
  }
  await t.test("partida inválida responde 400, inexistente ou alheia responde 404", async s => {
    const f = await fixture(s), outra = await h.outra(s, f);
    assert.deepEqual(await h.request(f, "POST", "/invalido/sessao"), { status: 400, dados: { erro: true, mensagem: "Dados inválidos" } });
    for (const alvo of ["000000000000000000000001", String(outra.jogo._id)]) {
      assert.deepEqual(await h.request(f, "POST", `/${alvo}/sessao`), { status: 404, dados: { erro: true, mensagem: "Registro não encontrado" } });
    }
  });
  await t.test("GET, progresso, histórico e CRUD antigos continuam alcançando os handlers corretos", async s => {
    const f = await fixture(s);
    for (const caminho of ["", `/${f.jogo._id}`, `/${f.jogo._id}/progresso`, `/${f.jogo._id}/historico`])
      assert.equal((await h.request(f, "GET", caminho)).status, 200, caminho);
    const criado = await h.request(f, "POST", "", { perfilJogoId: String(f.perfil._id), nomeJogo: "HTTP #107" });
    assert.equal(criado.status, 201);
    assert.equal((await h.request(f, "PATCH", `/${criado.dados._id}`, { nomeJogo: "Renomeado" })).status, 200);
    assert.equal((await h.request(f, "DELETE", `/${criado.dados._id}`)).status, 204);
  });
}
