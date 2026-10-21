import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import historicoService from "../services/historicoJogoService.js";
import { arquivarPersonagem } from "../services/perfilJogoService.js";
import { criarCatalogo } from "./helpers/catalogo.js";
import {
  conectarBancoCommitReal,
  confirmarBancoCommitReal,
  prepararColecoesCommitReal,
  motivoIgnorarCommitReal,
} from "./helpers/bancoCommitReal.js";

// Sem flag: não lê .env, não abre conexão e não escreve dados.
// Reutiliza as proteções do projeto; nunca usa MONGO_URI como fallback.
const motivo = motivoIgnorarCommitReal({
  ...process.env,
  RUN_COMMIT_REAL_TESTS: process.env.RUN_CONCORRENCIA_REAL_TESTS,
});
const opcoes = {
  skip:
    motivo &&
    motivo.replaceAll("RUN_COMMIT_REAL_TESTS", "RUN_CONCORRENCIA_REAL_TESTS"),
  timeout: 45000,
};

function sinal() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function esperar(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Barreira de concorrência não alcançada")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function preparar(t) {
  let conexao;
  let leitura;
  const registros = new Map();
  const ids = { comodos: [], tarefas: [], respostas: [] };
  const comandos = [];
  const monitorar = (evento) => comandos.push(evento.commandName);
  t.after(async () => {
    t.mock.restoreAll();
    try {
      if (conexao) {
        conexao.getClient().off("commandStarted", monitorar);
        confirmarBancoCommitReal(conexao);
        const perfis = registros.get(Perfil) ?? [];
        if (perfis.length) {
          await Historico.deleteMany({ perfilJogoId: { $in: perfis } });
          assert.equal(
            await Historico.countDocuments({ perfilJogoId: { $in: perfis } }),
            0,
          );
        }
        for (const [model, lista] of registros) {
          if (!lista.length) continue;
          await model.deleteMany({ _id: { $in: lista } });
          assert.equal(await model.countDocuments({ _id: { $in: lista } }), 0);
        }
      }
    } finally {
      try {
        await leitura?.close();
      } finally {
        await mongoose.disconnect();
      }
    }
  });
  conexao = await conectarBancoCommitReal({ monitorCommands: true });
  await prepararColecoesCommitReal(conexao);
  conexao.getClient().on("commandStarted", monitorar);
  leitura = await conectarBancoCommitReal({ leitura: true });
  async function inserir(model, dados) {
    confirmarBancoCommitReal(conexao);
    const _id = new mongoose.Types.ObjectId();
    if (!registros.has(model)) registros.set(model, []);
    registros.get(model).push(_id);
    return model.create({ _id, ...dados });
  }
  const crianca = await inserir(Crianca, {
    usuarioId: new mongoose.Types.ObjectId(),
    permissaoAtiva: true,
  });
  registros.set(Comodo, ids.comodos);
  registros.set(Tarefa, ids.tarefas);
  registros.set(Resposta, ids.respostas);
  const catalogo = await criarCatalogo(
    null,
    ids,
    `concorrencia-${randomUUID()}`,
  );
  const tarefa = catalogo.quarto.tarefas[0];
  const perfil = await inserir(Perfil, {
    criancaId: crianca._id,
    nomeAvatar: "Teste concorrência",
    imagemAvatar: "teste.png",
    estrelasTotal: 7,
    status: "ativo",
  });
  return {
    perfil,
    comandos,
    responder: (correta) =>
      historicoService.registrarResposta(
        crianca.usuarioId,
        perfil._id,
        tarefa._id,
        tarefa[correta ? "correta" : "incorreta"]._id,
        "facil",
      ),
    arquivar: () => arquivarPersonagem(crianca.usuarioId, perfil._id),
    async estado() {
      confirmarBancoCommitReal(leitura);
      // Outra conexão, sem a sessão do service nem resultados simulados.
      return {
        perfil: await leitura.db
          .collection(Perfil.collection.name)
          .findOne({ _id: perfil._id }),
        historicos: await leitura.db
          .collection(Historico.collection.name)
          .find({ perfilJogoId: perfil._id })
          .sort({ tentativa: 1 })
          .toArray(),
      };
    },
    observarEscrita(callback) {
      const handler = (evento) => {
        if (
          evento.commandName === "findAndModify" &&
          String(evento.command.query?._id) === String(perfil._id)
        )
          callback(evento.command);
      };
      conexao.getClient().on("commandStarted", handler);
      t.after(() => conexao.getClient().off("commandStarted", handler));
    },
  };
}

