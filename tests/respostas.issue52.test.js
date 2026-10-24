import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import tarefaRoutes from "../routes/tarefaRoutes.js";

const id = () => new mongoose.Types.ObjectId();

// Router, autenticação, controllers, services e casting são reais.
// Somente Query.exec é simulado; nenhum index.js ou .env é carregado.
async function preparar(t) {
  const segredo = randomUUID();
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  t.after(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  for (const metodo of ["connect", "createConnection"]) {
    t.mock.method(mongoose, metodo, () => {
      assert.fail("Conexão MongoDB proibida nesta suíte");
    });
  }

  const tarefa = { _id: id() };
  const outraTarefa = { _id: id() };
  const tarefaVazia = { _id: id() };
  const respostas = [
    { _id: id(), tarefaId: tarefa._id, texto: "Terceira", correta: false, ordem: 3 },
    { _id: id(), tarefaId: outraTarefa._id, texto: "Outra tarefa", correta: true, ordem: 1 },
    { _id: id(), tarefaId: tarefa._id, texto: "Primeira", correta: true, ordem: 1 },
    { _id: id(), tarefaId: tarefa._id, texto: "Segunda", correta: false, ordem: 2 },
  ];
  const dados = new Map([
    [Tarefa, [tarefa, outraTarefa, tarefaVazia]],
    [Resposta, respostas],
  ]);
  const consultas = [];
  t.mock.method(mongoose.Query.prototype, "exec", async function () {
    assert.ok(dados.has(this.model), "Model inesperado");
    assert.equal(this.op, this.model === Tarefa ? "findOne" : "find");
    consultas.push(this.model);
    this.cast(); // Mantém o CastError real para identificadores inválidos.
    const filtro = this.getFilter();
    let linhas = dados.get(this.model).filter((doc) =>
      Object.entries(filtro).every(([campo, valor]) => String(doc[campo]) === String(valor)),
    );
    for (const [campo, direcao] of Object.entries(this.getOptions().sort ?? {})) {
      linhas = [...linhas].sort((a, b) => (a[campo] - b[campo]) * direcao);
    }
    // Aplica a projeção solicitada pelo service, sem ocultar campos por padrão.
    // Se select("-correta") for removido, o teste de ocultação deve falhar.
    const excluidos = Object.entries(this.projection() ?? {})
      .filter(([, incluir]) => incluir === 0)
      .map(([campo]) => campo.replace(/^-/, ""));
    linhas = linhas.map((doc) => Object.fromEntries(
      Object.entries(doc).filter(([campo]) => !excluidos.includes(campo)),
    ));
    return this.op === "findOne" ? (linhas[0] ?? null) : linhas;
  });

  const app = express();
  app.use("/tarefas", tarefaRoutes);
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((erro) => erro ? reject(erro) : resolve());
      server.closeAllConnections();
    });
  });
  await once(server, "listening");
  const token = jwt.sign({ id: String(id()), perfil: "crianca" }, segredo, { expiresIn: "5m" });
  async function consultar(tarefaId = tarefa._id, authorization = `Bearer ${token}`) {
    const headers = {};
    if (authorization !== null) headers.authorization = authorization;
    const resposta = await fetch(
      `http://127.0.0.1:${server.address().port}/tarefas/${tarefaId}/respostas`,
      { headers, signal: AbortSignal.timeout(10000) },
    );
    assert.match(resposta.headers.get("content-type"), /application\/json/);
    return { status: resposta.status, dados: await resposta.json() };
  }
  return { tarefa, outraTarefa, tarefaVazia, respostas, consultas, consultar };
}

test("#52: tarefa existente com respostas retorna HTTP 200 e array de alternativas", async (t) => {
  const j = await preparar(t);
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.dados));
  assert.equal(res.dados.length, 3);
  assert.deepEqual(new Set(res.dados.map((r) => r.texto)), new Set(["Primeira", "Segunda", "Terceira"]));
});

test("#52: tarefa existente sem respostas retorna HTTP 200 e []", async (t) => {
  const j = await preparar(t);
  assert.deepEqual(await j.consultar(j.tarefaVazia._id), { status: 200, dados: [] });
});

test("#52: tarefa inexistente retorna HTTP 404 sem consultar alternativas", async (t) => {
  const j = await preparar(t);
  assert.deepEqual(await j.consultar(id()), {
    status: 404, dados: { mensagem: "Tarefa não encontrada" },
  });
  assert.deepEqual(j.consultas, [Tarefa]);
});

test("#52: identificador inválido retorna HTTP 400 sem consultar alternativas", async (t) => {
  const j = await preparar(t);
  assert.deepEqual(await j.consultar("id-invalido"), {
    status: 400, dados: { mensagem: "ID invalido" },
  });
  assert.deepEqual(j.consultas, [Tarefa]);
});

test("#52: alternativas são retornadas em ordem crescente", async (t) => {
  const j = await preparar(t);
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(res.dados.map((r) => r.ordem), [1, 2, 3]);
});

test("#52: campo correta é ocultado tanto para acertos quanto para erros", async (t) => {
  const j = await preparar(t);
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.equal(res.dados.length, 3);
  for (const alternativa of res.dados) {
    assert.equal(Object.hasOwn(alternativa, "correta"), false);
    assert.equal(typeof alternativa.texto, "string");
  }
  assert.ok(j.respostas.some((r) => r.correta === true));
  assert.ok(j.respostas.some((r) => r.correta === false));
});

test("#52: rota exige autenticação antes de consultar persistência", async (t) => {
  const j = await preparar(t);
  for (const authorization of [null, "invalido", "Bearer token-invalido"]) {
    const res = await j.consultar(j.tarefa._id, authorization);
    assert.equal(res.status, 401);
    assert.equal(typeof res.dados.mensagem, "string");
  }
  assert.deepEqual(j.consultas, []);
});

test("#52: consulta associa alternativas exclusivamente ao tarefaId solicitado", async (t) => {
  const j = await preparar(t);
  for (const tarefa of [j.tarefa, j.outraTarefa]) {
    const res = await j.consultar(tarefa._id);
    assert.equal(res.status, 200);
    const esperadas = j.respostas.filter((r) => String(r.tarefaId) === String(tarefa._id));
    assert.deepEqual(
      res.dados.map((r) => r._id).sort(),
      esperadas.map((r) => String(r._id)).sort(),
    );
    assert.ok(res.dados.every((r) => r.tarefaId === String(tarefa._id)));
  }
});
