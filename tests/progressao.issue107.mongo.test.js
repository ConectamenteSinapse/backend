import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Usuario from "../models/usuarioModel.js";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Jogo from "../models/jogoSalvoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import router from "../routes/historicoJogoRoutes.js";
import tarefaController from "../controllers/tarefaController.js";
import { criarCatalogo } from "./helpers/catalogo.js";
import {
  motivoIgnorarAtlas, abrirConexaoTeste, prepararColecoesTeste,
  confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";
import { verificarDificuldadeConcluida } from "../services/validarProgressaoService.js";
import { garantirSessaoResposta } from "./helpers/sessaoRespostaMongo.js";

test("#107 MongoDB: mesmas tarefas nos três níveis, legado, manutenção e commits reais", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async t => {
  let conexao, leitura, servidor, perfil;
  const anterior = process.env.JWT_SECRET;
  const segredo = randomUUID();
  const registros = new Map([Historico, Jogo, Perfil, Resposta, Tarefa, Comodo, Crianca, Usuario].map(m => [m, []]));
  const comandos = [];
  const monitorar = e => comandos.push(e.commandName);
  // IDs conhecidos antes das escritas. Históricos gerados pelo Service são delimitados pelo perfil próprio.
  t.after(async () => {
    const falhas = [];
    try {
      if (servidor) await new Promise((resolve, reject) => {
        servidor.close(e => e ? reject(e) : resolve()); servidor.closeAllConnections();
      });
    } catch { falhas.push(new Error("Falha ao fechar HTTP #107")); }
    conexao?.getClient().off("commandStarted", monitorar);
    try {
      if (conexao) await limparRegistrosTeste(conexao, registros, Historico, registros.get(Perfil));
    } catch { falhas.push(new Error("Limpeza #107 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: ids } }), 0);
        assert.equal(await leitura.db.collection(Historico.collection.name)
          .countDocuments({ perfilJogoId: { $in: registros.get(Perfil) } }), 0);
        t.diagnostic("#107: limpeza confirmada por conexão independente; zero resíduos");
      }
    } catch { falhas.push(new Error("Resíduos #107 não descartados")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura #107")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão #107")); }
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown #107 falhou");
  });
  conexao = await abrirConexaoTeste({ monitorCommands: true });
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const _id = new mongoose.Types.ObjectId(); registros.get(Model).push(_id);
    return Model.create({ ...dados, _id });
  }
  const usuario = await inserir(Usuario, { nome: "Fixture #107", email: `issue107-${randomUUID()}@example.invalid`,
    senha: "hash-ficticio-sem-login", perfil: "crianca" });
  const crianca = await inserir(Crianca, { usuarioId: usuario._id, permissaoAtiva: true });
  perfil = await inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "Fixture #107", imagemAvatar: "avatar.png" });
  const jogo = await inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "Principal" });
  const outra = await inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "Independente" });
  let sessaoId = await garantirSessaoResposta(usuario._id, jogo._id);
  const catalogo = await criarCatalogo(undefined, {
    comodos: registros.get(Comodo), tarefas: registros.get(Tarefa), respostas: registros.get(Resposta),
  }, "issue107");
  const tarefas = catalogo.quarto.tarefas;
  const dificuldades = ["facil", "medio", "dificil"];
  // Tarefa inativa anterior a todas as demais: não deve bloquear a ordem nem a conclusão.
  await inserir(Tarefa, { ...tarefas[0], ordem: 0, ativo: false });
  // Campo antigo inserido pelo driver nativo: o schema atual não o cadastra.
  // Somente a fixture desta execução é alterada; os mesmos IDs serão usados nos três níveis.
  confirmarModels(conexao, [Tarefa]);
  await Tarefa.collection.updateOne({ _id: tarefas[0]._id }, { $set: { dificuldade: "dificil" } });
  const catalogoAntes = await leitura.db.collection(Tarefa.collection.name)
    .find({ _id: { $in: registros.get(Tarefa) } }).sort({ _id: 1 }).toArray();
  process.env.JWT_SECRET = segredo;
  const app = express(); app.use(express.json()); app.use("/historico-jogo", router);
  servidor = app.listen(0, "127.0.0.1"); await once(servidor, "listening");
  const token = jwt.sign({ id: String(usuario._id), perfil: "crianca" }, segredo, { expiresIn: "5m" });
  const responder = async (tarefa, dificuldade = "facil", correta = true, partida = jogo) => {
    const res = await fetch(`http://127.0.0.1:${servidor.address().port}/historico-jogo/responder`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ perfilJogoId: perfil._id, jogoSalvoId: partida._id, tarefaId: tarefa._id,
        respostaEscolhidaId: tarefa[correta ? "correta" : "incorreta"]._id, dificuldade, sessaoId }),
      signal: AbortSignal.timeout(10000),
    });
    return { status: res.status, dados: await res.json() };
  };
  async function estado() {
    confirmarModels(leitura);
    const resultado = {};
    for (const [Model, ids] of registros) resultado[Model.modelName] = await leitura.db.collection(Model.collection.name)
      .find(Model === Historico ? { perfilJogoId: perfil._id } : { _id: { $in: ids } }).sort({ _id: 1 }).toArray();
    return JSON.parse(JSON.stringify(resultado));
  }
  async function rejeitar(tarefa, dificuldade, status, codigo, partida = jogo) {
    const antes = await estado(); const inicio = comandos.length;
    const res = await responder(tarefa, dificuldade, true, partida);
    assert.equal(res.status, status);
    if (codigo) assert.equal(res.dados.codigo, codigo);
    else assert.equal(res.dados.erro, true);
    assert.deepEqual(comandos.slice(inicio).filter(c => ["insert", "update", "delete", "findAndModify", "bulkWrite"].includes(c)), []);
    assert.deepEqual(await estado(), antes, "Rejeição alterou documentos persistidos");
  }
  conexao.getClient().on("commandStarted", monitorar);
  await t.test("catálogo único: duas tarefas, uma legada e uma sem dificuldade, IDs/ordens preservados", async () => {
    assert.equal(new Set(tarefas.map(t => String(t._id))).size, 2);
    assert.equal(new Set(tarefas.map(t => t.ordem)).size, 2);
    assert.equal(Tarefa.schema.path("dificuldade"), undefined);
    for (const tarefa of tarefas) await new Tarefa(tarefa).validate();
    assert.equal(catalogoAntes.find(t => t._id.equals(tarefas[0]._id)).dificuldade, "dificil");
    assert.equal(Object.hasOwn(catalogoAntes.find(t => t._id.equals(tarefas[1]._id)), "dificuldade"), false);
  });
  await t.test("erro persiste com zero pontos, sem concluir nem liberar tarefa seguinte", async () => {
    assert.deepEqual(await responder(tarefas[0], "facil", false), {
      status: 201, dados: { acertou: false, tentativa: 1, pontuacaoGanha: 0, dificuldade: "facil" },
    });
    await rejeitar(tarefas[1], "facil", 403, "TAREFA_FORA_DA_ORDEM");
  });
  for (const dificuldade of ["impossivel", "", null]) {
    await t.test(`dificuldade inválida ${String(dificuldade)}: HTTP 400 e banco preservado`, () =>
      rejeitar(tarefas[0], dificuldade, 400));
  }
  await t.test("médio e difícil bloqueados antes da etapa anterior", async () => {
    for (const d of ["medio", "dificil"]) await rejeitar(tarefas[0], d, 403, "DIFICULDADE_BLOQUEADA");
  });
  let estrelas = 0;
  for (const [indice, dificuldade] of dificuldades.entries()) {
    await t.test(`${dificuldade}: ordem, conclusão isolada, estrelas e bloqueio do cômodo seguinte`, async () => {
      const [primeira, segunda] = tarefas;
      await rejeitar(segunda, dificuldade, 403, "TAREFA_FORA_DA_ORDEM");
      for (const [posicao, tarefa] of [primeira, segunda].entries()) {
        assert.deepEqual(await responder(tarefa, dificuldade), { status: 201, dados: {
          acertou: true, tentativa: indice === 0 && posicao === 0 ? 2 : 1,
          pontuacaoGanha: indice + 1, dificuldade,
        } });
        estrelas += indice + 1;
        const salvo = await estado();
        assert.equal(salvo.JogoSalvo.find(d => d._id === String(jogo._id)).estrelasTotal, estrelas);
        assert.equal(await verificarDificuldadeConcluida(jogo._id, catalogo.quarto._id, dificuldade), posicao === 1);
        if (posicao === 0 && indice < 2) await rejeitar(primeira, dificuldades[indice + 1], 403, "DIFICULDADE_BLOQUEADA");
        if (indice < 2 || posicao === 0) await rejeitar(catalogo.banheiro.tarefas[0], "facil", 403, "COMODO_BLOQUEADO");
      }
    });
  }
  await t.test("três dificuldades liberam próximo cômodo; outra partida continua bloqueada", async () => {
    assert.equal((await responder(catalogo.banheiro.tarefas[0])).status, 201);
    // Troca legítima de sessão ANTES do snapshot e do monitoramento da rejeição.
    sessaoId = await garantirSessaoResposta(usuario._id, outra._id);
    await rejeitar(catalogo.banheiro.tarefas[0], "facil", 403, "COMODO_BLOQUEADO", outra);
    await rejeitar(tarefas[0], "medio", 403, "DIFICULDADE_BLOQUEADA", outra);
    const salvo = await estado();
    assert.equal(salvo.HistoricoJogo.length, 8);
    assert.equal(salvo.JogoSalvo.find(d => d._id === String(jogo._id)).estrelasTotal, 13);
    assert.equal(salvo.JogoSalvo.find(d => d._id === String(outra._id)).estrelasTotal, 0);
    assert.ok(comandos.includes("commitTransaction"));
    for (const dificuldade of dificuldades) {
      const ids = salvo.HistoricoJogo.filter(h => h.dificuldade === dificuldade && h.acertou && h.comodoId === String(catalogo.quarto._id))
        .map(h => h.tarefaId).sort();
      assert.deepEqual(ids, tarefas.map(t => String(t._id)).sort());
    }
  });
  await t.test("jogar com tarefa legada não migra nem modifica o catálogo", async () => {
    assert.deepEqual(await leitura.db.collection(Tarefa.collection.name)
      .find({ _id: { $in: registros.get(Tarefa) } }).sort({ _id: 1 }).toArray(), catalogoAntes);
  });
  await t.test("dificuldade sem tarefas e dificuldade somente com inativas não são concluídas", async () => {
    for (const d of dificuldades) assert.equal(await verificarDificuldadeConcluida(jogo._id, catalogo.vazio._id, d), false);
    assert.equal(await verificarDificuldadeConcluida(jogo._id, catalogo.soInativas._id, "facil"), false);
  });

  // Controllers internos reais; as rotas públicas de manutenção continuam desativadas.
  const chaveManutencao = new mongoose.Types.ObjectId();
  registros.get(Tarefa).push(chaveManutencao); // Antes do cadastro, inclusive se a resposta falhar.
  const dados = { ...tarefas[0], _id: chaveManutencao, comodoId: catalogo.inativo._id,
    ordem: 100, titulo: "Manutenção #107", ativo: false };
  delete dados.correta; delete dados.incorreta;
  for (const [nome, metodo, status] of [["cadastro", "postTarefa", 201], ["PUT", "putTarefaById", 200], ["PATCH", "patchTarefaById", 200]]) {
    await t.test(`${nome} sem dificuldade: Controller/Service e persistência por conexão independente`, async () => {
      const body = nome === "PATCH" ? { titulo: "Título parcial #107" } : { ...dados, titulo: `Título ${nome}` };
      assert.equal(Object.hasOwn(body, "dificuldade"), false);
      const res = { status(n) { this.codigo = n; return this; }, json(d) { this.dados = d; return this; } };
      await tarefaController[metodo]({ body, params: { id: String(chaveManutencao) } }, res);
      assert.equal(res.codigo, status);
      const salvo = await leitura.db.collection(Tarefa.collection.name).findOne({ _id: chaveManutencao });
      assert.equal(salvo.titulo, body.titulo);
      assert.equal(Object.hasOwn(salvo, "dificuldade"), false);
      assert.equal(String(salvo.comodoId), String(catalogo.inativo._id));
    });
  }

  await t.test("PUT/PATCH de tarefa legada sem dificuldade preservam o campo antigo no BSON", async () => {
    const antes = await leitura.db.collection(Tarefa.collection.name).findOne({ _id: tarefas[0]._id });
    for (const [metodo, body] of [["putTarefaById", { ...tarefas[0], titulo: "Legada PUT" }],
      ["patchTarefaById", { titulo: "Legada PATCH" }]]) {
      assert.equal(Object.hasOwn(body, "dificuldade"), false);
      const res = { status(n) { this.codigo = n; return this; }, json(d) { this.dados = d; return this; } };
      await tarefaController[metodo]({ body, params: { id: String(tarefas[0]._id) } }, res);
      assert.equal(res.codigo, 200);
      const salvo = await leitura.db.collection(Tarefa.collection.name).findOne({ _id: tarefas[0]._id });
      assert.deepEqual(salvo, { ...antes, titulo: body.titulo });
    }
  });
});
