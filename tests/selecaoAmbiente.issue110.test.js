import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import mongoose from "mongoose";
import dotenv from "dotenv";
import express from "express";
import connectDB from "../config/db-connection.js";

// Somente dados fictícios. Os módulos de produção são executados sem transformação.
// dotenv e todas as entradas usadas de conexão/listener são substituídos por mocks.
const atlas = "mongodb+srv://usuario-atlas:senha-atlas@atlas.example.invalid/demo";
const local = "mongodb://usuario-local:senha-local@local.example.invalid/demo";
const falhaSegura = "Falha na conexão com o banco de dados";
const ambienteInvalido = "Ambiente MongoDB inválido";
const uriAusente = "URI do MongoDB não configurada";
const ambientes = ["local", "atlas", undefined];
let importacao = 0;

function isolar(t, valores = {}) {
  const chaves = ["MONGO_AMBIENTE", "MONGO_URI", "MONGO_URI_LOCAL", "PORT", "FRONTEND_URL"];
  const anteriores = Object.fromEntries(chaves.map((chave) => [chave, process.env[chave]]));
  const exitCode = process.exitCode;
  t.after(() => {
    for (const [chave, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
    process.exitCode = exitCode;
  });
  for (const chave of chaves) delete process.env[chave];
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor !== undefined) process.env[chave] = valor;
  }
  process.exitCode = undefined;
  const logs = [];
  for (const metodo of ["log", "error", "warn", "info"]) {
    t.mock.method(console, metodo, (...args) => logs.push({ metodo, args }));
  }
  const env = t.mock.method(dotenv, "config", () => ({ parsed: {} }));
  const conectar = t.mock.method(mongoose, "connect", async () => {});
  const listen = t.mock.method(express.application, "listen", () => ({}));
  const bloqueios = [
    t.mock.method(mongoose, "createConnection", () => assert.fail("Conexão adicional proibida")),
    t.mock.method(mongoose.Query.prototype, "exec", () => assert.fail("Consulta MongoDB proibida")),
  ];
  t.after(() => {
    for (const bloqueio of bloqueios) assert.equal(bloqueio.mock.callCount(), 0);
  });
  return { logs, env, conectar, listen };
}

function configurar(ambiente) {
  return { MONGO_AMBIENTE: ambiente, MONGO_URI: atlas, MONGO_URI_LOCAL: local };
}

function conferirSigilo(...valores) {
  const texto = inspect(valores, { depth: null, showHidden: true });
  for (const marcador of [atlas, local, "usuario-atlas", "senha-atlas", "usuario-local",
    "senha-local", "example.invalid", "mongodb://", "mongodb+srv://", "detalhe-privado-driver"]) {
    assert.ok(!texto.includes(marcador), "Erro e logs devem omitir detalhes privados");
  }
}

function importarEntrada() {
  return import(`../index.js?selecaoAmbiente110=${++importacao}`);
}

