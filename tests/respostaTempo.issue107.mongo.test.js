import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Jogo from "../models/jogoSalvoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import router from "../routes/historicoJogoRoutes.js";
import { renovarSessaoJogo, pausarSessaoJogo, encerrarSessaoJogo } from "../services/tempoJogoService.js";
import { criarCatalogo } from "./helpers/catalogo.js";
import { motivoIgnorarCommitReal, conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";
import { confirmarModels, limparRegistrosTeste } from "./helpers/atlasSeguro.js";
import { casosRespostaTempo, dadosTempoResposta, conferirRespostaTempo, instante, erroRespostaTempo } from "./helpers/respostaTempoIssue107.js";

const id = () => new mongoose.Types.ObjectId();
const json = valor => JSON.parse(JSON.stringify(valor));
function sinal() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function esperar(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Barreira de concorrência não alcançada")), 10000);
  })]); } finally { clearTimeout(timer); }
}

test("#107 MongoDB: respostas com tempo, commit, rollback e concorrência real", {
  skip: motivoIgnorarCommitReal(), concurrency: false, timeout: 180000,
}, async t => {
  let conexao, leitura, server;
  const segredoAnterior = process.env.JWT_SECRET, segredo = randomUUID();
  const ids = { comodos: [], tarefas: [], respostas: [] };
  const registros = new Map([[Jogo, []], [Perfil, []], [Crianca, []],
    [Resposta, ids.respostas], [Tarefa, ids.tarefas], [Comodo, ids.comodos]]);
  t.after(async () => {
    const falhas = [];
    try { if (server) await new Promise((resolve, reject) => {
      server.close(e => e ? reject(e) : resolve()); server.closeAllConnections();
    }); } catch { falhas.push(new Error("Falha ao fechar HTTP de respostas")); }
    try { if (conexao) await limparRegistrosTeste(conexao, registros, Historico, registros.get(Perfil)); }
    catch { falhas.push(new Error("Limpeza das respostas #107 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, chaves] of registros) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: chaves } }), 0);
        assert.equal(await leitura.db.collection(Historico.collection.name)
          .countDocuments({ perfilJogoId: { $in: registros.get(Perfil) } }), 0);
        t.diagnostic("Zero resíduos de respostas/tempo, confirmados por conexão independente");
      }
    } catch { falhas.push(new Error("Não foi possível descartar resíduos de respostas")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown de respostas #107 falhou");
  });
  conexao = await conectarBancoCommitReal();
  leitura = await conectarBancoCommitReal({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  process.env.JWT_SECRET = segredo;
  const catalogo = await criarCatalogo(null, ids, `resposta-tempo-107-${randomUUID()}`);
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const doc = { ...dados, _id: id() };
    registros.get(Model).push(doc._id);
    for (const campo of Object.keys(doc)) if (doc[campo] === undefined) delete doc[campo];
    await Model.collection.insertOne(doc); // Ausências físicas e datas legadas inválidas são intencionais.
    return doc;
  }
  async function fixture(caso = {}) {
    const jogoId = id();
    const crianca = await inserir(Crianca, { usuarioId: id(), responsavelId: id(),
      ...dadosTempoResposta(caso.entrada), sessaoJogoId: randomUUID(),
      sessaoJogoSalvoId: caso.outraPartida ? id() : jogoId, legadoPreservado: "resposta-tempo-107" });
    const perfil = await inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "Resposta #107",
      imagemAvatar: "teste.png", status: "ativo", estrelasTotal: 0 });
    registros.get(Jogo).push(jogoId);
    await Jogo.create({ _id: jogoId, perfilJogoId: perfil._id, nomeJogo: "Resposta #107", estrelasTotal: 0 });
    const tarefa = caso.tarefa === "segunda" ? catalogo.quarto.tarefas[1]
      : caso.tarefa === "outroComodo" ? catalogo.banheiro.tarefas[0] : catalogo.quarto.tarefas[0];
    const body = { perfilJogoId: String(perfil._id), jogoSalvoId: String(jogoId), tarefaId: String(tarefa._id),
      respostaEscolhidaId: String((caso.correta === false ? tarefa.incorreta : tarefa.correta)._id),
      dificuldade: caso.dificuldade ?? "facil", sessaoId: caso.sessaoId ?? crianca.sessaoJogoId };
    if (caso.semSessao) delete body.sessaoId;
    return { crianca, perfil, jogoId, body };
  }
  const app = express(); app.use(express.json()); app.use("/historico-jogo", router);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  async function estado(f) {
    confirmarModels(leitura);
    assert.ok(registros.get(Crianca).some(chave => chave.equals(f.crianca._id)));
    return json({ crianca: await leitura.db.collection(Crianca.collection.name).findOne({ _id: f.crianca._id }),
      perfil: await leitura.db.collection(Perfil.collection.name).findOne({ _id: f.perfil._id }),
      jogo: await leitura.db.collection(Jogo.collection.name).findOne({ _id: f.jogoId }),
      historicos: await leitura.db.collection(Historico.collection.name).find({ jogoSalvoId: f.jogoId }).sort({ tentativa: 1 }).toArray() });
  }
  async function responder(f) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/historico-jogo/responder`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${jwt.sign({
        id: String(f.crianca.usuarioId), perfil: "crianca" }, segredo, { expiresIn: "5m" })}` },
      body: JSON.stringify(f.body), signal: AbortSignal.timeout(20000),
    });
    assert.match(res.headers.get("content-type"), /application\/json/);
    return { status: res.status, dados: await res.json() };
  }
  function acompanharTransacao(s) {
    const original = mongoose.startSession;
    const contagem = { sessoes: 0, transacoes: 0, callbacks: 0, encerradas: 0 };
    s.mock.method(mongoose, "startSession", async function (...args) {
      contagem.sessoes++;
      const session = await original.apply(this, args);
      const withTransaction = session.withTransaction, endSession = session.endSession;
      s.mock.method(session, "withTransaction", function (callback, ...opcoes) {
        contagem.transacoes++;
        return withTransaction.call(this, (...valores) => { contagem.callbacks++; return callback(...valores); }, ...opcoes);
      });
      s.mock.method(session, "endSession", async function (...opcoes) {
        contagem.encerradas++; return endSession.apply(this, opcoes);
      });
      return session;
    });
    return contagem;
  }
  const relogio = (s, agora = instante(10000)) => s.mock.timers.enable({ apis: ["Date"], now: agora });
  for (const caso of casosRespostaTempo) {
    await t.test(caso.nome, async s => {
      relogio(s, caso.agora); const f = await fixture(caso), contagem = acompanharTransacao(s);
      await conferirRespostaTempo({ estado, responder }, f, caso);
      assert.equal(contagem.sessoes, caso.transacoes ?? 1);
      assert.equal(contagem.transacoes, caso.transacoes ?? 1);
      assert.equal(contagem.encerradas, contagem.sessoes);
      assert.equal((await estado(f)).crianca.legadoPreservado, "resposta-tempo-107");
    });
  }
  await t.test("sessão de outra criança não altera nenhuma das duas", async s => {
    relogio(s); const a = await fixture(), b = await fixture();
    a.body.sessaoId = b.crianca.sessaoJogoId;
    const antes = [await estado(a), await estado(b)];
    assert.deepEqual(await responder(a), { status: 409, dados: erroRespostaTempo("SESSAO_INVALIDA") });
    assert.deepEqual([await estado(a), await estado(b)], antes);
  });
  await t.test("erro seguido de acerto preserva tentativas e contabiliza cada intervalo uma vez", async s => {
    relogio(s); const f = await fixture({ correta: false });
    assert.equal((await responder(f)).dados.tentativa, 1);
    s.mock.timers.tick(5000); f.body.respostaEscolhidaId = String(catalogo.quarto.tarefas[0].correta._id);
    assert.deepEqual(await responder(f), { status: 201, dados: { acertou: true, tentativa: 2, pontuacaoGanha: 1, dificuldade: "facil" } });
    const depois = await estado(f);
    assert.equal(depois.crianca.tempoUsadoHoje, 27);
    assert.equal(depois.jogo.estrelasTotal, 1);
    assert.deepEqual(depois.historicos.map(h => [h.acertou, h.tentativa]), [[false, 1], [true, 2]]);
  });
  for (const conflitos of [1, 2]) {
    await t.test(`${conflitos} conflito(s) real(is) repetem a transação com nova leitura`, async s => {
      relogio(s); const f = await fixture(), contagem = acompanharTransacao(s);
      const original = Crianca.collection.findOneAndUpdate;
      let chamadas = 0;
      s.mock.method(Crianca.collection, "findOneAndUpdate", async function (...args) {
        if (String(args[0]._id) === String(f.crianca._id) && ++chamadas <= conflitos) {
          confirmarModels(leitura);
          assert.equal((await leitura.db.collection(Crianca.collection.name).updateOne({ _id: f.crianca._id }, {
            $set: { tempoUsadoHoje: 18, sessaoJogoContabilizadoEm: instante(5000) }, $inc: { sessaoJogoVersao: 1 },
          })).matchedCount, 1);
        }
        return original.apply(this, args); // O próprio MongoDB detecta WriteConflict.
      });
      assert.equal((await responder(f)).status, 201);
      const depois = await estado(f);
      assert.equal(depois.crianca.tempoUsadoHoje, 23);
      assert.equal(depois.crianca.sessaoJogoVersao, conflitos + 1);
      assert.equal(depois.historicos.length, 1); assert.equal(depois.historicos[0].tentativa, 1);
      assert.equal(depois.jogo.estrelasTotal, 1);
      assert.equal(contagem.sessoes, 1); assert.equal(contagem.transacoes, 1); assert.equal(contagem.encerradas, 1);
      assert.equal(contagem.callbacks, conflitos + 1);
    });
  }
  for (const [nome, operacao, estadoFinal] of [["heartbeat", renovarSessaoJogo, "ativa"],
    ["pausa", pausarSessaoJogo, "pausada"], ["encerramento", encerrarSessaoJogo, "encerrada"]]) {
    for (const vencedor of ["resposta", nome]) {
      await t.test(`resposta e ${nome} concorrentes: ${vencedor} grava primeiro`, async s => {
        relogio(s); const f = await fixture(), barreira = sinal(), primeiroTerminou = sinal();
        const original = Crianca.collection.findOneAndUpdate;
        let chamadas = 0;
        s.mock.method(Crianca.collection, "findOneAndUpdate", async function (...args) {
          if (String(args[0]._id) !== String(f.crianca._id)) return original.apply(this, args);
          const n = ++chamadas, tipo = args[2]?.session ? "resposta" : nome;
          if (n <= 2) {
            if (n === 2) barreira.resolve();
            await esperar(barreira.promise);
            if (tipo !== vencedor) await esperar(primeiroTerminou.promise);
          }
          try { return await original.apply(this, args); }
          finally { if (n <= 2 && tipo === vencedor) primeiroTerminou.resolve(); }
        });
        const [res, temporal] = await Promise.allSettled([responder(f), operacao(f.crianca.usuarioId, f.crianca.sessaoJogoId)]);
        assert.equal(res.status, "fulfilled"); assert.equal(temporal.status, "fulfilled");
        const bloqueada = vencedor !== "resposta" && nome !== "heartbeat";
        assert.deepEqual(res.value, bloqueada ? { status: 409, dados: erroRespostaTempo("SESSAO_INATIVA") }
          : { status: 201, dados: { acertou: true, tentativa: 1, pontuacaoGanha: 1, dificuldade: "facil" } });
        const depois = await estado(f);
        assert.equal(depois.crianca.tempoUsadoHoje, 22);
        assert.equal(depois.crianca.sessaoJogoEstado, estadoFinal);
        assert.equal(depois.historicos.length, bloqueada ? 0 : 1);
        assert.equal(depois.jogo.estrelasTotal, bloqueada ? 0 : 1);
      });
    }
  }
  await t.test("falha após todas as atualizações reverte consumo, versão, perfil e estrelas", async s => {
    relogio(s); const f = await fixture(), antes = await estado(f), contagem = acompanharTransacao(s);
    s.mock.method(console, "error", () => {});
    s.mock.method(Historico, "create", async (_docs, opcoes) => {
      assert.ok(opcoes.session.inTransaction());
      throw new Error("Falha inesperada injetada depois de atualizar criança, perfil e partida");
    });
    assert.deepEqual(await responder(f), { status: 500, dados: { erro: true, mensagem: "Erro interno do servidor" } });
    assert.deepEqual(await estado(f), antes);
    assert.deepEqual(contagem, { sessoes: 1, transacoes: 1, callbacks: 1, encerradas: 1 });
  });
});
