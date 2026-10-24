import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Usuario from "../../models/usuarioModel.js";
import Crianca from "../../models/criancaModel.js";
import Perfil from "../../models/perfilJogoModel.js";
import JogoSalvo from "../../models/jogoSalvoModel.js";
import Tarefa from "../../models/tarefaModel.js";
import Resposta from "../../models/respostaModel.js";
import Historico from "../../models/historicoJogoModel.js";
import Comodo from "../../models/comodoModel.js";
import historicoRoutes from "../../routes/historicoJogoRoutes.js";
import comodoRoutes from "../../routes/comodoRoutes.js";
import { criarCatalogo } from "./catalogo.js";
import { confirmarModels } from "./atlasSeguro.js";
import { conectarBancoTeste } from "./bancoTeste.js";

export async function prepararJogo(t) {
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
  });

  let session;
  let server;
  let usuarioId;
  let criancaId;
  let perfilId;
  const ids = {
    comodos: [],
    tarefas: [],
    respostas: [],
    usuarios: [],
    criancas: [],
    perfis: [],
    partidas: [],
  };

  const partidas = new Map();
  const estrelasPerfis = new Map();
  async function criarPartida(personagem) {
    const partidaId = new mongoose.Types.ObjectId();
    ids.partidas.push(partidaId);
    const [partida] = await JogoSalvo.create(
      [
        {
          _id: partidaId,
          perfilJogoId: personagem._id,
          nomeJogo: "Partida de regressão",
          estrelasTotal: personagem.estrelasTotal,
        },
      ],
      { session },
    );
    partidas.set(String(personagem._id), partida);
    estrelasPerfis.set(String(personagem._id), personagem.estrelasTotal);
    return partida;
  }

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
        if (mongoose.connection.readyState === 1) confirmarModels(mongoose.connection);
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
          [Usuario, ids.usuarios],
          [Crianca, ids.criancas],
          [Perfil, ids.perfis],
          [JogoSalvo, ids.partidas],
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
        assert.equal(
          await Historico.countDocuments({ perfilJogoId: { $in: ids.perfis } }),
          0,
        );
      } finally {
        await mongoose.disconnect();
      }
    }
  });

  await conectarBancoTeste();

  const senha = await bcrypt.hash(randomUUID(), 12);
  confirmarModels(mongoose.connection);
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
  ids.usuarios.push(usuarioId);
  const [crianca] = await Crianca.create(
    [{ usuarioId, permissaoAtiva: true }],
    { session },
  );
  criancaId = crianca._id;
  ids.criancas.push(criancaId);
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
  ids.perfis.push(perfilId);
  await criarPartida(perfil);
  const catalogo = await criarCatalogo(session, ids);
  const tarefas = catalogo.quarto.tarefas;

  // Somente no teste: leituras reais do Service usam a transação externa.
  // Nenhum resultado de consulta ou cálculo de pontuação é simulado.
  for (const [model, metodos] of [
    [Crianca, ["findOne"]],
    [Perfil, ["findOne"]],
    [JogoSalvo, ["findOne"]],
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
    perfil,
    crianca,
    partidas,
    async criarPersonagem({
      outraCrianca = false,
      status = "ativo",
      estrelasTotal = 0,
    } = {}) {
      let donoId = criancaId;
      if (outraCrianca) {
        const novoUsuarioId = new mongoose.Types.ObjectId();
        donoId = new mongoose.Types.ObjectId();
        ids.usuarios.push(novoUsuarioId);
        ids.criancas.push(donoId);
        await Usuario.create(
          [
            {
              _id: novoUsuarioId,
              nome: "Outra criança fictícia",
              email: `teste-${randomUUID()}@example.invalid`,
              senha,
              perfil: "crianca",
            },
          ],
          { session },
        );
        await Crianca.create(
          [
            {
              _id: donoId,
              usuarioId: novoUsuarioId,
              permissaoAtiva: true,
            },
          ],
          { session },
        );
      }
      const novoPerfilId = new mongoose.Types.ObjectId();
      ids.perfis.push(novoPerfilId);
      const [personagem] = await Perfil.create(
        [
          {
            _id: novoPerfilId,
            criancaId: donoId,
            nomeAvatar: "Personagem fictício adicional",
            imagemAvatar: "teste.png",
            status,
            estrelasTotal,
          },
        ],
        { session },
      );
      await criarPartida(personagem);
      return personagem;
    },
    async estadoPersonagens() {
      return {
        perfis: await Perfil.find({ _id: { $in: ids.perfis } })
          .sort({ _id: 1 })
          .session(session)
          .lean(),
        partidas: await JogoSalvo.find({ _id: { $in: ids.partidas } })
          .sort({ _id: 1 })
          .session(session)
          .lean(),
        historicos: await Historico.find({ criancaId: { $in: ids.criancas } })
          .sort({ _id: 1 })
          .session(session)
          .lean(),
      };
    },
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
    async responder(
      tarefa,
      dificuldade,
      correta = true,
      autenticar = true,
      campos = {},
    ) {
      const headers = { "Content-Type": "application/json" };
      if (autenticar) headers.Authorization = `Bearer ${token}`;
      const resposta = await fetch(url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          perfilJogoId: String(perfilId),
          jogoSalvoId: String(
            (
              partidas.get(String(campos.perfilJogoId ?? perfilId)) ??
              partidas.get(String(perfilId))
            )._id,
          ),
          tarefaId: String(tarefa._id),
          respostaEscolhidaId: String(
            (correta ? tarefa.correta : tarefa.incorreta)._id,
          ),
          dificuldade,
          ...campos,
        }),
      });
      return { status: resposta.status, dados: await resposta.json() };
    },
    async verificarEstado(estrelas, historicos, personagemId = perfilId) {
      const atual = await Perfil.findById(personagemId).session(session).lean();
      assert.equal(
        atual.estrelasTotal,
        estrelasPerfis.get(String(personagemId)),
        "Resposta não altera estrelas do personagem",
      );
      const partida = await JogoSalvo.findById(
        partidas.get(String(personagemId))._id,
      )
        .session(session)
        .lean();
      assert.equal(partida.estrelasTotal, estrelas);
      assert.equal(
        await Historico.countDocuments({ perfilJogoId: personagemId }),
        historicos,
      );
    },
  };
}
