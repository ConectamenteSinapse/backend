import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Crianca from "../../models/criancaModel.js";
import Perfil from "../../models/perfilJogoModel.js";
import Jogo from "../../models/jogoSalvoModel.js";
import Historico from "../../models/historicoJogoModel.js";
import Comodo from "../../models/comodoModel.js";
import Tarefa from "../../models/tarefaModel.js";
import Resposta from "../../models/respostaModel.js";
import jogoRoutes from "../../routes/jogoSalvoRoutes.js";
import respostaRoutes from "../../routes/historicoJogoRoutes.js";
import progressoRoutes from "../../routes/progressoRoutes.js";
import historicoRoutes from "../../routes/historicoConsultaRoutes.js";

export { Crianca, Perfil, Jogo, Historico, Comodo, Tarefa, Resposta };
export const id = () => new mongoose.Types.ObjectId();
const igual = (a, b) => String(a) === String(b);
function corresponde(doc, filtro) {
  return Object.entries(filtro).every(([campo, valor]) => {
    if (valor && typeof valor === "object" && !valor._bsontype) {
      if ("$in" in valor) return valor.$in.some((v) => igual(doc[campo], v));
      if ("$lt" in valor) return doc[campo] < valor.$lt;
    }
    return igual(doc[campo], valor);
  });
}

