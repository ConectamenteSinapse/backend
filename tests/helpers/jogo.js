import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Usuario from "../../models/usuarioModel.js";
import Crianca from "../../models/criancaModel.js";
import Perfil from "../../models/perfilJogoModel.js";
import Tarefa from "../../models/tarefaModel.js";
import Resposta from "../../models/respostaModel.js";
import Historico from "../../models/historicoJogoModel.js";
import Comodo from "../../models/comodoModel.js";
import historicoRoutes from "../../routes/historicoJogoRoutes.js";
import comodoRoutes from "../../routes/comodoRoutes.js";
import { criarCatalogo } from "./catalogo.js";

export async function prepararJogo(t, { catalogoTemporario = false } = {}) {
  dotenv.config({ quiet: true });
  assert.ok(process.env.MONGO_URI, "Configure MONGO_URI no .env");
  assert.ok(process.env.JWT_SECRET, "Configure JWT_SECRET no .env");

  let session;
  let server;
  let usuarioId;
  let criancaId;
  let perfilId;
  const ids = { comodos: [], tarefas: [], respostas: [] };

  // Também encerra recursos se a preparação falhar.
  t.after(async () => {
    try {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeIdleConnections();
        });
      }
    } finally {
      t.mock.restoreAll();
      try {
        if (session) {
          try {
            if (session.inTransaction()) await session.abortTransaction();
          } finally {
            await session.endSession();
          }
        }
        // Fora da transação, confirma que nada foi persistido.
        if (perfilId) {
          assert.equal(await Usuario.countDocuments({ _id: usuarioId }), 0);
          assert.equal(await Crianca.countDocuments({ _id: criancaId }), 0);
          assert.equal(await Perfil.countDocuments({ _id: perfilId }), 0);
          assert.equal(
            await Historico.countDocuments({ perfilJogoId: perfilId }),
            0,
          );
        }
        for (const [model, lista] of [
          [Comodo, ids.comodos],
          [Tarefa, ids.tarefas],
          [Resposta, ids.respostas],
        ]) {
          if (lista.length)
            assert.equal(
              await model.countDocuments({ _id: { $in: lista } }),
              0,
            );
        }
      } finally {
        await mongoose.disconnect();
      }
    }
  });

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
    });
  } catch {
    // Erros originais de conexão podem conter a URI.
    throw new Error("Não foi possível conectar ao Atlas configurado no .env");
  }

  let tarefas;
  if (!catalogoTemporario) {
    // Verifica vínculos existentes sem ler nomes, emails ou hashes de senha.
    const [origem] = await Crianca.aggregate([
      { $match: { permissaoAtiva: true } },
      {
        $lookup: {
          from: Usuario.collection.name,
          localField: "usuarioId",
          foreignField: "_id",
          as: "usuario",
        },
      },
      { $match: { "usuario.perfil": "crianca" } },
      {
        $lookup: {
          from: Perfil.collection.name,
          localField: "_id",
          foreignField: "criancaId",
          as: "perfil",
        },
      },
      { $match: { "perfil.status": "ativo" } },
      { $project: { _id: 1 } },
      { $limit: 1 },
    ]);
    assert.ok(
      origem,
      "É necessária uma criança existente com permissão e perfil ativo",
    );

    const tarefasAtivas = await Tarefa.find({ ativo: true })
      .sort({ ordem: 1 })
      .lean();
    const grupos = Map.groupBy(tarefasAtivas, (tarefa) =>
      String(tarefa.comodoId),
    );
    const candidatos = [...grupos.values()]
      .filter((tarefas) => tarefas.length >= 2 && tarefas.length <= 5)
      .sort((a, b) => a.length - b.length);
    assert.ok(
      candidatos.length,
      "É necessário um cômodo com 2 a 5 tarefas ativas para limitar as requisições",
    );
    tarefas = candidatos[0];
    assert.ok(
      tarefas[0].ordem < tarefas.at(-1).ordem,
      "As tarefas precisam ter ordens distintas",
    );
    const respostas = await Resposta.find({
      tarefaId: { $in: tarefas.map((tarefa) => tarefa._id) },
    }).lean();
    for (const tarefa of tarefas) {
      tarefa.correta = respostas.find(
        (resposta) =>
          String(resposta.tarefaId) === String(tarefa._id) && resposta.correta,
      );
      assert.ok(
        tarefa.correta,
        "Toda tarefa precisa de uma alternativa correta",
      );
    }
    tarefas[0].incorreta = respostas.find(
      (resposta) =>
        String(resposta.tarefaId) === String(tarefas[0]._id) &&
        !resposta.correta,
    );
    assert.ok(
      tarefas[0].incorreta,
      "A primeira tarefa precisa de uma alternativa incorreta",
    );
  }

  const senha = await bcrypt.hash(randomUUID(), 12);
  session = await mongoose.startSession();
  session.startTransaction();

  // Jogador sem progresso, independente do histórico existente.
  const [usuario] = await Usuario.create(
    [
      {
        nome: "Criança fictícia de teste",
        email: `teste-${randomUUID()}@example.invalid`,
        senha,
        perfil: "crianca",
      },
    ],
    { session },
  );
  usuarioId = usuario._id;
  const [crianca] = await Crianca.create(
    [{ usuarioId, permissaoAtiva: true }],
    { session },
  );
  criancaId = crianca._id;
  const [perfil] = await Perfil.create(
    [
      {
        criancaId,
        nomeAvatar: "Teste automatizado",
        imagemAvatar: "teste.png",
        status: "ativo",
        estrelasTotal: 0,
      },
    ],
    { session },
  );
  perfilId = perfil._id;
  const catalogo = catalogoTemporario
    ? await criarCatalogo(session, ids)
    : undefined;
  if (catalogo) tarefas = catalogo.quarto.tarefas;

  // Somente no teste: leituras reais do Service usam a transação externa.
  // Nenhum resultado de consulta ou cálculo de pontuação é simulado.
  for (const [model, metodos] of [
    [Crianca, ["findOne"]],
    [Perfil, ["findOne"]],
    [Tarefa, ["find", "findById", "countDocuments"]],
    [Comodo, ["find", "findById"]],
    [Resposta, ["findOne"]],
    [Historico, ["distinct", "countDocuments"]],
  ]) {
    for (const metodo of metodos) {
      const original = model[metodo];
      t.mock.method(model, metodo, function (...args) {
        return original.apply(this, args).session(session);
      });
    }
  }

  // O Service usa a sessão externa sem confirmar ou encerrá-la.
  // O hook acima sempre aborta a transação real no Atlas.
  t.mock.method(mongoose, "startSession", async () => session);
  t.mock.method(session, "withTransaction", async (callback) =>
    callback(session),
  );
  t.mock.method(session, "endSession", async () => {});

  const token = jwt.sign(
    { id: String(usuarioId), perfil: "crianca" },
    process.env.JWT_SECRET,
    { expiresIn: "5m" },
  );
  const app = express();
  app.use(express.json());
  app.use("/historico-jogo", historicoRoutes);
  app.use("/comodos", comodoRoutes);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/historico-jogo/responder`;

  return {
    tarefas,
    catalogo,
    async listarTarefas(comodoId) {
      const resposta = await fetch(
        `http://127.0.0.1:${server.address().port}/comodos/${comodoId}/tarefas`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      return { status: resposta.status, dados: await resposta.json() };
    },
    async responder(tarefa, dificuldade, correta = true, autenticar = true) {
      const headers = { "Content-Type": "application/json" };
      if (autenticar) headers.Authorization = `Bearer ${token}`;
      const resposta = await fetch(url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          tarefaId: String(tarefa._id),
          respostaEscolhidaId: String(
            (correta ? tarefa.correta : tarefa.incorreta)._id,
          ),
          dificuldade,
        }),
      });
      return { status: resposta.status, dados: await resposta.json() };
    },
    async verificarEstado(estrelas, historicos) {
      const atual = await Perfil.findById(perfilId).session(session).lean();
      assert.equal(atual.estrelasTotal, estrelas);
      assert.equal(
        await Historico.countDocuments({ perfilJogoId: perfilId }),
        historicos,
      );
    },
  };
}
