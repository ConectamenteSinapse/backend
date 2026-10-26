import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { registerHooks } from "node:module";
import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import {
  motivoIgnorarAtlas, validarAtivacao, obterUriTeste, abrirConexaoTeste,
  prepararColecoesTeste, confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";

// Bootstrap real, HTTP real e MongoDB real. Só dotenv, listen e a chamada de
// conexão do bootstrap são isolados; Services/Models/queries não são mockados.
// JWT temporário para o catálogo: login real já é exercitado nas Fases 1/2/3.
test("#94 Fase 4: consultas do catálogo com MongoDB", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async (t) => {
  validarAtivacao(); obterUriTeste();
  const execucao = `issue94-fase4-${randomUUID()}`;
  const segredoAnterior = process.env.JWT_SECRET;
  const registros = new Map([[Resposta, []], [Tarefa, []], [Comodo, []]]);
  const ids = (Model) => registros.get(Model);
  let conexao, leitura, server, client, base, monitorar;
  const escritas = [];
  const serializar = (dado) => JSON.parse(JSON.stringify(dado));
  async function estado() {
    confirmarModels(leitura);
    const resultado = {};
    for (const Model of registros.keys()) resultado[Model.modelName] = serializar(
      await leitura.db.collection(Model.collection.name).find({ _id: { $in: ids(Model) } }).sort({ _id: 1 }).toArray());
    return resultado;
  }
  async function semEscrita(fn) {
    const antes = await estado(); const quantidade = escritas.length;
    try { await fn(); }
    finally {
      assert.equal(escritas.length, quantidade, "HTTP de consulta/rota desativada enviou escrita MongoDB");
      assert.ok(JSON.stringify(await estado()) === JSON.stringify(antes), "HTTP alterou as fixtures persistidas");
    }
  }
  t.after(async () => {
    const falhas = [];
    try {
      if (server) await new Promise((resolve, reject) => {
        server.close((erro) => erro ? reject(erro) : resolve()); server.closeIdleConnections();
      });
    } catch { falhas.push(new Error("Falha ao encerrar HTTP do catálogo")); }
    client?.off("commandStarted", monitorar);
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza do catálogo da fase 4 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const Model of registros.keys()) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: ids(Model) } }), 0, `Resíduos em ${Model.modelName}`);
        assert.equal(await leitura.db.collection(Tarefa.collection.name).countDocuments({ comodoId: { $in: ids(Comodo) } }), 0);
        assert.equal(await leitura.db.collection(Resposta.collection.name).countDocuments({ tarefaId: { $in: ids(Tarefa) } }), 0);
        t.diagnostic("Fase 4: zero resíduos confirmado por conexão independente e relacionamentos próprios");
      }
    } catch { falhas.push(new Error("Ausência de resíduos do catálogo não confirmada")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão principal")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown da fase 4 falhou");
  });
  conexao = await abrirConexaoTeste({ monitorCommands: true });
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  confirmarModels(conexao); confirmarModels(leitura);
  assert.notEqual(conexao.getClient(), leitura.getClient());
  process.env.JWT_SECRET = randomUUID();
  const token = jwt.sign({ id: String(new mongoose.Types.ObjectId()), perfil: "crianca" }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const dotenvMock = t.mock.method(dotenv, "config", () => ({ parsed: {} }));
  const listenOriginal = express.application.listen;
  const listenMock = t.mock.method(express.application, "listen", function () {
    server = listenOriginal.call(this, 0, "127.0.0.1"); return server;
  });
  let chamadasConexao = 0;
  globalThis.__issue94CatalogoConnect = () => { chamadasConexao++; };
  const hooks = registerHooks({
    load(url, context, next) {
      if (url === new URL("../config/db-connection.js", import.meta.url).href) return {
        format: "module", shortCircuit: true,
        source: "export default () => globalThis.__issue94CatalogoConnect();",
      };
      return next(url, context);
    },
  });
  try { await import("../index.js"); }
  finally {
    hooks.deregister(); delete globalThis.__issue94CatalogoConnect;
    dotenvMock.mock.restore(); listenMock.mock.restore();
  }
  assert.equal(chamadasConexao, 1, "Conexão do bootstrap deve ser substituída antes de importar index.js");
  if (!server.listening) await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  client = conexao.getClient();
  monitorar = (evento) => { if (["insert", "update", "delete", "findAndModify"].includes(evento.commandName)) escritas.push(evento.commandName); };
  client.on("commandStarted", monitorar);
  async function chamar(caminho, { method = "GET", body, authorization = `Bearer ${token}` } = {}) {
    confirmarModels(conexao);
    const headers = {};
    if (authorization !== null) headers.Authorization = authorization;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(base + caminho, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    assert.match(res.headers.get("content-type"), /application\/json/);
    return { status: res.status, body: await res.json() };
  }
  async function get(caminho) {
    const res = await chamar(caminho); assert.equal(res.status, 200); return res.body;
  }
  function erro(res, status) {
    assert.equal(res.status, status); assert.equal(res.body.erro, true);
    assert.equal(typeof res.body.mensagem, "string"); assert.ok(res.body.mensagem.trim());
    assert.deepEqual(Object.keys(res.body).sort(), ["erro", "mensagem"]);
    assert.doesNotMatch(res.body.mensagem, /Cast to|stack|node_modules|MongoServerError/);
  }
  function semCorreta(dado) {
    if (!dado || typeof dado !== "object") return;
    assert.ok(!Object.hasOwn(dado, "correta"), "Gabarito exposto no catálogo");
    for (const valor of Object.values(dado)) semCorreta(valor);
  }
  function novo(Model, dados) {
    const d = new Model(dados); ids(Model).push(d._id); return d;
  }
  const iniciais = new Map();
  let c, vazio, midia, legado, nula, alternativas;
  for (const [numero, Model, caminho] of [["01", Comodo, "/comodos"], ["02", Tarefa, "/tarefas"], ["03", Resposta, "/respostas"]]) {
    await t.test(`${numero} listagem global de ${Model.modelName} vazia quando o ambiente já está vazio`, async (s) => {
      const quantidade = await leitura.db.collection(Model.collection.name).countDocuments({});
      iniciais.set(Model, quantidade);
      if (quantidade !== 0) { s.skip("Coleção contém documentos preexistentes; limpeza global não autorizada"); return; }
      await semEscrita(async () => { assert.deepEqual(await get(caminho), []); });
    });
  }
  await t.test("04 criar somente fixtures necessárias: dois cômodos, três tarefas e quatro alternativas", async () => {
    c = novo(Comodo, { nome: execucao, descricao: execucao, imagemCenario: "cenario.png", ordem: 2, dificuldadesDisponiveis: ["facil", "medio", "dificil"] });
    vazio = novo(Comodo, { nome: `${execucao}-vazio`, descricao: execucao, imagemCenario: "vazio.png", ordem: 1, dificuldadesDisponiveis: ["facil"] });
    await c.save(); await vazio.save();
    const dados = { comodoId: c._id, titulo: "Atividade", enunciado: "Escolha", descricao: execucao,
      imagemObjeto: "objeto.png", posicao: { x: 0, y: 0, largura: 1, altura: 1 }, dificuldade: "facil" };
    midia = novo(Tarefa, { ...dados, ordem: 30, audioEnunciado: "enunciado.mp3" });
    legado = novo(Tarefa, { ...dados, ordem: 10 });
    nula = novo(Tarefa, { ...dados, ordem: 20, audioEnunciado: null });
    for (const d of [midia, legado, nula]) await d.save();
    alternativas = [
      novo(Resposta, { tarefaId: midia._id, texto: "Com mídia", correta: true, ordem: 30, imagem: "alternativa.png", audio: "alternativa.mp3" }),
      novo(Resposta, { tarefaId: midia._id, texto: "Legada", correta: false, ordem: 10 }),
      novo(Resposta, { tarefaId: midia._id, texto: "Nula", correta: false, ordem: 20, imagem: null, audio: null }),
      novo(Resposta, { tarefaId: legado._id, texto: "Outra tarefa", correta: true, ordem: 1 }),
    ];
    for (const d of alternativas) await d.save();
  });
  await t.test("05 confirmar documentos completos e gabaritos persistidos por conexão independente", async () => {
    const salvo = await estado();
    for (const [Model, docs] of [[Comodo, [c, vazio]], [Tarefa, [midia, legado, nula]], [Resposta, alternativas]])
      for (const d of docs) assert.deepEqual(salvo[Model.modelName].find((v) => v._id === String(d._id)), serializar(d.toObject()));
    assert.ok(salvo.Resposta.some((r) => r.correta === true)); assert.ok(salvo.Resposta.some((r) => r.correta === false));
  });
  await t.test("06 listagem de cômodos contém os registros e seus campos cadastrados", () => semEscrita(async () => {
    const lista = await get("/comodos"); assert.ok(Array.isArray(lista)); semCorreta(lista);
    for (const d of [c, vazio]) assert.deepEqual(lista.find((v) => v._id === String(d._id)), serializar(d.toObject()));
  }));
  await t.test("07 consulta de cômodo por ID preserva cenário e dificuldades", () => semEscrita(async () => {
    assert.deepEqual(await get(`/comodos/${c._id}`), serializar(c.toObject()));
  }));
  await t.test("08 tarefas por cômodo preservam associação e ordem sem impor sort inexistente", () => semEscrita(async () => {
    const lista = await get(`/comodos/${c._id}/tarefas`); semCorreta(lista);
    assert.equal(lista.length, 3); assert.ok(lista.every((d) => d.comodoId === String(c._id)));
    assert.deepEqual(lista.map((d) => d._id).sort(), [midia, legado, nula].map((d) => String(d._id)).sort());
    for (const d of [midia, legado, nula]) assert.equal(lista.find((v) => v._id === String(d._id)).ordem, d.ordem);
    t.diagnostic(`Ordens de tarefas observadas: ${lista.map((d) => d.ordem).join(",")}; Service não declara sort`);
  }));
  await t.test("09 tarefas globais e por ID mantêm mídia presente, omitida e null", () => semEscrita(async () => {
    const lista = await get("/tarefas"); semCorreta(lista);
    for (const d of [midia, legado, nula]) {
      const detalhe = await get(`/tarefas/${d._id}`); semCorreta(detalhe);
      assert.deepEqual(detalhe, serializar(d.toObject()));
      assert.deepEqual(lista.find((v) => v._id === String(d._id)), detalhe);
    }
    assert.equal(Object.hasOwn(lista.find((v) => v._id === String(legado._id)), "audioEnunciado"), false);
    assert.equal(lista.find((v) => v._id === String(nula._id)).audioEnunciado, null);
  }));
  await t.test("10 alternativas por tarefa são ordenadas e preservam mídia sem correta", () => semEscrita(async () => {
    const lista = await get(`/tarefas/${midia._id}/respostas`); semCorreta(lista);
    assert.deepEqual(lista.map((r) => r.ordem), [10, 20, 30]);
    assert.ok(lista.every((r) => r.tarefaId === String(midia._id)));
    assert.equal(Object.hasOwn(lista[0], "imagem"), false); assert.equal(Object.hasOwn(lista[0], "audio"), false);
    assert.equal(lista[1].imagem, null); assert.equal(lista[1].audio, null);
    assert.equal(lista[2].imagem, "alternativa.png"); assert.equal(lista[2].audio, "alternativa.mp3");
  }));
  await t.test("11 respostas globais e por ID ocultam gabarito real e preservam demais campos", () => semEscrita(async () => {
    const lista = await get("/respostas"); semCorreta(lista);
    for (const d of alternativas) {
      const publico = serializar(d.toObject()); delete publico.correta;
      const detalhe = await get(`/respostas/${d._id}`); semCorreta(detalhe);
      assert.deepEqual(detalhe, publico); assert.deepEqual(lista.find((r) => r._id === String(d._id)), publico);
    }
  }));
  await t.test("12 alternativas de outra tarefa ficam isoladas", () => semEscrita(async () => {
    const lista = await get(`/tarefas/${legado._id}/respostas`); semCorreta(lista);
    assert.equal(lista.length, 1); assert.equal(lista[0]._id, String(alternativas[3]._id));
  }));
  await t.test("13 cômodo sem tarefas e tarefa sem alternativas preservam contratos de vazio", () => semEscrita(async () => {
    assert.deepEqual(await get(`/comodos/${vazio._id}/tarefas`), { mensagem: "Este cômodo ainda não possui tarefas cadastradas", tarefas: [] });
    assert.deepEqual(await get(`/tarefas/${nula._id}/respostas`), []);
  }));
  await t.test("14 registros inexistentes retornam 404 JSON sem detalhes técnicos", () => semEscrita(async () => {
    const ausente = new mongoose.Types.ObjectId();
    for (const caminho of [`/comodos/${ausente}`, `/comodos/${ausente}/tarefas`, `/tarefas/${ausente}`, `/tarefas/${ausente}/respostas`, `/respostas/${ausente}`])
      erro(await chamar(caminho), 404);
  }));
  await t.test("15 IDs malformados retornam 400 JSON", () => semEscrita(async () => {
    for (const caminho of ["/comodos/invalido", "/comodos/invalido/tarefas", "/tarefas/invalido", "/tarefas/invalido/respostas", "/respostas/invalido"])
      erro(await chamar(caminho), 400);
  }));
  await t.test("16 escritas públicas do catálogo seguem 404 sem comandos de escrita", () => semEscrita(async () => {
    for (const [Model, prefixo, existente, dados] of [
      [Comodo, "/comodos", c, { ...serializar(c.toObject()), nome: "Não criar" }],
      [Tarefa, "/tarefas", midia, { ...serializar(midia.toObject()), ordem: 999 }],
      [Resposta, "/respostas", alternativas[0], { ...serializar(alternativas[0].toObject()), ordem: 999 }],
    ]) {
      const candidato = new mongoose.Types.ObjectId(); ids(Model).push(candidato);
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const caminho = method === "POST" ? prefixo : `${prefixo}/${existente._id}`;
        erro(await chamar(caminho, { method, body: method === "DELETE" ? undefined : { ...dados, _id: method === "POST" ? String(candidato) : String(existente._id) } }), 404);
      }
    }
  }));
  await t.test("17 consultas do catálogo exigem JWT sem alterar persistência", () => semEscrita(async () => {
    for (const caminho of ["/comodos", `/comodos/${c._id}`, `/comodos/${c._id}/tarefas`, "/tarefas", `/tarefas/${midia._id}`, `/tarefas/${midia._id}/respostas`, "/respostas", `/respostas/${alternativas[0]._id}`])
      for (const authorization of [null, "Bearer invalido"]) erro(await chamar(caminho, { authorization }), 401);
  }));
  await t.test("18 catálogo permanece íntegro após consultas e escritas bloqueadas", async () => {
    const esperado = new Map([[Comodo, 2], [Tarefa, 3], [Resposta, 4]]);
    for (const Model of registros.keys()) assert.equal(await leitura.db.collection(Model.collection.name)
      .countDocuments({}), iniciais.get(Model) + esperado.get(Model));
    t.diagnostic("Persistência de mídia/projeção/associação confirmada; consultas e rotas bloqueadas não enviaram writes");
  });
});
