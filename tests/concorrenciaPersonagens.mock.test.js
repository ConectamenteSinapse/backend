import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import JogoSalvo from "../models/jogoSalvoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import historicoService from "../services/historicoJogoService.js";
import { arquivarPersonagem } from "../services/perfilJogoService.js";

// Não simula isolamento, locks ou rollback do MongoDB. Testa o protocolo do service.
function sinal() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function preparar(t, { correta = true } = {}) {
  const id = () => new mongoose.Types.ObjectId();
  const usuarioId = id();
  const criancaId = id();
  const perfil = { _id: id(), criancaId, status: "ativo", estrelasTotal: 7 };
  const partida = { _id: id(), perfilJogoId: perfil._id, estrelasTotal: 7 };
  const tarefa = { _id: id(), comodoId: id(), ativo: true, ordem: 1 };
  const resposta = { _id: id(), tarefaId: tarefa._id, correta };
  const eventos = [];
  const sessoes = [];
  let antesReserva = async () => {};
  let aposCallback = async () => {};
  t.mock.method(Crianca, "findOne", async () => ({
    _id: criancaId,
    permissaoAtiva: true,
  }));
  t.mock.method(Tarefa, "findById", async () => tarefa);
  t.mock.method(Resposta, "findOne", async () => resposta);
  t.mock.method(Comodo, "findById", async () => ({
    _id: tarefa.comodoId,
    ativo: true,
    ordem: 1,
  }));
  t.mock.method(Comodo, "find", () => ({ sort: async () => [] }));
  t.mock.method(Tarefa, "countDocuments", async () => 1);
  t.mock.method(Tarefa, "find", () => ({ sort: async () => [] }));
  t.mock.method(Historico, "distinct", async () => []);
  t.mock.method(Perfil, "findOne", async (filtro) => {
    assert.equal(filtro.status, "ativo");
    return perfil.status === "ativo" ? { ...perfil } : null;
  });
  const reservar = t.mock.method(
    Perfil,
    "findOneAndUpdate",
    async (filtro, update, opts) => {
      assert.equal(String(filtro._id), String(perfil._id));
      assert.equal(String(filtro.criancaId), String(criancaId));
      assert.equal(filtro.status, "ativo");
      assert.equal(opts.new, true);
      assert.equal(opts.runValidators, true);
      if (!opts.session) {
        assert.deepEqual(update, { $set: { status: "arquivado" } });
        if (perfil.status !== "ativo") return null;
        perfil.status = "arquivado";
        eventos.push(["arquivo"]);
        return { ...perfil };
      }
      const session = opts.session;
      assert.ok(sessoes.includes(session));
      assert.deepEqual(update, {
        $currentDate: { ultimaInteracaoEm: true },
      });
      await antesReserva();
      eventos.push(["reserva", session]);
      return perfil.status === "ativo" ? { ...perfil } : null;
    },
  );
  t.mock.method(JogoSalvo, "findOne", async (filtro) => {
    assert.equal(String(filtro._id), String(partida._id));
    assert.equal(String(filtro.perfilJogoId), String(perfil._id));
    return { ...partida };
  });
  t.mock.method(JogoSalvo, "findOneAndUpdate", async (filtro, update, opts) => {
    assert.equal(String(filtro._id), String(partida._id));
    assert.equal(String(filtro.perfilJogoId), String(perfil._id));
    assert.ok(sessoes.includes(opts.session));
    assert.equal(opts.new, true);
    assert.equal(opts.runValidators, true);
    assert.deepEqual(update, {
      $inc: { estrelasTotal: correta ? 1 : 0 },
      $set: {
        comodoId: tarefa.comodoId,
        tarefaId: tarefa._id,
        dificuldade: "facil",
      },
      $currentDate: { atualizadoEm: true },
    });
    eventos.push(["partida", opts.session]);
    return { ...partida };
  });
  const contar = t.mock.method(Historico, "countDocuments", (filtro) => {
    assert.deepEqual(filtro, {
      jogoSalvoId: partida._id,
      tarefaId: tarefa._id,
      dificuldade: "facil",
    });
    return {
      session: async (session) => {
        eventos.push(["conta", session]);
        // Contagens roteirizadas, não uma garantia de serialização do servidor.
        return session.indice;
      },
    };
  });
  const criar = t.mock.method(
    Historico,
    "create",
    async (docs, { session }) => {
      eventos.push(["historico", session]);
      assert.equal(docs[0].pontuacaoGanha, correta ? 1 : 0);
      assert.equal(String(docs[0].jogoSalvoId), String(partida._id));
      assert.equal(String(docs[0].perfilJogoId), String(perfil._id));
      return docs;
    },
  );
  const iniciar = t.mock.method(mongoose, "startSession", async () => {
    const session = {
      indice: sessoes.length,
      async withTransaction(callback) {
        eventos.push(["inicio", this]);
        try {
          const result = await callback();
          await aposCallback();
          eventos.push(["commit simulado", this]);
          return result;
        } catch (erro) {
          eventos.push(["abort simulado", this]);
          throw erro;
        }
      },
      async endSession() {
        eventos.push(["fim", this]);
      },
    };
    sessoes.push(session);
    return session;
  });
  return {
    perfil,
    partida,
    eventos,
    sessoes,
    reservar,
    contar,
    criar,
    iniciar,
    responder: () =>
      historicoService.registrarResposta(
        usuarioId,
        perfil._id,
        partida._id,
        tarefa._id,
        resposta._id,
        "facil",
      ),
    arquivar: () => arquivarPersonagem(usuarioId, perfil._id),
    pausarReserva: (callback) => {
      antesReserva = callback;
    },
    falharAposCallback: (callback) => {
      aposCallback = callback;
    },
  };
}