// Os wrappers abaixo apenas controlam QUANDO queries reais executam.
// Não substituem resultados, startSession, withTransaction, commit ou abort.
for (const correta of [true, false]) {
  test(
    `MONGO: arquivo vence entre pré-leitura e reserva (${correta ? "acerto" : "erro, zero pontos"})`,
    opcoes,
    async (t) => {
      const j = await preparar(t);
      const entrou = sinal();
      const liberar = sinal();
      const original = Perfil.findOneAndUpdate;
      t.mock.method(Perfil, "findOneAndUpdate", function (...args) {
        const query = original.apply(this, args);
        if (args[2]?.session) {
          const executar = query.exec;
          query.exec = async function (...execArgs) {
            entrou.resolve();
            await liberar.promise;
            return executar.apply(this, execArgs);
          };
        }
        return query;
      });
      const resposta = j.responder(correta);
      const fim = Promise.allSettled([resposta]);
      try {
        await esperar(entrou.promise);
        await j.arquivar();
      } finally {
        liberar.resolve();
        await fim;
      }
      await assert.rejects(resposta, /PERFIL_JOGO_NAO_ENCONTRADO/);
      const estado = await j.estado();
      assert.equal(estado.perfil.status, "arquivado");
      assert.equal(estado.perfil.estrelasTotal, 7);
      assert.equal(estado.perfil.ultimaInteracaoEm, null);
      assert.equal(estado.historicos.length, 0);
    },
  );

  test(
    `MONGO: reserva vence e arquivo aguarda commit (${correta ? "acerto" : "erro, zero pontos"})`,
    opcoes,
    async (t) => {
      const j = await preparar(t);
      const reservou = sinal();
      const liberar = sinal();
      const arquivoEnviado = sinal();
      j.observarEscrita((command) => {
        if (command.autocommit !== false) arquivoEnviado.resolve();
      });
      const original = Historico.countDocuments;
      let pausou = false;
      t.mock.method(Historico, "countDocuments", function (...args) {
        const query = original.apply(this, args);
        const executar = query.exec;
        query.exec = async function (...execArgs) {
          const resultado = await executar.apply(this, execArgs);
          if (this.getOptions().session && !pausou) {
            pausou = true;
            reservou.resolve();
            await liberar.promise;
          }
          return resultado;
        };
        return query;
      });
      const resposta = j.responder(correta);
      let arquivo;
      let arquivoConcluido = false;
      // Instala handlers de rejeição antes de liberar qualquer barreira.
      const respostaFinal = Promise.allSettled([resposta]);
      try {
        await esperar(reservou.promise);
        arquivo = j.arquivar().finally(() => {
          arquivoConcluido = true;
        });
        arquivo.catch(() => {});
        await esperar(arquivoEnviado.promise);
        assert.equal(
          arquivoConcluido,
          false,
          "Arquivo não pode concluir enquanto a reserva está aberta",
        );
      } finally {
        liberar.resolve();
        await Promise.allSettled([resposta, ...(arquivo ? [arquivo] : [])]);
      }
      await respostaFinal;
      const registro = await resposta;
      await arquivo;
      assert.equal(registro.tentativa, 1);
      const estado = await j.estado();
      assert.equal(estado.perfil.status, "arquivado");
      assert.equal(estado.perfil.estrelasTotal, 7 + (correta ? 1 : 0));
      assert.ok(estado.perfil.ultimaInteracaoEm instanceof Date);
      assert.equal(estado.historicos.length, 1);
      assert.equal(estado.historicos[0].pontuacaoGanha, correta ? 1 : 0);
      assert.ok(j.comandos.includes("commitTransaction"));
    },
  );
}