for (const ambiente of ambientes) {
  const nome = ambiente ?? "ausente (compatibilidade)";
  const selecionada = ambiente === "local" ? local : atlas;
  test(`#110 seleção ${nome}: encaminha somente a URI selecionada`, async (t) => {
    const { conectar, logs } = isolar(t, configurar(ambiente));
    await connectDB();
    assert.equal(conectar.mock.callCount(), 1);
    assert.deepEqual(conectar.mock.calls[0].arguments, [selecionada]);
    assert.deepEqual(logs, [{ metodo: "log", args: ["MongoDB conectado com sucesso!"] }]);
    conferirSigilo(logs);
  });

  test(`#110 seleção ${nome}: URI do outro ambiente não é necessária`, async (t) => {
    const valores = configurar(ambiente);
    delete valores[ambiente === "local" ? "MONGO_URI" : "MONGO_URI_LOCAL"];
    const { conectar } = isolar(t, valores);
    await connectDB();
    assert.equal(conectar.mock.callCount(), 1);
    assert.deepEqual(conectar.mock.calls[0].arguments, [selecionada]);
  });

  for (const sincrona of [false, true]) {
    test(`#110 seleção ${nome}: falha ${sincrona ? "síncrona" : "assíncrona"} sanitizada sem fallback`, async (t) => {
      const { logs } = isolar(t, configurar(ambiente));
      const original = new Error(`detalhe-privado-driver ${atlas} ${local}`);
      const conectar = t.mock.method(mongoose, "connect", () => {
        if (sincrona) throw original;
        return Promise.reject(original);
      });
      await assert.rejects(connectDB(), (erro) => {
        assert.ok(erro instanceof Error);
        assert.notEqual(erro, original);
        assert.equal(erro.message, falhaSegura);
        conferirSigilo(erro, logs);
        return true;
      });
      assert.deepEqual(conectar.mock.calls.map(({ arguments: args }) => args), [[selecionada]]);
      assert.deepEqual(logs, [{ metodo: "error", args: ["Erro ao conectar ao MongoDB"] }]);
    });
  }

  test(`#110 index ${nome}: conexão pendente impede listen; sucesso libera uma vez`, { timeout: 5000 }, async (t) => {
    const { logs, env, listen } = isolar(t, configurar(ambiente));
    const pendente = Promise.withResolvers();
    const iniciada = Promise.withResolvers();
    const conectar = t.mock.method(mongoose, "connect", () => {
      iniciada.resolve();
      return pendente.promise;
    });
    const carregamento = importarEntrada();
    t.after(async () => { pendente.resolve(); await carregamento; });
    await iniciada.promise;
    assert.equal(listen.mock.callCount(), 0);
    assert.deepEqual(logs, []);
    pendente.resolve();
    await carregamento;
    assert.deepEqual(conectar.mock.calls.map(({ arguments: args }) => args), [[selecionada]]);
    assert.equal(listen.mock.callCount(), 1);
    assert.equal(listen.mock.calls[0].arguments[0], 3000);
    assert.equal(env.mock.callCount(), 1);
    assert.equal(process.exitCode, undefined);
    conferirSigilo(logs);
  });

  test(`#110 index ${nome}: falha de conexão impede listen e não tenta outro destino`, async (t) => {
    const { logs, listen } = isolar(t, configurar(ambiente));
    const conectar = t.mock.method(mongoose, "connect", async () => {
      throw new Error(`detalhe-privado-driver ${selecionada}`);
    });
    await importarEntrada();
    assert.equal(listen.mock.callCount(), 0);
    assert.equal(process.exitCode, 1);
    assert.deepEqual(conectar.mock.calls.map(({ arguments: args }) => args), [[selecionada]]);
    assert.deepEqual(logs, [
      { metodo: "error", args: ["Erro ao conectar ao MongoDB"] },
      { metodo: "error", args: [falhaSegura] },
    ]);
    conferirSigilo(logs);
  });
}

const configuracoesInvalidas = [
  ...["invalido", "LOCAL", "atlas "].map((ambiente) => ({
    nome: `ambiente inválido ${JSON.stringify(ambiente)}`,
    valores: configurar(ambiente), mensagem: ambienteInvalido,
  })),
  ...ambientes.flatMap((ambiente) => [undefined, ""].map((uri) => ({
    nome: `${ambiente ?? "compatibilidade"}: URI selecionada ${uri === undefined ? "ausente" : "vazia"}`,
    valores: { ...configurar(ambiente), [ambiente === "local" ? "MONGO_URI_LOCAL" : "MONGO_URI"]: uri },
    mensagem: uriAusente,
  }))),
];

for (const { nome, valores, mensagem } of configuracoesInvalidas) {
  test(`#110 configuração ${nome}: rejeita antes do driver, sem fallback`, async (t) => {
    const { conectar, logs } = isolar(t, valores);
    await assert.rejects(connectDB(), (erro) => {
      assert.ok(erro instanceof Error);
      assert.equal(erro.message, mensagem);
      conferirSigilo(erro, logs);
      return true;
    });
    assert.equal(conectar.mock.callCount(), 0);
    assert.deepEqual(logs, []);
  });

  test(`#110 index configuração ${nome}: impede driver e listener`, async (t) => {
    const { conectar, listen, logs, env } = isolar(t, valores);
    await importarEntrada();
    assert.equal(conectar.mock.callCount(), 0);
    assert.equal(listen.mock.callCount(), 0);
    assert.equal(env.mock.callCount(), 1);
    assert.equal(process.exitCode, 1);
    assert.deepEqual(logs, [{ metodo: "error", args: [mensagem] }]);
    conferirSigilo(logs);
  });
}
