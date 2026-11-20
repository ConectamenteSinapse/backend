import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db-connection.js";

// Executa os dois módulos de produção sem transformar seu código.
// Não carrega .env, abre sockets nem usa conexão ou credenciais reais.
const uri = "mongodb://usuario-ficticio:senha-ficticia@mongo.example.invalid/demo";
const falhaSegura = "Falha na conexão com o banco de dados";
let importacao = 0;

function promessaControlada() {
  let resolve, reject;
  const promise = new Promise((sucesso, falha) => {
    resolve = sucesso;
    reject = falha;
  });
  return { promise, resolve, reject };
}

function isolar(t) {
  const anteriores = Object.fromEntries(
    ["MONGO_URI", "FRONTEND_URL", "PORT"].map((chave) => [chave, process.env[chave]]),
  );
  const exitCode = process.exitCode;
  t.after(() => {
    for (const [chave, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
    process.exitCode = exitCode;
  });
  process.env.MONGO_URI = uri;
  process.env.FRONTEND_URL = "http://localhost:3000";
  process.exitCode = undefined;
  const logs = [];
  for (const metodo of ["log", "error", "warn", "info"]) {
    t.mock.method(console, metodo, (...args) => logs.push({ metodo, args }));
  }
  const env = t.mock.method(dotenv, "config", () => ({ parsed: {} }));
  const bloqueios = [
    t.mock.method(mongoose, "createConnection", () => {
      throw new Error("Conexão adicional não autorizada");
    }),
    t.mock.method(mongoose.Query.prototype, "exec", () => {
      throw new Error("Consulta MongoDB não autorizada");
    }),
  ];
  t.after(() => {
    for (const bloqueio of bloqueios) assert.equal(bloqueio.mock.callCount(), 0);
  });
  return { logs, env };
}

function conferirSigilo(logs, erroOriginal) {
  const texto = inspect(logs, { depth: null });
  for (const marcador of [uri, "usuario-ficticio", "senha-ficticia", "mongo.example.invalid", "mongodb://"]) {
    assert.ok(!texto.includes(marcador), "Os logs devem omitir URI e credenciais");
  }
  if (erroOriginal) assert.ok(!texto.includes(erroOriginal.message));
}

function importarEntrada() {
  return import(`../index.js?issue110=${++importacao}`);
}

test("#110 connectDB aguarda mongoose.connect e encaminha MONGO_URI", async (t) => {
  const { logs } = isolar(t);
  const conexao = promessaControlada();
  const conectar = t.mock.method(mongoose, "connect", () => conexao.promise);
  const resultado = connectDB();
  assert.equal(conectar.mock.callCount(), 1);
  assert.deepEqual(conectar.mock.calls[0].arguments, [uri]);
  assert.deepEqual(logs, [], "Não anunciar conexão enquanto ela estiver pendente");
  conexao.resolve();
  await resultado;
  assert.deepEqual(logs, [{ metodo: "log", args: ["MongoDB conectado com sucesso!"] }]);
  conferirSigilo(logs);
});

for (const sincrona of [false, true]) {
  test(`#110 connectDB propaga erro sanitizado após falha ${sincrona ? "síncrona" : "assíncrona"}`, async (t) => {
    const { logs } = isolar(t);
    const original = new Error(`Detalhe privado de conexão: ${uri}`);
    t.mock.method(mongoose, "connect", () => {
      if (sincrona) throw original;
      return Promise.reject(original);
    });
    await assert.rejects(connectDB(), (erro) => {
      assert.ok(erro instanceof Error);
      assert.notEqual(erro, original);
      assert.equal(erro.message, falhaSegura);
      assert.ok(!inspect(erro, { depth: null }).includes(uri));
      return true;
    });
    assert.deepEqual(logs, [{ metodo: "error", args: ["Erro ao conectar ao MongoDB"] }]);
    conferirSigilo(logs, original);
  });
}

for (const porta of ["4000", undefined]) {
  test(`#110 index aguarda sucesso antes de listen; porta ${porta ?? "padrão 3000"}`, async (t) => {
    const { logs, env } = isolar(t);
    if (porta === undefined) delete process.env.PORT;
    else process.env.PORT = porta;
    const conexao = promessaControlada();
    const iniciada = promessaControlada();
    let conectou = false;
    t.mock.method(mongoose, "connect", async () => {
      iniciada.resolve();
      await conexao.promise;
      conectou = true;
    });
    const listen = t.mock.method(express.application, "listen", function (valor, callback) {
      assert.equal(conectou, true, "Listener não pode anteceder a conexão");
      assert.equal(valor, porta ?? 3000);
      callback();
      return {};
    });
    const carregamento = importarEntrada();
    // Também libera a importação se uma asserção intermediária falhar.
    t.after(async () => { conexao.resolve(); await carregamento; });
    await iniciada.promise;
    assert.equal(listen.mock.callCount(), 0);
    assert.deepEqual(logs, []);
    conexao.resolve();
    await carregamento;
    assert.equal(env.mock.callCount(), 1);
    assert.equal(listen.mock.callCount(), 1);
    assert.equal(process.exitCode, undefined);
    assert.deepEqual(logs.map(({ args }) => args[0]), [
      "MongoDB conectado com sucesso!",
      `Servidor rodando em http://localhost:${porta ?? 3000}`,
    ]);
    conferirSigilo(logs);
  });
}

test("#110 falha real de connectDB impede listen e sinaliza saída sem vazar detalhes", async (t) => {
  const { logs } = isolar(t);
  const conexao = promessaControlada();
  const iniciada = promessaControlada();
  const original = new Error(`Falha privada: ${uri}`);
  t.mock.method(mongoose, "connect", () => {
    iniciada.resolve();
    return conexao.promise;
  });
  const listen = t.mock.method(express.application, "listen", () => {
    assert.fail("app.listen não deve ser chamado quando a conexão falha");
  });
  const carregamento = importarEntrada();
  t.after(async () => { conexao.resolve(); await carregamento; });
  await iniciada.promise;
  assert.equal(listen.mock.callCount(), 0);
  conexao.reject(original);
  await carregamento;
  assert.equal(listen.mock.callCount(), 0);
  assert.equal(process.exitCode, 1);
  assert.deepEqual(logs, [
    { metodo: "error", args: ["Erro ao conectar ao MongoDB"] },
    { metodo: "error", args: [falhaSegura] },
  ]);
  conferirSigilo(logs, original);
});