for (const correta of [true, false]) {
  test(
    `MOCK: arquivo vence após pré-leitura (${correta ? "acerto" : "erro, zero pontos"})`,
    { timeout: 5000 },
    async (t) => {
      const j = preparar(t, { correta });
      const entrou = sinal();
      const liberar = sinal();
      j.pausarReserva(async () => {
        entrou.resolve();
        await liberar.promise;
      });
      const resposta = j.responder();
      const rejeitada = assert.rejects(resposta, /PERFIL_JOGO_NAO_ENCONTRADO/);
      try {
        await entrou.promise;
        await j.arquivar();
      } finally {
        liberar.resolve();
        await rejeitada;
      }
      assert.equal(j.perfil.status, "arquivado");
      assert.equal(j.perfil.estrelasTotal, 7);
      assert.equal(j.contar.mock.callCount(), 0);
      assert.equal(j.criar.mock.callCount(), 0);
      assert.ok(j.eventos.some(([tipo]) => tipo === "abort simulado"));
      assert.equal(j.eventos.at(-1)[0], "fim");
    },
  );
}

test("MOCK: resposta após arquivamento é rejeitada antes de iniciar sessão", async (t) => {
  const j = preparar(t);
  await j.arquivar();
  await assert.rejects(j.responder(), /PERFIL_JOGO_NAO_ENCONTRADO/);
  assert.equal(j.iniciar.mock.callCount(), 0);
  assert.equal(j.criar.mock.callCount(), 0);
});

for (const correta of [true, false]) {
  test(`MOCK: abort propaga erro e encerra sessão após escrita/histórico (${correta ? "acerto" : "erro"})`, async (t) => {
    const j = preparar(t, { correta });
    const falha = new Error("Abort deliberado pelo teste");
    j.falharAposCallback(async () => {
      throw falha;
    });
    await assert.rejects(j.responder(), (erro) => erro === falha);
    const session = j.sessoes[0];
    assert.deepEqual(
      j.eventos.map(([tipo]) => tipo),
      [
        "inicio",
        "reserva",
        "partida",
        "conta",
        "historico",
        "abort simulado",
        "fim",
      ],
    );
    assert.ok(j.eventos.every(([, s]) => s === session));
    assert.equal(j.criar.mock.calls[0].arguments[1].session, session);
    // A preservação de dados após abort é testada apenas na suíte MongoDB.
  });
}

test("MOCK: duas chamadas paralelas reservam antes de contar, usando suas próprias sessões", async (t) => {
  const j = preparar(t);
  const resultados = await Promise.all([j.responder(), j.responder()]);
  assert.deepEqual(resultados.map((r) => r.tentativa).sort(), [1, 2]);
  for (const session of j.sessoes) {
    assert.deepEqual(
      j.eventos.filter(([, s]) => s === session).map(([tipo]) => tipo),
      [
        "inicio",
        "reserva",
        "partida",
        "conta",
        "historico",
        "commit simulado",
        "fim",
      ],
    );
  }
  assert.notEqual(j.sessoes[0], j.sessoes[1]);
  // [1, 2] resulta das contagens simuladas 0 e 1; não prova locks/retentativas.
});
