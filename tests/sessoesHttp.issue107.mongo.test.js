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
import { dadosSessaoHttp, cenariosSessoesHttp } from "./helpers/sessoesHttpIssue107.js";
import { motivoIgnorarCommitReal, conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";
import { confirmarModels, limparRegistrosTeste } from "./helpers/atlasSeguro.js";

test("#107 HTTP MongoDB: sessões, erros, isolamento e rotas existentes", {
  skip: motivoIgnorarCommitReal(), concurrency: false, timeout: 90000,
}, async t => {
  // Falha de bootstrap deve aparecer antes de qualquer conexão/inserção.
  const { default: router } = await import("../routes/jogoSalvoRoutes.js");
  let conexao, leitura, server;
  const segredoAnterior = process.env.JWT_SECRET;
  const segredo = randomUUID();
  const registros = new Map([[Jogo, []], [Perfil, []], [Crianca, []]]);
  t.after(async () => {
    const falhas = [];
    try {
      if (server) await new Promise((resolve, reject) => {
        server.close(e => e ? reject(e) : resolve()); server.closeAllConnections();
      });
    } catch { falhas.push(new Error("Falha ao fechar HTTP")); }
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza HTTP #107 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: ids } }), 0);
        t.diagnostic("Zero resíduos HTTP confirmados por conexão independente");
      }
    } catch { falhas.push(new Error("Não foi possível confirmar resíduos")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown HTTP #107 falhou");
  });
  conexao = await conectarBancoCommitReal();
  leitura = await conectarBancoCommitReal({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  process.env.JWT_SECRET = segredo;
  // Registra também IDs das partidas geradas pelo endpoint POST /, antes da
  // escrita real. O perfil deve ser uma fixture desta execução.
  const inserirJogo = Jogo.collection.insertOne;
  t.mock.method(Jogo.collection, "insertOne", function (doc, ...args) {
    assert.ok(registros.get(Perfil).some(chave => chave.equals(doc.perfilJogoId)));
    if (!registros.get(Jogo).some(chave => chave.equals(doc._id))) registros.get(Jogo).push(doc._id);
    return inserirJogo.call(this, doc, ...args);
  });
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const _id = new mongoose.Types.ObjectId();
    registros.get(Model).push(_id);
    const doc = { ...dados, _id };
    await Model.collection.insertOne(doc);
    return doc;
  }
  async function fixture(s, extras) {
    const usuarioId = new mongoose.Types.ObjectId();
    const crianca = await inserir(Crianca, { usuarioId, responsavelId: new mongoose.Types.ObjectId(), ...dadosSessaoHttp(extras) });
    const perfil = await inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "HTTP #107", imagemAvatar: "avatar.png", status: "ativo" });
    const jogo = await inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "HTTP #107", estrelasTotal: 0 });
    return { usuarioId, crianca, perfil, jogo };
  }
  const app = express();
  app.use(express.json());
  app.use("/jogos-salvos", router);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  await cenariosSessoesHttp(t, {
    fixture,
    outra: (s, f) => fixture(s),
    ler: async f => {
      confirmarModels(leitura);
      assert.ok(registros.get(Crianca).some(chave => chave.equals(f.crianca._id)));
      return JSON.parse(JSON.stringify(await leitura.db.collection(Crianca.collection.name).findOne({ _id: f.crianca._id })));
    },
    request: async (f, method, caminho, body, auth) => {
      const headers = {};
      if (auth !== null) headers.authorization = typeof auth === "string" ? auth
        : `Bearer ${jwt.sign({ id: String(f.usuarioId), perfil: "crianca", ...(auth ?? {}) }, segredo, { expiresIn: "5m" })}`;
      if (body !== undefined) headers["content-type"] = "application/json";
      const res = await fetch(`http://127.0.0.1:${server.address().port}/jogos-salvos${caminho}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
      });
      if (res.status === 204) return { status: 204, dados: null };
      assert.match(res.headers.get("content-type"), /application\/json/);
      return { status: res.status, dados: await res.json() };
    },
    conflitar: (s, f) => {
      const original = Crianca.collection.findOneAndUpdate;
      let contador = 0;
      s.mock.method(Crianca.collection, "findOneAndUpdate", async function (...args) {
        if (String(args[0]._id) === String(f.crianca._id)) {
          contador++;
          confirmarModels(leitura);
          assert.equal((await leitura.db.collection(Crianca.collection.name).updateOne({ _id: f.crianca._id },
            { $inc: { sessaoJogoVersao: 1 } })).matchedCount, 1);
        }
        return original.apply(this, args);
      });
      return () => contador;
    },
  });
});