test(
  "MONGO: resposta após arquivo não altera pontuação nem histórico existente",
  opcoes,
  async (t) => {
    const j = await preparar(t);
    await j.responder(true);
    await j.arquivar();
    const antes = await j.estado();
    for (const correta of [true, false])
      await assert.rejects(j.responder(correta), /PERFIL_JOGO_NAO_ENCONTRADO/);
    assert.deepEqual(await j.estado(), antes);
  },
);

for (const correta of [true, false]) {
  test(
    `MONGO: abort após insert real restaura perfil e histórico (${correta ? "acerto" : "erro"})`,
    opcoes,
    async (t) => {
      const j = await preparar(t);
      await j.responder(true);
      const antes = await j.estado();
      const inicio = j.comandos.length;
      const falha = new Error("Abort deliberado após insert real");
      const original = Historico.create;
      let inseriu = false;
      t.mock.method(Historico, "create", async function (...args) {
        const resultado = await original.apply(this, args);
        assert.ok(args[1].session.inTransaction());
        assert.equal(resultado.length, 1);
        inseriu = true;
        throw falha;
      });
      await assert.rejects(j.responder(correta), (erro) => erro === falha);
      assert.equal(inseriu, true);
      assert.deepEqual(await j.estado(), antes);
      assert.ok(j.comandos.slice(inicio).includes("abortTransaction"));
      assert.ok(!j.comandos.slice(inicio).includes("commitTransaction"));
    },
  );
}

for (const escolhas of [
  [true, true],
  [false, false],
  [true, false],
]) {
  test(
    `MONGO: duas respostas simultâneas ${JSON.stringify(escolhas)} mantêm tentativas 1/2`,
    opcoes,
    async (t) => {
      const j = await preparar(t);
      const primeiraReservou = sinal();
      const segundaEscrita = sinal();
      const liberar = sinal();
      let escritas = 0;
      j.observarEscrita((command) => {
        if (command.autocommit === false && ++escritas >= 2)
          segundaEscrita.resolve();
      });
      const original = Historico.countDocuments;
      let pausou = false;
      t.mock.method(Historico, "countDocuments", function (...args) {
        const query = original.apply(this, args);
        const executar = query.exec;
        query.exec = async function (...execArgs) {
          const resultado = await executar.apply(this, execArgs);
          if (this.getOptions().session && !pausou) {
            pausou = true;
            primeiraReservou.resolve();
            await liberar.promise;
          }
          return resultado;
        };
        return query;
      });
      const primeira = j.responder(escolhas[0]);
      primeira.catch(() => {});
      let segunda;
      try {
        await esperar(primeiraReservou.promise);
        segunda = j.responder(escolhas[1]);
        segunda.catch(() => {});
        await esperar(segundaEscrita.promise);
      } finally {
        liberar.resolve();
        await Promise.allSettled([primeira, ...(segunda ? [segunda] : [])]);
      }
      const resultados = await Promise.all([primeira, segunda]);
      assert.deepEqual(resultados.map((r) => r.tentativa).sort(), [1, 2]);
      const estado = await j.estado();
      assert.deepEqual(
        estado.historicos.map((h) => h.tentativa),
        [1, 2],
      );
      assert.equal(
        estado.perfil.estrelasTotal,
        7 + escolhas.filter(Boolean).length,
      );
      assert.ok(estado.perfil.ultimaInteracaoEm instanceof Date);
      assert.equal(estado.perfil.status, "ativo");
      assert.deepEqual(
        estado.historicos.map((h) => h.acertou).sort(),
        [...escolhas].sort(),
      );
    },
  );
}
