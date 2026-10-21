import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Usuario from "../models/usuarioModel.js";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import JogoSalvo from "../models/jogoSalvoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import historicoRoutes from "../routes/historicoJogoRoutes.js";
import {
  conectarBancoCommitReal,
  confirmarBancoCommitReal,
  prepararColecoesCommitReal,
  motivoIgnorarCommitReal,
} from "./helpers/bancoCommitReal.js";
import { criarCatalogo } from "./helpers/catalogo.js";

// Não carrega configuração nem tenta conexão no npm test normal.
if (process.env.RUN_COMMIT_REAL_TESTS === "1") dotenv.config({ quiet: true });

test(
  "Commit real e concorrência em banco exclusivo de testes",
  {
    skip: motivoIgnorarCommitReal(),
  },
  async (t) => {
    let server;
    let conexao;
    const execucaoId = `issue72-${randomUUID()}`;
    const segredoAnterior = process.env.JWT_SECRET;
    const registros = new Map();
    const catalogoIds = { comodos: [], tarefas: [], respostas: [] };
    const comandos = [];
    let client;
    const monitorar = (evento) => comandos.push(evento.commandName);

    t.after(async () => {
      try {
        if (server) {
          await new Promise((resolve, reject) => {
            server.close((erro) => (erro ? reject(erro) : resolve()));
            server.closeIdleConnections();
          });
        }
        t.mock.restoreAll();
        client?.off("commandStarted", monitorar);
        if (conexao) {
          confirmarBancoCommitReal(conexao);
          // Somente IDs fictícios deste banco, sem apagar coleções.
          const perfisCriados = registros.get(Perfil) ?? [];
          if (perfisCriados.length) {
            await Historico.deleteMany({
              perfilJogoId: { $in: perfisCriados },
            });
            assert.equal(
              await Historico.countDocuments({
                perfilJogoId: { $in: perfisCriados },
              }),
              0,
            );
          }
          for (const [model, ids] of registros) {
            if (!ids.length) continue;
            await model.deleteMany({ _id: { $in: ids } });
            assert.equal(await model.countDocuments({ _id: { $in: ids } }), 0);
          }
        }
      } finally {
        await mongoose.disconnect();
        if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = segredoAnterior;
      }
    });

    conexao = await conectarBancoCommitReal({ monitorCommands: true });
    t.diagnostic("Banco confirmado antes das gravações: conectamente_test");
    await prepararColecoesCommitReal(conexao);
    client = mongoose.connection.getClient();
    client.on("commandStarted", monitorar);
    process.env.JWT_SECRET = randomUUID();

    async function inserir(model, documento) {
      confirmarBancoCommitReal(conexao);
      const _id = new mongoose.Types.ObjectId();
      if (!registros.has(model)) registros.set(model, []);
      registros.get(model).push(_id);
      return model.create({ _id, ...documento });
    }
    const usuario = await inserir(Usuario, {
      nome: `Usuário fictício ${execucaoId}`,
      email: `${execucaoId}@example.invalid`,
      senha: randomUUID(),
      perfil: "crianca",
    });
    const crianca = await inserir(Crianca, {
      usuarioId: usuario._id,
      permissaoAtiva: true,
    });
    registros.set(Comodo, catalogoIds.comodos);
    registros.set(Tarefa, catalogoIds.tarefas);
    registros.set(Resposta, catalogoIds.respostas);
    const catalogo = await criarCatalogo(null, catalogoIds, execucaoId);
    const tarefa = catalogo.quarto.tarefas[0];
    const token = jwt.sign(
      { id: String(usuario._id), perfil: "crianca" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );
    const app = express();
    app.use(express.json());
    app.use("/historico-jogo", historicoRoutes);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    const partidas = new Map();
    async function novoPerfil() {
      const perfil = await inserir(Perfil, {
        criancaId: crianca._id,
        nomeAvatar: `Personagem fictício ${execucaoId}`,
        imagemAvatar: "teste.png",
        estrelasTotal: 0,
        status: "ativo",
      });
      const partida = await inserir(JogoSalvo, {
        perfilJogoId: perfil._id,
        nomeJogo: "Commit real",
      });
      partidas.set(String(perfil._id), partida);
      return perfil;
    }

    async function responder(perfil, correta) {
      confirmarBancoCommitReal(conexao);
      const resposta = await fetch(
        `http://127.0.0.1:${server.address().port}/historico-jogo/responder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            perfilJogoId: String(perfil._id),
            jogoSalvoId: String(partidas.get(String(perfil._id))._id),
            tarefaId: String(tarefa._id),
            respostaEscolhidaId: String(
              tarefa[correta ? "correta" : "incorreta"]._id,
            ),
            dificuldade: "facil",
          }),
        },
      );
      return { status: resposta.status, dados: await resposta.json() };
    }

    async function lerAposCommit(perfil) {
      // Outra conexão, sem a sessão do Service ou mocks de consulta.
      const leitura = await conectarBancoCommitReal({ leitura: true });
      try {
        const historicos = await leitura.db
          .collection(Historico.collection.name)
          .find({ jogoSalvoId: partidas.get(String(perfil._id))._id })
          .sort({ tentativa: 1 })
          .toArray();
        if (!registros.has(Historico)) registros.set(Historico, []);
        registros.get(Historico).push(...historicos.map((h) => h._id));
        const atual = await leitura.db
          .collection(Perfil.collection.name)
          .findOne({ _id: perfil._id });
        assert.equal(
          atual.estrelasTotal,
          0,
          "Estrelas do personagem devem ser preservadas",
        );
        const partida = await leitura.db
          .collection(JogoSalvo.collection.name)
          .findOne({ _id: partidas.get(String(perfil._id))._id });
        assert.equal(String(partida.tarefaId), String(tarefa._id));
        assert.equal(String(partida.comodoId), String(tarefa.comodoId));
        assert.equal(partida.dificuldade, "facil");
        return { historicos, estrelas: partida.estrelasTotal };
      } finally {
        await leitura.close();
      }
    }

    await t.test(
      "HTTP 201: histórico e estrelas persistem após commit em outra conexão",
      async () => {
        const perfil = await novoPerfil();
        const inicio = comandos.length;
        assert.deepEqual(await responder(perfil, true), {
          status: 201,
          dados: {
            acertou: true,
            tentativa: 1,
            pontuacaoGanha: 1,
            dificuldade: "facil",
          },
        });
        const { historicos, estrelas } = await lerAposCommit(perfil);
        assert.equal(historicos.length, 1);
        assert.equal(String(historicos[0].criancaId), String(crianca._id));
        assert.equal(String(historicos[0].tarefaId), String(tarefa._id));
        assert.equal(historicos[0].pontuacaoGanha, 1);
        assert.equal(historicos[0].tentativa, 1);
        assert.equal(estrelas, 1);
        assert.ok(comandos.slice(inicio).includes("commitTransaction"));
        assert.ok(!comandos.slice(inicio).includes("abortTransaction"));
      },
    );

    for (const [nome, escolhas] of [
      ["dois acertos", [true, true]],
      ["dois erros", [false, false]],
      ["acerto e erro", [true, false]],
    ]) {
      await t.test(
        `Requisições simultâneas (${nome}): tentativas distintas e estrelas corretas`,
        async (s) => {
          const perfil = await novoPerfil();
          // Atrasa as primeiras leituras reais para forçar a janela da corrida.
          // Timeout permite progresso quando a implementação serializa antes de ler.
          // Não substitui resultados, sessões, withTransaction ou commits.
          const original = Historico.countDocuments;
          let leituras = 0;
          let liberar;
          const barreira = new Promise((resolve) => {
            liberar = resolve;
          });
          const timer = setTimeout(liberar, 1500);
          s.after(() => clearTimeout(timer));
          s.mock.method(Historico, "countDocuments", function (...args) {
            const query = original.apply(this, args);
            const executar = query.exec;
            query.exec = async function (...execArgs) {
              const resultado = await executar.apply(this, execArgs);
              if (this.getOptions().session && leituras < 2) {
                leituras++;
                if (leituras === 2) liberar();
                await barreira;
              }
              return resultado;
            };
            return query;
          });
          const resultados = await Promise.all(
            escolhas.map((correta) => responder(perfil, correta)),
          );
          // Lê e registra IDs para limpeza mesmo quando a asserção da corrida falha.
          const { historicos, estrelas } = await lerAposCommit(perfil);
          assert.deepEqual(
            resultados.map((r) => r.status),
            [201, 201],
          );
          assert.equal(historicos.length, 2);
          assert.equal(estrelas, escolhas.filter(Boolean).length);
          assert.deepEqual(
            historicos.map((h) => h.tentativa),
            [1, 2],
          );
          assert.deepEqual(
            resultados.map((r) => r.dados.tentativa).sort(),
            [1, 2],
          );
        },
      );
    }
  },
);
