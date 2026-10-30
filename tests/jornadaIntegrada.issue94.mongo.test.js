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
import Responsavel from "../models/responsavelModel.js";
import responsavelRoutes from "../routes/responsavelRoutes.js";
import comodoRoutes from "../routes/comodoRoutes.js";
import tarefaRoutes from "../routes/tarefaRoutes.js";
import respostaRoutes from "../routes/respostaRoutes.js";
import historicoRoutes from "../routes/historicoJogoRoutes.js";
import progressoRoutes from "../routes/progressoRoutes.js";
import consultaRoutes from "../routes/historicoConsultaRoutes.js";
import { conferirBloqueioPermissao } from "./helpers/sessaoRespostaMongo.js";
import {
  motivoIgnorarAtlas, validarAtivacao, obterUriTeste, abrirConexaoTeste,
  prepararColecoesTeste, confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";

// Jornada real: sem mocks, sem index.js e sem históricos inseridos diretamente.
test("#94 Fase 3: jornada integrada do jogo por HTTP e MongoDB", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async (t) => {
  validarAtivacao(); obterUriTeste();
  const execucao = `issue94-fase3-${randomUUID()}`;
  const segredoAnterior = process.env.JWT_SECRET;
  const emails = new Set();
  const contas = [];
  const registros = new Map([
    [Historico, []], [Partida, []], [Perfil, []], [Resposta, []],
    [Tarefa, []], [Comodo, []], [Crianca, []], [Responsavel, []], [Usuario, []],
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
      [Responsavel, () => ({ usuarioId: { $in: ids(Usuario) } })],
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
    } catch { falhas.push(new Error("Falha ao encerrar HTTP da fase 3")); }
    try { if (leitura) await descobrir(); }
    catch { falhas.push(new Error("Descoberta dos IDs HTTP da fase 3 incompleta")); }
    try { if (conexao) await limparRegistrosTeste(conexao, registros, Historico, ids(Perfil)); }
    catch { falhas.push(new Error("Limpeza da fase 3 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const Model of registros.keys()) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: ids(Model) } }), 0, `Resíduos em ${Model.modelName}`);
        for (const [Model, filtro] of [
          [Usuario, { email: { $in: [...emails] } }],
          [Crianca, { usuarioId: { $in: ids(Usuario) } }],
          [Responsavel, { usuarioId: { $in: ids(Usuario) } }],
          [Perfil, { criancaId: { $in: ids(Crianca) } }],
          [Partida, { perfilJogoId: { $in: ids(Perfil) } }],
          [Historico, { perfilJogoId: { $in: ids(Perfil) } }],
        ]) assert.equal(await leitura.db.collection(Model.collection.name).countDocuments(filtro), 0);
        t.diagnostic("Fase 3: zero resíduos confirmado por conexão independente, por IDs e chaves de propriedade");
      }
    } catch { falhas.push(new Error("Ausência de resíduos da fase 3 não confirmada")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão principal")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown da fase 3 falhou");
  });
  conexao = await abrirConexaoTeste();
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  confirmarModels(conexao, [...registros.keys()]); confirmarModels(leitura);
  assert.notEqual(conexao.getClient(), leitura.getClient());
  process.env.JWT_SECRET = randomUUID();
  const app = express(); app.use(express.json());
  app.use("/usuarios", usuarioRoutes);
  app.use("/comodos", comodoRoutes); app.use("/tarefas", tarefaRoutes); app.use("/respostas", respostaRoutes);
  app.use("/criancas", criancaRoutes); app.use("/responsaveis", responsavelRoutes);
  app.use("/historico-jogo", historicoRoutes);
  app.use("/criancas", progressoRoutes); app.use("/criancas", consultaRoutes);
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
    if (perfil === "responsavel") {
      const perfilRes = await chamar("POST", "/responsaveis", {}, c);
      assert.equal(perfilRes.status, 201); c.responsavelId = perfilRes.body._id;
      registrar(Responsavel, [c.responsavelId]);
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
  let a, b, responsavel, pa, pb, ja, ja2, jb, catalogo, t1, t2, t3;
  const sessoes = new Map();
  async function prepararSessao(c, jogo) {
    if (c.sessao && (c.sessao.partida !== jogo._id || new Date(c.sessao.expiraEm).getTime() <= Date.now())) {
      const fim = await chamar("PATCH", "/jogos-salvos/sessao/encerrar", { sessaoId: c.sessao.id }, c);
      assert.equal(fim.status, 200); c.sessao = null;
    }
    if (!c.sessao) {
      const inicio = await chamar("POST", `/jogos-salvos/${jogo._id}/sessao`, {}, c);
      assert.equal(inicio.status, 201);
      c.sessao = { partida: jogo._id, id: inicio.body.sessaoId, expiraEm: inicio.body.expiraEm };
      sessoes.set(jogo._id, c.sessao.id);
    } else if (new Date(c.sessao.expiraEm).getTime() - Date.now() < 10000) {
      const heartbeat = await chamar("PATCH", "/jogos-salvos/sessao/heartbeat", { sessaoId: c.sessao.id }, c);
      assert.equal(heartbeat.status, 200); c.sessao.expiraEm = heartbeat.body.expiraEm;
    }
  }
  const enviadas = [];
  const get = async (c, caminho) => {
    const res = await chamar("GET", caminho, undefined, c);
    assert.equal(res.status, 200); return res.body;
  };
  const permitir = async (c, valor) => {
    const res = await chamar("PATCH", `/responsaveis/minhas-criancas/${c.criancaId}/permissao`, { permissaoAtiva: valor }, responsavel);
    assert.equal(res.status, 200); assert.equal(res.body.permissaoAtiva, valor);
    assert.equal((await doc(Crianca, c.criancaId)).permissaoAtiva, valor);
  };
  function semCorreta(valor) {
    if (!valor || typeof valor !== "object") return;
    assert.ok(!Object.hasOwn(valor, "correta"), "Consulta do jogo revelou o gabarito");
    for (const item of Object.values(valor)) semCorreta(item);
  }
  async function inserirCatalogo(Model, dados) {
    assert.ok([Comodo, Tarefa, Resposta].includes(Model), "Inserção direta restrita ao catálogo mínimo");
    const d = new Model(dados); registrar(Model, [d._id]); await d.save(); return d;
  }
  async function catalogoMinimo() {
    const anterior = await Comodo.findOne().sort({ ordem: 1 }).lean();
    const inicio = Math.min(0, anterior?.ordem ?? 0) - 10;
    const comodos = [];
    for (let i = 0; i < 2; i++) comodos.push(await inserirCatalogo(Comodo, {
      nome: `${execucao}-${i}`, descricao: execucao, imagemCenario: "cenario.png",
      ordem: inicio + i, dificuldadesDisponiveis: ["facil", "medio", "dificil"], ativo: true,
    }));
    const tarefas = [];
    for (const [indice, ordem] of [[0, 1], [0, 2], [1, 1]]) {
      const tarefa = await inserirCatalogo(Tarefa, { comodoId: comodos[indice]._id, ordem,
        titulo: `Atividade ${indice}-${ordem}`, enunciado: "Escolha", descricao: execucao,
        imagemObjeto: "objeto.png", audioEnunciado: "enunciado.mp3",
        posicao: { x: 0, y: 0, largura: 1, altura: 1 }, ativo: true });
      for (const [ordemResposta, correta] of [[1, true], [2, false]]) await inserirCatalogo(Resposta, {
        tarefaId: tarefa._id, ordem: ordemResposta, correta, texto: `Alternativa ${ordemResposta}`,
        imagem: `alternativa-${ordemResposta}.png`, audio: `alternativa-${ordemResposta}.mp3`,
      });
      tarefas.push(tarefa);
    }
    return { comodos, tarefas };
  }
  function bodyResposta(p, j, tarefa, acertou = true, dificuldade = "facil") {
    // A posição da alternativa é controlada pela fixture, sem expor/ler correta
    // no cliente. Todos os IDs escolhidos vêm das respostas HTTP da jornada.
    const alternativa = tarefa.alternativas.find((r) => r.ordem === (acertou ? 1 : 2));
    assert.ok(alternativa);
    return { perfilJogoId: p._id, jogoSalvoId: j._id, tarefaId: tarefa._id,
      respostaEscolhidaId: alternativa._id, dificuldade, sessaoId: sessoes.get(j._id) };
  }
  async function responder(c, p, j, tarefa, acertou, dificuldade = "facil", tentativa = 1) {
    await prepararSessao(c, j); // Preparação explícita, sem alterar os snapshots das rejeições.
    const body = bodyResposta(p, j, tarefa, acertou, dificuldade);
    const pontos = acertou ? { facil: 1, medio: 2, dificil: 3 }[dificuldade] : 0;
    const res = await chamar("POST", "/historico-jogo/responder", body, c);
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { acertou, tentativa, pontuacaoGanha: pontos, dificuldade });
    // sessaoId autoriza a operação; não é um campo do HistoricoJogoModel.
    const { sessaoId, ...dadosHistorico } = body;
    assert.equal(typeof sessaoId, "string");
    enviadas.push({ ...dadosHistorico, criancaId: c.criancaId, acertou, tentativa, pontuacaoGanha: pontos });
    const banco = await estado();
    const h = banco.HistoricoJogo.find((d) => d.jogoSalvoId === j._id && d.tarefaId === tarefa._id &&
      d.dificuldade === dificuldade && d.tentativa === tentativa);
    assert.ok(h, "Histórico não visível por conexão independente após commit");
    for (const [campo, valor] of Object.entries(enviadas.at(-1))) assert.equal(h[campo], valor);
    assert.equal(h.comodoId, tarefa.comodoId);
    const salvo = banco.JogoSalvo.find((d) => d._id === j._id);
    assert.equal(salvo.estrelasTotal, enviadas.filter((e) => e.jogoSalvoId === j._id).reduce((s, e) => s + e.pontuacaoGanha, 0));
    assert.equal(salvo.tarefaId, tarefa._id); assert.equal(salvo.comodoId, tarefa.comodoId);
    assert.equal(salvo.dificuldade, dificuldade);
    const perfil = banco.PerfilJogo.find((d) => d._id === p._id);
    assert.equal(perfil.estrelasTotal, 0); assert.equal(perfil.nivelAtual, 1);
    assert.ok(perfil.ultimaInteracaoEm); assert.ok(salvo.atualizadoEm);
  }
  const numeros = (tentativas, acertos, erros, conclusoes, estrelas, distintas, percentual) =>
    ({ tentativas, acertos, erros, conclusoes, estrelas, distintas, percentual });
  const ultima = (linhas) => linhas.reduce((maior, h) => !maior || h.dataHora > maior ? h.dataHora : maior, null);
  function conferirHistorico(body, linhas) {
    assert.equal(body.totalTentativas, linhas.length);
    assert.deepEqual(body.tentativas.map((h) => h._id).sort(), linhas.map((h) => h._id).sort());
    for (const h of body.tentativas) {
      const banco = linhas.find((d) => d._id === h._id);
      for (const campo of ["perfilJogoId", "jogoSalvoId", "comodoId", "tarefaId", "respostaEscolhidaId", "dificuldade", "acertou", "tentativa", "pontuacaoGanha", "dataHora"])
        assert.equal(h[campo], banco[campo]);
    }
    assert.ok(body.tentativas.every((h, i, lista) => i === 0 || lista[i - 1].dataHora >= h.dataHora));
  }
  function conferirProgresso(body, linhas, n) {
    assert.deepEqual(body.resumo, { totalTentativas: n.tentativas, acertos: n.acertos, erros: n.erros,
      tarefasConcluidas: n.conclusoes, ultimaInteracao: ultima(linhas) });
    assert.equal(body.tarefas.length, n.conclusoes === 0 && n.tentativas > 0 ? 1 : n.conclusoes);
  }
  async function consultas(c, j, nPartida, nGeral = nPartida) {
    const antes = await estado();
    const porCrianca = antes.HistoricoJogo.filter((h) => h.criancaId === c.criancaId);
    const porPartida = porCrianca.filter((h) => h.jogoSalvoId === j._id);
    const partidaHTTP = await get(c, `/jogos-salvos/${j._id}`);
    const partidaBanco = antes.JogoSalvo.find((d) => d._id === j._id);
    for (const campo of ["comodoId", "tarefaId", "dificuldade", "estrelasTotal", "atualizadoEm"])
      assert.equal(partidaHTTP[campo], partidaBanco[campo]);
    const hPartida = await get(c, `/jogos-salvos/${j._id}/historico`);
    const pPartida = await get(c, `/jogos-salvos/${j._id}/progresso`);
    const hGeral = await get(c, `/criancas/${c.id}/historico`);
    const pGeral = await get(c, `/criancas/${c.id}`);
    const desempenho = await get(c, `/criancas/${c.id}/resumo-desempenho`);
    conferirHistorico(hPartida, porPartida); conferirHistorico(hGeral, porCrianca);
    assert.equal(hPartida.jogoSalvoId, j._id); assert.equal(pPartida.jogoSalvoId, j._id);
    assert.equal(hGeral.criancaId, c.id); assert.equal(pGeral.criancaId, c.id);
    assert.equal(desempenho.criancaId, c.criancaId);
    conferirProgresso(pPartida, porPartida, nPartida); conferirProgresso(pGeral, porCrianca, nGeral);
    assert.equal(pPartida.estrelasTotal, nPartida.estrelas);
    assert.deepEqual(desempenho.resumo, { totalTentativas: nGeral.tentativas, acertos: nGeral.acertos,
      erros: nGeral.erros, percentualAcertos: nGeral.percentual, totalEstrelas: nGeral.estrelas,
      tarefasConcluidas: nGeral.distintas, ultimaInteracao: ultima(porCrianca) });
    semCorreta([hPartida, pPartida, hGeral, pGeral, desempenho]);
    igual(await estado(), antes, "Consultas alteraram estado persistido");
    return { hPartida, pPartida, hGeral, pGeral, desempenho };
  }

  await t.test("01 cadastro, login e vínculo reais para criança, responsável e outra criança", async () => {
    responsavel = await conta("responsavel"); a = await conta("crianca"); b = await conta("crianca");
    for (const c of [a, b]) {
      const res = await chamar("POST", "/responsaveis/vincular-crianca", { email: c.email, senha: c.senha }, responsavel);
      assert.equal(res.status, 200); assert.equal(res.body.responsavelId, responsavel.responsavelId);
    }
  });
  await t.test("02 criar personagens e partidas pelos endpoints reais", async () => {
    pa = await personagem(a, "Jogador A"); pb = await personagem(b, "Jogador B");
    ja = await partida(a, pa._id, "Principal"); ja2 = await partida(a, pa._id, "Independente"); jb = await partida(b, pb._id, "Alheia");
  });
  await t.test("03 preparar dois cômodos, três tarefas compartilhadas pelos níveis e seis alternativas", async () => {
    catalogo = await catalogoMinimo();
    assert.equal(ids(Comodo).length, 2); assert.equal(ids(Tarefa).length, 3); assert.equal(ids(Resposta).length, 6);
  });
  await t.test("04 ativar e consultar a permissão de jogar", async () => {
    await permitir(a, true);
    await prepararSessao(a, ja);
    const perfil = await get(a, "/criancas/meu-perfil");
    assert.equal(perfil.permissaoAtiva, true);
  });
  await t.test("05 consultar cômodos e usar seus IDs HTTP", async () => {
    const lista = await get(a, "/comodos"); semCorreta(lista);
    catalogo.http = catalogo.comodos.map((c) => {
      const obtido = lista.find((d) => d._id === String(c._id));
      assert.ok(obtido); assert.equal(obtido.ativo, true); return obtido;
    });
    const detalhe = await get(a, `/comodos/${catalogo.http[0]._id}`);
    assert.equal(detalhe._id, catalogo.http[0]._id); semCorreta(detalhe);
  });
  await t.test("06 consultar tarefas por cômodo, global e por ID", async () => {
    const listas = [];
    for (const c of catalogo.http) {
      const tarefas = await get(a, `/comodos/${c._id}/tarefas`); semCorreta(tarefas);
      assert.ok(tarefas.every((d) => d.comodoId === c._id));
      listas.push(tarefas.sort((x, y) => x.ordem - y.ordem));
    }
    [t1, t2] = listas[0]; [t3] = listas[1];
    assert.equal(listas[0].length, 2); assert.equal(listas[1].length, 1);
    assert.ok(listas.flat().every(t => !Object.hasOwn(t, "dificuldade")));
    const detalhe = await get(a, `/tarefas/${t1._id}`); assert.equal(detalhe.audioEnunciado, "enunciado.mp3");
    const todas = await get(a, "/tarefas"); semCorreta([detalhe, todas]);
    assert.ok(todas.some((tarefa) => tarefa._id === t1._id));
  });
  await t.test("07 alternativas globais, por tarefa e por ID ocultam correta e preservam mídia", async () => {
    for (const tarefa of [t1, t2, t3]) {
      tarefa.alternativas = await get(a, `/tarefas/${tarefa._id}/respostas`);
      assert.equal(tarefa.alternativas.length, 2);
      assert.deepEqual(tarefa.alternativas.map((r) => r.ordem), [1, 2]);
      assert.ok(tarefa.alternativas.every((r) => r.tarefaId === tarefa._id && r.imagem && r.audio));
      semCorreta(tarefa.alternativas);
      const detalhe = await get(a, `/respostas/${tarefa.alternativas[0]._id}`);
      assert.equal(detalhe.tarefaId, tarefa._id); semCorreta(detalhe);
    }
    const todas = await get(a, "/respostas"); semCorreta(todas);
    assert.ok(todas.some((r) => r._id === t1.alternativas[0]._id));
  });
  await t.test("08 cinco consultas iniciais têm indicadores zerados e última interação null", async () => {
    const res = await consultas(a, ja, numeros(0, 0, 0, 0, 0, 0, 0));
    assert.deepEqual(res.desempenho.desempenhoPorComodo, []);
  });
  await t.test("09 ordem, dificuldade e cômodo bloqueados preservam codigo e estado", () => semEscrita(async () => {
    for (const [tarefa, dificuldade, codigo] of [[t2, "facil", "TAREFA_FORA_DA_ORDEM"],
      [t1, "medio", "DIFICULDADE_BLOQUEADA"], [t3, "facil", "COMODO_BLOQUEADO"]])
      erro(await chamar("POST", "/historico-jogo/responder", bodyResposta(pa, ja, tarefa, true, dificuldade), a), 403, codigo);
  }));
  await t.test("10 resposta incorreta registra tentativa 1 e zero pontos após commit", () => responder(a, pa, ja, t1, false));
  await t.test("11 erro aparece nos cinco indicadores sem concluir tarefa", async () => {
    await consultas(a, ja, numeros(1, 0, 1, 0, 0, 0, 0));
  });
  await t.test("12 erro não libera a próxima tarefa", () => semEscrita(async () => {
    erro(await chamar("POST", "/historico-jogo/responder", bodyResposta(pa, ja, t2), a), 403, "TAREFA_FORA_DA_ORDEM");
  }));
  await t.test("13 resposta correta na mesma tarefa registra tentativa 2 e um ponto", () => responder(a, pa, ja, t1, true, "facil", 2));
  await t.test("14 histórico, progresso e resumo concordam sobre erro/acerto e última interação", async () => {
    const res = await consultas(a, ja, numeros(2, 1, 1, 1, 1, 1, 50));
    assert.deepEqual(res.pPartida.tarefas.map(({ ultimaInteracao, ...d }) => d), [{ tarefaId: t1._id,
      dificuldade: "facil", concluida: true, tentativas: 2, acertos: 1, erros: 1 }]);
  });
  await t.test("15 acerto repetido aumenta tentativas/pontos sem duplicar conclusão", async () => {
    await responder(a, pa, ja, t1, true, "facil", 3);
    await consultas(a, ja, numeros(3, 2, 1, 1, 2, 1, 66.67));
  });
  await t.test("16 acerto da segunda tarefa conclui fácil e atualiza posição", async () => {
    await responder(a, pa, ja, t2, true);
    await consultas(a, ja, numeros(4, 3, 1, 2, 3, 2, 75));
  });
  await t.test("17 médio reutiliza os mesmos IDs; progresso distingue dificuldade e resumo conta duas tarefas", async () => {
    for (const tarefa of [t1, t2]) await responder(a, pa, ja, tarefa, true, "medio");
    await consultas(a, ja, numeros(6, 5, 1, 4, 7, 2, 83.33));
  });
  await t.test("18 próximo cômodo segue bloqueado enquanto difícil está pendente", () => semEscrita(async () => {
    erro(await chamar("POST", "/historico-jogo/responder", bodyResposta(pa, ja, t3), a), 403, "COMODO_BLOQUEADO");
  }));
  await t.test("19 concluir difícil libera o segundo cômodo por respostas HTTP reais", async () => {
    for (const tarefa of [t1, t2]) await responder(a, pa, ja, tarefa, true, "dificil");
    await responder(a, pa, ja, t3, true);
  });
  await t.test("20 nove tentativas: sete conclusões por dificuldade e três tarefas distintas", async () => {
    const res = await consultas(a, ja, numeros(9, 8, 1, 7, 14, 3, 88.89));
    assert.deepEqual(res.desempenho.desempenhoPorComodo.sort((x, y) => x.comodoId.localeCompare(y.comodoId)), [
      { comodoId: t1.comodoId, tentativas: 8, acertos: 7, erros: 1, percentualAcertos: 87.5, tarefasConcluidas: 2 },
      { comodoId: t3.comodoId, tentativas: 1, acertos: 1, erros: 0, percentualAcertos: 100, tarefasConcluidas: 1 },
    ].sort((x, y) => x.comodoId.localeCompare(y.comodoId)));
  });
  await t.test("21 outra partida não herda desbloqueio nem contador de tentativas", async () => {
    await prepararSessao(a, ja2);
    await semEscrita(async () => { erro(await chamar("POST", "/historico-jogo/responder", bodyResposta(pa, ja2, t2), a), 403, "TAREFA_FORA_DA_ORDEM"); });
    const antes = await doc(Partida, ja._id);
    await responder(a, pa, ja2, t1, true);
    igual(await doc(Partida, ja._id), antes, "Resposta em outra partida alterou a principal");
  });
  await t.test("22 totais gerais agregam duas partidas sem misturar históricos por partida", async () => {
    const geral = numeros(10, 9, 1, 7, 15, 3, 90);
    await consultas(a, ja, numeros(9, 8, 1, 7, 14, 3, 88.89), geral);
    const res = await consultas(a, ja2, numeros(1, 1, 0, 1, 1, 1, 100), geral);
    const grupo = res.pGeral.tarefas.find((g) => g.tarefaId === t1._id && g.dificuldade === "facil");
    assert.equal(grupo.tentativas, 4); assert.equal(grupo.acertos, 3); assert.equal(grupo.erros, 1);
  });
  await t.test("23 outra criança sem permissão é bloqueada; após ativação seus dados ficam isolados", async s => {
    // Prepara uma sessão por HTTP e revoga a permissão antes da resposta.
    await permitir(b, true); await prepararSessao(b, jb); await permitir(b, false);
    await conferirBloqueioPermissao(s, estado, b.criancaId,
      () => chamar("POST", "/historico-jogo/responder", bodyResposta(pb, jb, t1, false), b));
    s.mock.timers.reset(); b.sessao = null; // O bloqueio confirmou o encerramento.
    await permitir(b, true); await prepararSessao(b, jb);
    await responder(b, pb, jb, t1, false);
    await consultas(b, jb, numeros(1, 0, 1, 0, 0, 0, 0));
    await consultas(a, ja, numeros(9, 8, 1, 7, 14, 3, 88.89), numeros(10, 9, 1, 7, 15, 3, 90));
  });
  await t.test("24 outra criança não acessa partida, históricos, progresso ou resumo alheios", () => semEscrita(async () => {
    for (const caminho of [`/jogos-salvos/${ja._id}`, `/jogos-salvos/${ja._id}/historico`, `/jogos-salvos/${ja._id}/progresso`])
      erro(await chamar("GET", caminho, undefined, b), 404);
    for (const sufixo of ["", "/historico", "/resumo-desempenho"])
      erro(await chamar("GET", `/criancas/${a.id}${sufixo}`, undefined, b), 403);
    erro(await chamar("POST", "/historico-jogo/responder", bodyResposta(pa, ja, t1), b), 404);
  }));
  await t.test("25 revogação impede novas respostas sem alterar histórico, posição ou estrelas", async s => {
    await prepararSessao(a, ja);
    await permitir(a, false);
    await conferirBloqueioPermissao(s, estado, a.criancaId,
      () => chamar("POST", "/historico-jogo/responder", bodyResposta(pa, ja, t3), a));
    await consultas(a, ja, numeros(9, 8, 1, 7, 14, 3, 88.89), numeros(10, 9, 1, 7, 15, 3, 90));
  });
  await t.test("26 reabrir leitura e renovar login mantém histórico, progresso e desempenho persistidos", async () => {
    await leitura.close(); leitura = await abrirConexaoTeste({ leitura: true }); await login(a);
    await consultas(a, ja, numeros(9, 8, 1, 7, 14, 3, 88.89), numeros(10, 9, 1, 7, 15, 3, 90));
    assert.equal((await doc(Perfil, pa._id)).estrelasTotal, 0);
    assert.equal((await doc(Perfil, pa._id)).nivelAtual, 1);
    const perfilHTTP = await get(a, `/perfis-jogo/${pa._id}`);
    assert.equal(perfilHTTP.estrelasTotal, 0); assert.equal(perfilHTTP.nivelAtual, 1);
    assert.equal((await estado()).HistoricoJogo.length, 11);
    t.diagnostic("Jornada: 11 históricos gerados por HTTP e confirmados após commit, sem inserção direta de histórico");
  });
});