// Persistência em memória, schemas/queries/HTTP/JWT/services reais.
// Não reproduz locks, isolamento, retry, commit, rollback ou índices do MongoDB.
// As barreiras dos testes verificam o protocolo e janelas entre operações apenas.
export async function preparar(t) {
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  t.after(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  t.mock.method(mongoose, "connect", () => {
    throw new Error("MongoDB proibido nesta suíte");
  });
  t.mock.method(mongoose, "createConnection", () => {
    throw new Error("MongoDB proibido nesta suíte");
  });
  t.mock.method(console, "error", () => {});
  const modelos = [Crianca, Perfil, Jogo, Historico, Comodo, Tarefa, Resposta];
  const dados = new Map(modelos.map((m) => [m, new Map()]));
  const eventos = [];
  let antesQuery = async () => {};
  let antesSave = async () => {};
  function inserir(model, valores) {
    const doc = new model(valores);
    dados.get(model).set(String(doc._id), doc.toObject());
    return doc;
  }
  function linhas(model) {
    return [...dados.get(model).values()];
  }
  const usuarioId = id();
  const crianca = inserir(Crianca, { usuarioId, permissaoAtiva: true });
  const perfil = inserir(Perfil, {
    criancaId: crianca._id,
    nomeAvatar: "Avatar",
    imagemAvatar: "avatar.png",
  });
  const comodos = [1, 2].map((ordem) =>
    inserir(Comodo, {
      nome: `C${ordem}`,
      descricao: "Teste",
      imagemCenario: "c.png",
      ordem,
      dificuldadesDisponiveis: ["facil", "medio", "dificil"],
    }),
  );
  const tarefas = comodos.map((comodo) =>
    [1, 2].map((ordem) =>
      inserir(Tarefa, {
        titulo: `T${ordem}`,
        enunciado: "Teste",
        descricao: "Teste",
        comodoId: comodo._id,
        imagemObjeto: "t.png",
        posicao: { x: 0, y: 0, largura: 1, altura: 1 },
        ordem,
        dificuldade: "facil",
      }),
    ),
  );
  for (const tarefa of tarefas.flat()) {
    for (const correta of [true, false])
      inserir(Resposta, {
        tarefaId: tarefa._id,
        texto: String(correta),
        correta,
        ordem: correta ? 1 : 2,
      });
  }
  for (const model of [Jogo, Historico]) {
    t.mock.method(model, "create", async (valores, opcoes) => {
      const docs = Array.isArray(valores) ? valores : [valores];
      const criados = [];
      for (const valor of docs) {
        const doc = new model(valor);
        await doc.validate();
        dados.get(model).set(String(doc._id), doc.toObject());
        criados.push(doc);
      }
      eventos.push({ op: "create", model, opcoes });
      return Array.isArray(valores) ? criados : criados[0];
    });
  }
  t.mock.method(Jogo.prototype, "save", async function () {
    await antesSave(this);
    await this.validate();
    const armazenado = dados.get(Jogo).get(String(this._id));
    if (!armazenado)
      throw new mongoose.Error.DocumentNotFoundError({ _id: this._id });
    // Mongoose save envia somente caminhos modificados; evita falso overwrite de estrelas.
    const objeto = this.toObject({ depopulate: true });
    for (const campo of this.directModifiedPaths())
      armazenado[campo] = objeto[campo];
    eventos.push({ op: "save", model: Jogo });
    return this;
  });
  t.mock.method(mongoose.Query.prototype, "exec", async function () {
    assert.ok(
      dados.has(this.model),
      `Model inesperado: ${this.model.modelName}`,
    );
    this.cast();
    const filtro = this.getFilter();
    eventos.push({
      op: this.op,
      model: this.model,
      filtro,
      update: this.getUpdate(),
      opcoes: this.getOptions(),
    });
    await antesQuery(this);
    const tabela = dados.get(this.model);
    let resultados = linhas(this.model).filter((doc) =>
      corresponde(doc, filtro),
    );
    if (this.op === "countDocuments") return resultados.length;
    if (this.op === "distinct")
      return [
        ...new Map(
          resultados.map((doc) => [
            String(doc[this._distinct]),
            doc[this._distinct],
          ]),
        ).values(),
      ];
    if (this.op === "deleteOne") {
      if (resultados[0]) tabela.delete(String(resultados[0]._id));
      return { acknowledged: true, deletedCount: resultados.length ? 1 : 0 };
    }
    if (this.op === "findOneAndUpdate") {
      if (!resultados[0]) return null;
      const doc = resultados[0];
      const update = this.getUpdate();
      for (const operador of Object.keys(update))
        assert.ok(["$inc", "$currentDate", "$set"].includes(operador));
      for (const [campo, valor] of Object.entries(update.$inc ?? {}))
        doc[campo] = (doc[campo] ?? 0) + valor;
      for (const campo of Object.keys(update.$currentDate ?? {}))
        doc[campo] = new Date();
      Object.assign(doc, update.$set ?? {});
      return this.model.hydrate(doc);
    }
    assert.ok(
      ["find", "findOne"].includes(this.op),
      `Operação inesperada: ${this.op}`,
    );
    const sort = this.getOptions().sort;
    if (sort)
      resultados.sort((a, b) => {
        for (const [campo, direcao] of Object.entries(sort)) {
          if (a[campo] > b[campo]) return direcao;
          if (a[campo] < b[campo]) return -direcao;
        }
        return 0;
      });
    resultados = resultados.map((doc) => {
      const hidratado = this.model.hydrate(doc);
      if (this.mongooseOptions().populate?.perfilJogoId) {
        const perfil = dados.get(Perfil).get(String(doc.perfilJogoId));
        hidratado.perfilJogoId = perfil ? Perfil.hydrate(perfil) : null;
      }
      if (!this.mongooseOptions().lean) return hidratado;
      const objeto = hidratado.toObject();
      const campos = this.projection();
      return campos
        ? Object.fromEntries(
            Object.entries(objeto).filter(
              ([campo]) => campo === "_id" || campos[campo] === 1,
            ),
          )
        : objeto;
    });
    return this.op === "findOne" ? (resultados[0] ?? null) : resultados;
  });
  const sessoes = [];
  t.mock.method(mongoose, "startSession", async () => {
    class SessaoSimulada {
      async withTransaction(callback) {
        return callback();
      }
      async endSession() {
        this.encerrada = true;
      }
    }
    const session = new SessaoSimulada();
    sessoes.push(session);
    return session;
  });
  const app = express();
  app.use(express.json());
  app.use("/jogos-salvos", jogoRoutes);
  app.use("/historico-jogo", respostaRoutes);
  app.use("/criancas", progressoRoutes);
  app.use("/criancas", historicoRoutes);
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  await once(server, "listening");
  function token(claims = {}, options = {}) {
    return jwt.sign(
      { id: String(usuarioId), perfil: "crianca", ...claims },
      process.env.JWT_SECRET,
      { expiresIn: "5m", ...options },
    );
  }
  async function chamar(
    method,
    caminho = "",
    body,
    authorization = `Bearer ${token()}`,
  ) {
    const headers = { "Content-Type": "application/json" };
    if (authorization !== null) headers.Authorization = authorization;
    const url =
      caminho.startsWith("/historico-jogo") || caminho.startsWith("/criancas")
        ? caminho
        : `/jogos-salvos${caminho}`;
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: res.status,
      dados: res.status === 204 ? null : await res.json(),
    };
  }
  function novaPartida(valores = {}) {
    return inserir(Jogo, {
      perfilJogoId: perfil._id,
      nomeJogo: "Partida",
      ...valores,
    });
  }
  function bodyResposta(
    jogo,
    tarefa = tarefas[0][0],
    correta = true,
    dificuldade = "facil",
  ) {
    const resposta = linhas(Resposta).find(
      (r) => igual(r.tarefaId, tarefa._id) && r.correta === correta,
    );
    return {
      perfilJogoId: String(perfil._id),
      jogoSalvoId: String(jogo._id),
      tarefaId: String(tarefa._id),
      respostaEscolhidaId: String(resposta._id),
      dificuldade,
    };
  }
  return {
    dados,
    eventos,
    sessoes,
    usuarioId,
    crianca,
    perfil,
    comodos,
    tarefas,
    inserir,
    linhas,
    novaPartida,
    bodyResposta,
    chamar,
    token,
    antesQuery: (callback) => {
      antesQuery = callback;
    },
    antesSave: (callback) => {
      antesSave = callback;
    },
    responder: (jogo, tarefa, correta, dificuldade) =>
      chamar(
        "POST",
        "/historico-jogo/responder",
        bodyResposta(jogo, tarefa, correta, dificuldade),
      ),
  };
}

export function barreira() {
  let liberar;
  const promise = new Promise((resolve) => {
    liberar = resolve;
  });
  return { promise, liberar };
}
