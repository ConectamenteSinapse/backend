import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Usuario from "../../models/usuarioModel.js";
import Crianca from "../../models/criancaModel.js";
import Responsavel from "../../models/responsavelModel.js";
import Perfil from "../../models/perfilJogoModel.js";
import Historico from "../../models/historicoJogoModel.js";
import Comodo from "../../models/comodoModel.js";
import Tarefa from "../../models/tarefaModel.js";
import Resposta from "../../models/respostaModel.js";
import criancaRoutes from "../../routes/criancaRoutes.js";
import progressoRoutes from "../../routes/progressoRoutes.js";
import { criarCatalogo } from "./catalogo.js";

export async function prepararProgresso(t) {
  dotenv.config({ quiet: true });
  assert.ok(process.env.MONGO_URI, "Configure MONGO_URI no .env");
  // Chave exclusiva deste processo de teste; não usa credenciais JWT reais.
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
  });
  let session;
  let server;
  let client;
  const comandos = [];
  const monitorar = (evento) => comandos.push(evento.commandName);
  const registros = new Map();
  const ids = { comodos: [], tarefas: [], respostas: [] };

  t.after(async () => {
    try {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((erro) => (erro ? reject(erro) : resolve()));
          server.closeIdleConnections();
        });
      }
    } finally {
      client?.off("commandStarted", monitorar);
      t.mock.restoreAll();
      try {
        if (session) {
          try {
            if (session.inTransaction()) await session.abortTransaction();
          } finally {
            await session.endSession();
          }
        }
        // Sem exclusões: cada ID fictício deve desaparecer após o abort.
        for (const [model, lista] of registros) {
          assert.equal(await model.countDocuments({ _id: { $in: lista } }), 0);
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
      monitorCommands: true,
    });
  } catch {
    throw new Error("Não foi possível conectar ao Atlas configurado no .env");
  }
  session = await mongoose.startSession();
  session.startTransaction();

  async function inserir(model, documentos) {
    const lista = documentos.map((doc) => ({
      _id: new mongoose.Types.ObjectId(),
      ...doc,
    }));
    registros.set(
      model,
      lista.map((doc) => doc._id),
    );
    return model.create(lista, { session, ordered: true });
  }

  const usuarios = await inserir(
    Usuario,
    ["crianca", "crianca", "responsavel", "responsavel"].map((perfil) => ({
      nome: "Usuário fictício de progresso",
      email: `progresso-${randomUUID()}@example.invalid`,
      senha: "hash-ficticio-nao-utilizado-para-login",
      perfil,
    })),
  );
  const responsaveis = await inserir(
    Responsavel,
    usuarios.slice(2).map((usuario) => ({ usuarioId: usuario._id })),
  );
  const criancas = await inserir(
    Crianca,
    usuarios.slice(0, 2).map((usuario) => ({
      usuarioId: usuario._id,
      responsavelId: responsaveis[0]._id,
      permissaoAtiva: true,
    })),
  );
  const [perfil] = await inserir(Perfil, [
    {
      criancaId: criancas[0]._id,
      nomeAvatar: "Progresso fictício",
      imagemAvatar: "teste.png",
      estrelasTotal: 4,
    },
  ]);
  // Registra os IDs antes de criar o catálogo, inclusive se sua criação falhar.
  registros.set(Comodo, ids.comodos);
  registros.set(Tarefa, ids.tarefas);
  registros.set(Resposta, ids.respostas);
  const catalogo = await criarCatalogo(session, ids);
  const tarefas = catalogo.quarto.tarefas;
  // Ordem de inserção propositalmente diferente da ordem cronológica.
  const interacoes = [
    [0, "facil", true, 2, "2026-01-02T10:00:00Z"],
    [1, "facil", false, 1, "2026-01-05T10:00:00Z"],
    [0, "facil", false, 1, "2026-01-01T10:00:00Z"],
    [0, "medio", true, 1, "2026-01-04T10:00:00Z"],
    [0, "facil", true, 3, "2026-01-03T10:00:00Z"],
  ];
  await inserir(
    Historico,
    interacoes.map(([indice, dificuldade, acertou, tentativa, dataHora]) => ({
      perfilJogoId: perfil._id,
      criancaId: criancas[0]._id,
      comodoId: catalogo.quarto._id,
      tarefaId: tarefas[indice]._id,
      respostaEscolhidaId:
        tarefas[indice][acertou ? "correta" : "incorreta"]._id,
      dificuldade,
      acertou,
      tentativa,
      dataHora: new Date(dataHora),
    })),
  );

  // Apenas injeta a sessão: filtros, ordenação e resultados são reais.
  for (const [model, metodo] of [
    [Crianca, "findOne"],
    [Responsavel, "findOne"],
    [Historico, "find"],
  ]) {
    const original = model[metodo];
    t.mock.method(model, metodo, function (...args) {
      return original.apply(this, args).session(session);
    });
  }
  const tokens = usuarios.map((usuario) =>
    jwt.sign(
      { id: String(usuario._id), perfil: usuario.perfil },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    ),
  );
  const app = express();
  // Mesma ordem e mesmo prefixo do index.js, sem importar seu bootstrap.
  app.use("/criancas", criancaRoutes);
  app.use("/criancas", progressoRoutes);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  client = mongoose.connection.getClient();
  client.on("commandStarted", monitorar);

  return {
    usuarios,
    criancas,
    tarefas,
    comandos,
    async consultar(id = usuarios[0]._id, ator = 0) {
      const resposta = await fetch(
        `http://127.0.0.1:${server.address().port}/criancas/${id}`,
        {
          headers:
            ator === null ? {} : { Authorization: `Bearer ${tokens[ator]}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      return { status: resposta.status, dados: await resposta.json() };
    },
    async estado() {
      const estado = {};
      for (const [model, lista] of registros) {
        estado[model.modelName] = await model
          .find({ _id: { $in: lista } })
          .sort({ _id: 1 })
          .session(session)
          .lean();
      }
      return estado;
    },
  };
}
