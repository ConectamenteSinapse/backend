import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import mongoose from "mongoose";
import Usuario from "../models/usuarioModel.js";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Partida from "../models/jogoSalvoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import usuarioRoutes from "../routes/usuarioRoutes.js";
import criancaRoutes from "../routes/criancaRoutes.js";
import perfilRoutes from "../routes/perfilJogoRoutes.js";
import partidaRoutes from "../routes/jogoSalvoRoutes.js";
import { criarCatalogo } from "./helpers/catalogo.js";
import {
  motivoIgnorarAtlas, validarAtivacao, obterUriTeste, abrirConexaoTeste,
  prepararColecoesTeste, confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";

// Fase 2: HTTP e persistência reais. Sem mocks, dotenv ou import de index.js.
// O DELETE de partida é físico com histórico preservado, conforme contrato
// atual e confirmação explícita do usuário; não cria uma regra de soft delete.
test("#94 Fase 2: ciclo HTTP de personagens e partidas com MongoDB", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async (t) => {
  validarAtivacao(); obterUriTeste();
  const execucao = `issue94-fase2-${randomUUID()}`;
  const segredoAnterior = process.env.JWT_SECRET;
  const emails = new Set();
  const contas = [];
  const registros = new Map([
    [Historico, []], [Partida, []], [Perfil, []], [Resposta, []],
    [Tarefa, []], [Comodo, []], [Crianca, []], [Usuario, []],
  ]);
  const ids = (Model) => registros.get(Model);
  const registrar = (Model, valores) => {
    for (const valor of valores) {
      const id = new mongoose.Types.ObjectId(valor);
      if (!ids(Model).some((v) => v.equals(id))) ids(Model).push(id);
    }
  };
  let conexao, leitura, server, base;
  async function descobrir() {
    confirmarModels(leitura);
    for (const [Model, filtro] of [
      [Usuario, { email: { $in: [...emails] } }],
      [Crianca, () => ({ usuarioId: { $in: ids(Usuario) } })],
      [Perfil, () => ({ criancaId: { $in: ids(Crianca) } })],
      [Partida, () => ({ perfilJogoId: { $in: ids(Perfil) } })],
      [Historico, () => ({ perfilJogoId: { $in: ids(Perfil) } })],
    ]) {
      const docs = await leitura.db.collection(Model.collection.name)
        .find(typeof filtro === "function" ? filtro() : filtro).toArray();
      registrar(Model, docs.map((doc) => doc._id));
    }
  }
  async function estado() {
    await descobrir();
    const resultado = {};
    for (const Model of registros.keys()) resultado[Model.modelName] =
      JSON.parse(JSON.stringify(await leitura.db.collection(Model.collection.name)
        .find({ _id: { $in: ids(Model) } }).sort({ _id: 1 }).toArray()));
    return resultado;
  }
  const igual = (a, b, mensagem) => assert.ok(JSON.stringify(a) === JSON.stringify(b), mensagem);
  const doc = async (Model, id) => (await estado())[Model.modelName].find((d) => d._id === id);
  async function semEscrita(fn) {
    const antes = await estado();
    try { await fn(); }
    finally { igual(await estado(), antes, "Rejeição alterou documentos persistidos"); }
  }
  t.after(async () => {
    const falhas = [];
    try {
      if (server) await new Promise((resolve, reject) => {
        server.close((erro) => erro ? reject(erro) : resolve());
        server.closeIdleConnections();
      });
    } catch { falhas.push(new Error("Falha ao encerrar HTTP da fase 2")); }
    try { if (leitura) await descobrir(); }
    catch { falhas.push(new Error("Descoberta dos IDs HTTP da fase 2 incompleta")); }
    try { if (conexao) await limparRegistrosTeste(conexao, registros, Historico, ids(Perfil)); }
    catch { falhas.push(new Error("Limpeza da fase 2 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const Model of registros.keys()) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: ids(Model) } }), 0, `Resíduos em ${Model.modelName}`);
        for (const [Model, filtro] of [
          [Usuario, { email: { $in: [...emails] } }],
          [Crianca, { usuarioId: { $in: ids(Usuario) } }],
          [Perfil, { criancaId: { $in: ids(Crianca) } }],
          [Partida, { perfilJogoId: { $in: ids(Perfil) } }],
          [Historico, { perfilJogoId: { $in: ids(Perfil) } }],
        ]) assert.equal(await leitura.db.collection(Model.collection.name).countDocuments(filtro), 0);
        t.diagnostic("Fase 2: zero resíduos confirmado por conexão independente, por IDs e chaves de propriedade");
      }
    } catch { falhas.push(new Error("Ausência de resíduos da fase 2 não confirmada")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão principal")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown da fase 2 falhou");
  });
  conexao = await abrirConexaoTeste();
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  confirmarModels(conexao, [...registros.keys()]); confirmarModels(leitura);
  assert.notEqual(conexao.getClient(), leitura.getClient());
  process.env.JWT_SECRET = randomUUID();
  const app = express(); app.use(express.json());
  app.use("/usuarios", usuarioRoutes); app.use("/criancas", criancaRoutes);
  app.use("/perfis-jogo", perfilRoutes); app.use("/jogos-salvos", partidaRoutes);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  async function chamar(method, caminho, body, ator) {
    confirmarModels(conexao, [...registros.keys()]);
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (ator) { assert.ok(ator.token, "JWT deve vir do login HTTP"); headers.Authorization = `Bearer ${ator.token}`; }
    const res = await fetch(base + caminho, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const texto = await res.text();
    if (res.status === 204) {
      assert.equal(texto, ""); assert.equal(res.headers.get("content-type"), null);
      return { status: 204, body: null };
    }
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.ok(!contas.some((c) => texto.includes(c.senha)), "Senha exposta em HTTP");
    assert.ok(!/"(?:senha|password|hash)"\s*:/.test(texto), "Campo privado exposto em HTTP");
    return { status: res.status, body: JSON.parse(texto) };
  }
  function erro(res, status, codigo) {
    assert.equal(res.status, status); assert.equal(res.body.erro, true);
    assert.equal(typeof res.body.mensagem, "string"); assert.ok(res.body.mensagem.trim());
    assert.deepEqual(Object.keys(res.body).sort(), codigo ? ["codigo", "erro", "mensagem"] : ["erro", "mensagem"]);
    if (codigo) assert.equal(res.body.codigo, codigo);
  }
  async function login(c) {
    const res = await chamar("POST", "/usuarios/auth", { email: c.email, senha: c.senha });
    assert.equal(res.status, 200); assert.equal(res.body.usuario.id, c.id);
    c.token = res.body.token;
  }
  async function conta(perfil) {
    const c = { nome: execucao, email: `${execucao}-${contas.length}@example.invalid`, senha: randomUUID(), perfil };
    assert.equal(await leitura.db.collection(Usuario.collection.name).countDocuments({ email: c.email }), 0);
    emails.add(c.email); contas.push(c);
    const res = await chamar("POST", "/usuarios", c);
    assert.equal(res.status, 201); c.id = res.body._id; registrar(Usuario, [c.id]);
    await login(c);
    if (perfil === "crianca") {
      const perfilRes = await chamar("POST", "/criancas", {}, c);
      assert.equal(perfilRes.status, 201); c.criancaId = perfilRes.body._id;
      registrar(Crianca, [c.criancaId]);
    }
    return c;
  }
  async function personagem(c, nome, extras = {}) {
    const res = await chamar("POST", "/perfis-jogo", { nomeAvatar: nome, imagemAvatar: " avatar.png ", ...extras }, c);
    assert.equal(res.status, 201); registrar(Perfil, [res.body._id]);
    assert.ok(await doc(Perfil, res.body._id), "Personagem não persistiu na conexão independente");
    return res.body;
  }
  async function partida(c, personagemId, nome, extras = {}) {
    const res = await chamar("POST", "/jogos-salvos", { perfilJogoId: personagemId, nomeJogo: nome, ...extras }, c);
    assert.equal(res.status, 201); registrar(Partida, [res.body._id]);
    assert.ok(await doc(Partida, res.body._id), "Partida não persistiu na conexão independente");
    return res.body;
  }
  let a, b, responsavel, pa, pa2, pb, ja, ja2, ja3, jb, catalogo;
  const perfilUrl = (id) => `/perfis-jogo/${id}`;
  const jogoUrl = (id) => `/jogos-salvos/${id}`;
  await t.test("01 preparar duas crianças e responsável com cadastro/login HTTP reais", async () => {
    a = await conta("crianca"); b = await conta("crianca"); responsavel = await conta("responsavel");
    const salvo = await estado(); assert.equal(salvo.Usuario.length, 3); assert.equal(salvo.Crianca.length, 2);
    t.diagnostic("Fase 2: duas conexões em conectamente_testes e JWTs obtidos por login real");
  });
  await t.test("02 listas iniciais de personagens e partidas são vazias", async () => {
    for (const c of [a, b]) for (const url of ["/perfis-jogo", "/jogos-salvos"]) {
      const res = await chamar("GET", url, undefined, c);
      assert.equal(res.status, 200); assert.deepEqual(res.body, []);
    }
  });
  await t.test("03 criar personagem com defaults, normalização e dono seguro", async () => {
    pa = await personagem(a, "  Primeiro  ", { criancaId: b.criancaId, estrelasTotal: 999, nivelAtual: 99, status: "arquivado" });
    const salvo = await doc(Perfil, pa._id);
    assert.equal(salvo.criancaId, a.criancaId); assert.equal(salvo.status, "ativo");
    assert.equal(salvo.estrelasTotal, 0); assert.equal(salvo.nivelAtual, 1);
    assert.equal(salvo.nomeAvatar, "Primeiro"); assert.equal(salvo.imagemAvatar, "avatar.png");
  });
  await t.test("04 criar segundo personagem da mesma criança e personagem de outra criança", async () => {
    pa2 = await personagem(a, "Segundo"); pb = await personagem(b, "Alheio");
  });
  await t.test("05 listagem real filtra ativos do dono e consulta por ID funciona", async () => {
    for (const [c, esperados] of [[a, [pa._id, pa2._id]], [b, [pb._id]]]) {
      const lista = await chamar("GET", "/perfis-jogo", undefined, c);
      assert.equal(lista.status, 200); assert.deepEqual(lista.body.map((p) => p._id).sort(), esperados.sort());
    }
    const res = await chamar("GET", perfilUrl(pa._id), undefined, a);
    assert.equal(res.status, 200); assert.equal(res.body.nomeAvatar, "Primeiro");
  });
  await t.test("06 PATCH do personagem altera somente nome/imagem persistidos", async () => {
    const antes = await doc(Perfil, pa._id);
    const res = await chamar("PATCH", perfilUrl(pa._id), { nomeAvatar: "  Atualizado  ", imagemAvatar: " nova.png ",
      criancaId: b.criancaId, estrelasTotal: 999, nivelAtual: 99, status: "arquivado", criadoEm: "2000-01-01" }, a);
    assert.equal(res.status, 200);
    igual(await doc(Perfil, pa._id), { ...antes, nomeAvatar: "Atualizado", imagemAvatar: "nova.png" }, "PATCH alterou campo protegido");
    const consulta = await chamar("GET", perfilUrl(pa._id), undefined, a);
    assert.equal(consulta.body.nomeAvatar, "Atualizado"); assert.equal(consulta.body.imagemAvatar, "nova.png");
  });
  await t.test("07 PATCH inválido não persiste alterações parciais do personagem", () => semEscrita(async () => {
    erro(await chamar("PATCH", perfilUrl(pa._id), { nomeAvatar: "Não salvar", imagemAvatar: " " }, a), 400);
  }));
  await t.test("08 outra criança não lê, edita ou arquiva personagem alheio", () => semEscrita(async () => {
    for (const method of ["GET", "PATCH", "DELETE"]) erro(await chamar(method, perfilUrl(pa._id), method === "PATCH" ? { nomeAvatar: "Intruso" } : undefined, b), 404);
  }));
  await t.test("09 criar partida e confirmar defaults, proprietário e normalização", async () => {
    ja = await partida(a, pa._id, "  Partida principal  ", { estrelasTotal: 999, dificuldade: "dificil", comodoId: new mongoose.Types.ObjectId() });
    const salvo = await doc(Partida, ja._id);
    assert.equal(salvo.perfilJogoId, pa._id); assert.equal(salvo.nomeJogo, "Partida principal");
    assert.equal(salvo.estrelasTotal, 0); assert.equal(salvo.dificuldade, "facil");
    assert.equal(salvo.comodoId, null); assert.equal(salvo.tarefaId, null);
  });
  await t.test("10 múltiplas partidas por personagem e partidas de outros personagens coexistem", async () => {
    ja2 = await partida(a, pa._id, "Outra do primeiro"); ja3 = await partida(a, pa2._id, "Do segundo"); jb = await partida(b, pb._id, "Da outra criança");
    assert.notEqual(ja._id, ja2._id);
  });
  await t.test("11 listagem e GET usam populate real e isolam crianças/personagens", async () => {
    for (const [c, esperados] of [[a, [ja._id, ja2._id, ja3._id]], [b, [jb._id]]]) {
      const res = await chamar("GET", "/jogos-salvos", undefined, c);
      assert.equal(res.status, 200); assert.deepEqual(res.body.map((j) => j._id).sort(), esperados.sort());
      for (const j of res.body) {
        assert.equal(typeof j.perfilJogoId, "object");
        const salvo = await doc(Perfil, j.perfilJogoId._id);
        assert.equal(j.perfilJogoId.nomeAvatar, salvo.nomeAvatar); assert.equal(j.perfilJogoId.imagemAvatar, salvo.imagemAvatar);
      }
    }
    const res = await chamar("GET", jogoUrl(ja._id), undefined, a);
    assert.equal(res.status, 200); assert.equal(res.body.perfilJogoId._id, pa._id); assert.equal(res.body.perfilJogoId.criancaId, a.criancaId);
  });
  await t.test("12 PATCH da partida não aceita troca de personagem, estrelas ou datas", async () => {
    const antes = await doc(Partida, ja._id);
    const res = await chamar("PATCH", jogoUrl(ja._id), { nomeJogo: "  Retomar  ", perfilJogoId: pa2._id,
      estrelasTotal: 999, criadoEm: "2000-01-01", atualizadoEm: "2000-01-01" }, a);
    assert.equal(res.status, 200);
    const salvo = await doc(Partida, ja._id);
    igual(salvo, { ...antes, nomeJogo: "Retomar", atualizadoEm: salvo.atualizadoEm }, "PATCH alterou campo protegido da partida");
    assert.ok(new Date(salvo.atualizadoEm) >= new Date(antes.atualizadoEm));
  });
  await t.test("13 salvar posição permitida e confirmar persistência em outra conexão", async () => {
    catalogo = await criarCatalogo(undefined, { comodos: ids(Comodo), tarefas: ids(Tarefa), respostas: ids(Resposta) }, execucao);
    const posicao = { comodoId: String(catalogo.quarto._id), tarefaId: String(catalogo.quarto.tarefas[0]._id), dificuldade: "facil" };
    const res = await chamar("PATCH", jogoUrl(ja._id), posicao, a);
    assert.equal(res.status, 200);
    const salvo = await doc(Partida, ja._id);
    for (const [campo, valor] of Object.entries(posicao)) assert.equal(salvo[campo], valor);
    assert.equal((await doc(Partida, ja2._id)).tarefaId, null);
    assert.equal((await doc(Partida, ja3._id)).comodoId, null);
  });
  await t.test("14 retomar após novo login e reabertura da conexão de leitura", async () => {
    await leitura.close(); leitura = await abrirConexaoTeste({ leitura: true });
    await login(a);
    const res = await chamar("GET", jogoUrl(ja._id), undefined, a);
    assert.equal(res.status, 200); assert.equal(res.body.nomeJogo, "Retomar");
    assert.equal(res.body.tarefaId, String(catalogo.quarto.tarefas[0]._id));
    assert.equal(res.body.comodoId, String(catalogo.quarto._id)); assert.equal(res.body.dificuldade, "facil");
    const salvo = await doc(Partida, ja._id);
    for (const campo of ["nomeJogo", "comodoId", "tarefaId", "dificuldade", "estrelasTotal", "atualizadoEm"])
      assert.equal(res.body[campo], salvo[campo]);
    assert.equal(res.body.perfilJogoId._id, salvo.perfilJogoId);
  });
  await t.test("15 outra criança não lê, altera ou exclui partida alheia", () => semEscrita(async () => {
    for (const method of ["GET", "PATCH", "DELETE"]) erro(await chamar(method, jogoUrl(ja._id), method === "PATCH" ? { nomeJogo: "Intruso" } : undefined, b), 404);
    erro(await chamar("POST", "/jogos-salvos", { perfilJogoId: pb._id, nomeJogo: "Intruso" }, a), 404);
  }));
  await t.test("16 JWT ausente e perfil responsável não acessam operações da fase", () => semEscrita(async () => {
    for (const [method, caminho, body] of [
      ["POST", "/perfis-jogo", { nomeAvatar: "Novo", imagemAvatar: "a.png" }], ["GET", "/perfis-jogo"],
      ["GET", perfilUrl(pa._id)], ["PATCH", perfilUrl(pa._id), { nomeAvatar: "Novo" }], ["DELETE", perfilUrl(pa._id)],
      ["POST", "/jogos-salvos", { perfilJogoId: pa._id, nomeJogo: "Novo" }], ["GET", "/jogos-salvos"],
      ["GET", jogoUrl(ja._id)], ["PATCH", jogoUrl(ja._id), { nomeJogo: "Novo" }], ["DELETE", jogoUrl(ja._id)],
    ]) {
      erro(await chamar(method, caminho, body), 401);
      erro(await chamar(method, caminho, body, responsavel), 403);
    }
  }));
  await t.test("17 IDs inválidos/inexistentes retornam 400/404 sem escrita", () => semEscrita(async () => {
    for (const prefixo of ["/perfis-jogo", "/jogos-salvos"]) {
      erro(await chamar("GET", `${prefixo}/invalido`, undefined, a), 400);
      erro(await chamar("GET", `${prefixo}/${new mongoose.Types.ObjectId()}`, undefined, a), 404);
    }
  }));
  await t.test("18 posição inconsistente não salva nem o nome parcialmente alterado", () => semEscrita(async () => {
    erro(await chamar("PATCH", jogoUrl(ja._id), { nomeJogo: "Não salvar", tarefaId: String(catalogo.banheiro.tarefas[0]._id) }, a), 400);
  }));
  await t.test("19 bloqueios de posição preservam partida e codigo de progressão", () => semEscrita(async () => {
    for (const [body, codigo] of [
      [{ dificuldade: "medio" }, "DIFICULDADE_BLOQUEADA"],
      [{ tarefaId: String(catalogo.quarto.tarefas[1]._id) }, "TAREFA_FORA_DA_ORDEM"],
      [{ comodoId: String(catalogo.banheiro._id), tarefaId: String(catalogo.banheiro.tarefas[0]._id) }, "COMODO_BLOQUEADO"],
    ]) erro(await chamar("PATCH", jogoUrl(ja._id), body, a), 403, codigo);
  }));
  await t.test("20 preparar históricos sentinela apenas para verificar preservação", async () => {
    for (const jogo of [ja, ja2]) {
      const tarefa = catalogo.quarto.tarefas[0];
      const h = new Historico({ perfilJogoId: pa._id, jogoSalvoId: jogo._id, criancaId: a.criancaId,
        comodoId: tarefa.comodoId, tarefaId: tarefa._id, respostaEscolhidaId: tarefa.correta._id,
        dificuldade: "facil", acertou: true, tentativa: 1, pontuacaoGanha: 1 });
      registrar(Historico, [h._id]); await h.save();
    }
    assert.equal((await estado()).HistoricoJogo.length, 2);
  });
  await t.test("21 DELETE de partida retorna 204, remove somente ela e preserva históricos", async () => {
    const antes = await estado();
    const res = await chamar("DELETE", jogoUrl(ja._id), undefined, a);
    assert.equal(res.status, 204);
    const esperado = structuredClone(antes);
    esperado.JogoSalvo = esperado.JogoSalvo.filter((j) => j._id !== ja._id);
    igual(await estado(), esperado, "DELETE não preservou demais documentos e históricos");
    assert.equal(await doc(Partida, ja._id), undefined);
  });
  await t.test("22 partida excluída sai da lista e GET/DELETE repetido retornam 404", () => semEscrita(async () => {
    erro(await chamar("GET", jogoUrl(ja._id), undefined, a), 404);
    erro(await chamar("DELETE", jogoUrl(ja._id), undefined, a), 404);
    const lista = await chamar("GET", "/jogos-salvos", undefined, a);
    assert.equal(lista.status, 200); assert.deepEqual(lista.body.map((j) => j._id).sort(), [ja2._id, ja3._id].sort());
  }));
  await t.test("23 exclusão não afeta partidas irmãs nem a outra criança", async () => {
    for (const [c, jogo] of [[a, ja2], [a, ja3], [b, jb]]) {
      const res = await chamar("GET", jogoUrl(jogo._id), undefined, c);
      assert.equal(res.status, 200); assert.equal(res.body._id, jogo._id);
    }
  });
  await t.test("24 DELETE de personagem arquiva sem remover partidas ou históricos", async () => {
    const antes = await estado();
    assert.equal((await chamar("DELETE", perfilUrl(pa._id), undefined, a)).status, 204);
    const esperado = structuredClone(antes);
    esperado.PerfilJogo.find((p) => p._id === pa._id).status = "arquivado";
    igual(await estado(), esperado, "Arquivamento alterou outros dados");
    assert.ok(await doc(Partida, ja2._id));
  });
  await t.test("25 personagem arquivado sai da lista e bloqueia consulta/edição/novo save", () => semEscrita(async () => {
    const lista = await chamar("GET", "/perfis-jogo", undefined, a);
    assert.equal(lista.status, 200); assert.deepEqual(lista.body.map((p) => p._id), [pa2._id]);
    for (const method of ["GET", "PATCH", "DELETE"]) erro(await chamar(method, perfilUrl(pa._id), method === "PATCH" ? { nomeAvatar: "Novo" } : undefined, a), 404);
    erro(await chamar("POST", "/jogos-salvos", { perfilJogoId: pa._id, nomeJogo: "Novo" }, a), 404);
  }));
  await t.test("26 partidas de personagem arquivado ficam inacessíveis mas persistem", () => semEscrita(async () => {
    const lista = await chamar("GET", "/jogos-salvos", undefined, a);
    assert.equal(lista.status, 200); assert.deepEqual(lista.body.map((j) => j._id), [ja3._id]);
    for (const method of ["GET", "PATCH", "DELETE"]) erro(await chamar(method, jogoUrl(ja2._id), method === "PATCH" ? { nomeJogo: "Novo" } : undefined, a), 404);
    assert.ok(await doc(Partida, ja2._id));
    assert.equal((await estado()).HistoricoJogo.length, 2);
  }));
  await t.test("27 personagem ativo restante e outra criança continuam operacionais", async () => {
    for (const [c, p, jogo] of [[a, pa2, ja3], [b, pb, jb]]) {
      assert.equal((await chamar("GET", perfilUrl(p._id), undefined, c)).status, 200);
      assert.equal((await chamar("GET", jogoUrl(jogo._id), undefined, c)).status, 200);
    }
    t.diagnostic("Fase 2: ciclo HTTP, populate, retomada, isolamento e preservação confirmados em conexão independente");
  });
});
