import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  BANCO_TESTES, obterUriTeste, validarAtivacao, motivoIgnorarAtlas,
  confirmarModels, abrirConexaoTeste, prepararColecoesTeste, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";
import { conectarBancoTeste } from "./helpers/bancoTeste.js";
import { conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";

const ambiente = { RUN_ATLAS_TESTS: "1", MONGO_TEST_URI: `mongodb://localhost/${BANCO_TESTES}` };
function conexao() {
  return { readyState: 1, name: BANCO_TESTES, db: { databaseName: BANCO_TESTES }, models: {} };
}
function model(c, extra = {}) {
  return { db: c, collection: { conn: c }, ...extra };
}
function configurar(t, valores) {
  for (const chave of ["RUN_ATLAS_TESTS", "RUN_COMMIT_REAL_TESTS", "RUN_CONCORRENCIA_REAL_TESTS", "MONGO_TEST_URI"]) {
    const anterior = process.env[chave];
    if (valores[chave] === undefined) delete process.env[chave];
    else process.env[chave] = valores[chave];
    t.after(() => {
      if (anterior === undefined) delete process.env[chave];
      else process.env[chave] = anterior;
    });
  }
  // Qualquer caminho inesperado falha localmente, antes de acessar rede.
  t.mock.method(mongoose, "connect", () => { throw new Error("REDE PROIBIDA"); });
  t.mock.method(mongoose, "createConnection", () => { throw new Error("REDE PROIBIDA"); });
}

test("Flags adicionais nunca substituem a autorização Atlas", () => {
  for (const flag of ["RUN_COMMIT_REAL_TESTS", "RUN_CONCORRENCIA_REAL_TESTS"]) {
    assert.throws(() => validarAtivacao({ [flag]: "1" }, flag), /RUN_ATLAS_TESTS/);
    assert.throws(() => validarAtivacao(ambiente, flag), new RegExp(flag));
    assert.equal(motivoIgnorarAtlas({ ...ambiente, [flag]: "1" }, flag), false);
  }
  assert.throws(() => validarAtivacao(ambiente, "OUTRA"), /desconhecida/);
});

test("URI rejeita banco antigo, produção, opções de destino e mensagens com segredos", () => {
  for (const uri of [
    "mongodb://usuario:segredo@localhost/conectamente_test",
    "mongodb://localhost/conectamente", "mongodb://localhost/",
    `mongodb://localhost/${BANCO_TESTES}?dbName=producao`,
    `mongodb://localhost/${BANCO_TESTES}?DBNAME=producao`,
    `mongodb://localhost/${BANCO_TESTES}#outro`,
    "mongodb://localhost/%63onectamente_testes",
  ]) assert.throws(() => obterUriTeste({ MONGO_TEST_URI: uri }), (erro) => {
    assert.ok(!erro.message.includes("segredo"));
    return /exclusivamente/.test(erro.message);
  });
  assert.throws(() => obterUriTeste({ MONGO_URI: ambiente.MONGO_TEST_URI }), /Configure MONGO_TEST_URI/);
});

test("Todas as entradas de conexão bloqueiam antes do driver com Atlas desativado", async (t) => {
  configurar(t, { ...ambiente, RUN_ATLAS_TESTS: "0", RUN_COMMIT_REAL_TESTS: "1", RUN_CONCORRENCIA_REAL_TESTS: "1" });
  for (const conectar of [abrirConexaoTeste, conectarBancoTeste, conectarBancoCommitReal]) {
    await assert.rejects(conectar(), /RUN_ATLAS_TESTS/);
    await assert.rejects(conectar({ leitura: true, permissao: "RUN_CONCORRENCIA_REAL_TESTS" }), /RUN_ATLAS_TESTS/);
  }
  assert.equal(mongoose.connect.mock.callCount(), 0);
  assert.equal(mongoose.createConnection.mock.callCount(), 0);
});

test("URI inválida, flags adicionais ausentes e opções perigosas não chegam ao driver", async (t) => {
  configurar(t, ambiente);
  await assert.rejects(conectarBancoCommitReal(), /RUN_COMMIT_REAL_TESTS/);
  await assert.rejects(conectarBancoCommitReal({ permissao: "RUN_CONCORRENCIA_REAL_TESTS" }), /RUN_CONCORRENCIA_REAL_TESTS/);
  await assert.rejects(conectarBancoTeste({ dbName: "producao" }), /não autorizadas/);
  process.env.MONGO_TEST_URI = "mongodb://localhost/conectamente";
  await assert.rejects(conectarBancoTeste(), /exclusivamente/);
  assert.equal(mongoose.connect.mock.callCount(), 0);
});

test("Destino efetivo incorreto fecha a conexão antes de criar coleções", async (t) => {
  configurar(t, ambiente);
  let fechou = 0;
  const c = { ...conexao(), name: "producao", close: async () => { fechou++; } };
  t.mock.method(mongoose, "createConnection", () => ({ ...c, asPromise: async () => {} }));
  t.mock.getter(mongoose, "connection", () => conexao());
  await assert.rejects(abrirConexaoTeste({ leitura: true }), /recusada/);
  assert.equal(fechou, 1);
});

test("Preparação valida todos os Models antes da primeira criação e aceita banco não vazio", async () => {
  const c = conexao();
  let criou = 0;
  c.models = { bom: model(c, { createCollection: async () => { criou++; }, createIndexes: async () => {} }), ruim: model(conexao()) };
  await assert.rejects(prepararColecoesTeste(c), /Model/);
  assert.equal(criou, 0);
  delete c.models.ruim;
  await prepararColecoesTeste(c);
  assert.equal(criou, 1);
  c.readyState = 0;
  assert.throws(() => confirmarModels(c), /bloqueada/);
});

test("Limpeza continua após falha parcial e não expõe erro do driver", async () => {
  const c = conexao();
  const chamadas = [];
  const ruim = model(c, { deleteMany: async () => { chamadas.push("ruim"); throw new Error("segredo"); } });
  const bom = model(c, { deleteMany: async (filtro) => { chamadas.push(filtro); }, countDocuments: async () => 0 });
  const id = new mongoose.Types.ObjectId();
  await assert.rejects(limparRegistrosTeste(c, new Map([[ruim, [id]], [bom, [id]]])), (erro) => {
    assert.ok(erro instanceof AggregateError);
    assert.equal(erro.errors.length, 1);
    assert.ok(!erro.errors[0].message.includes("segredo"));
    return true;
  });
  assert.deepEqual(chamadas, ["ruim", { _id: { $in: [id] } }]);
});

test("Limpeza bloqueia Model alheio e IDs inválidos antes de excluir; lista vazia não exclui", async () => {
  const c = conexao();
  let excluiu = 0;
  const bom = model(c, { deleteMany: async () => { excluiu++; }, countDocuments: async () => 0 });
  const id = new mongoose.Types.ObjectId();
  await assert.rejects(limparRegistrosTeste(c, new Map([[bom, [id]], [model(conexao()), [id]]])), /Model/);
  await assert.rejects(limparRegistrosTeste(c, new Map([[bom, ["invalido"]]])), /IDs inválidos/);
  await limparRegistrosTeste(c, new Map([[bom, []]]), bom, []);
  assert.equal(excluiu, 0);
});

test("Limpeza preserva outro registro e limita históricos aos perfis da execução", async () => {
  const c = conexao();
  const proprio = new mongoose.Types.ObjectId();
  const outro = new mongoose.Types.ObjectId();
  const dados = [proprio, outro];
  const m = model(c, {
    deleteMany: async (filtro) => {
      assert.deepEqual(filtro, { _id: { $in: [proprio] } });
      dados.splice(dados.indexOf(proprio), 1);
    }, countDocuments: async () => 0,
  });
  const h = model(c, {
    deleteMany: async (filtro) => assert.deepEqual(filtro, { perfilJogoId: { $in: [proprio] } }),
    countDocuments: async () => 0,
  });
  await limparRegistrosTeste(c, new Map([[m, [proprio]]]), h, [proprio]);
  assert.deepEqual(dados, [outro]);
});

test("Limpeza denuncia documentos remanescentes sem interromper outras coleções", async () => {
  const c = conexao();
  let tentou = false;
  const a = model(c, { deleteMany: async () => {}, countDocuments: async () => 1 });
  const b = model(c, { deleteMany: async () => { tentou = true; }, countDocuments: async () => 0 });
  const id = new mongoose.Types.ObjectId();
  await assert.rejects(limparRegistrosTeste(c, new Map([[a, [id]], [b, [id]]])), /incompleta/);
  assert.equal(tentou, true);
});

test("Conexão autorizada fixa o banco e desativa criação automática antes da validação", async (t) => {
  configurar(t, { ...ambiente, RUN_COMMIT_REAL_TESTS: "1" });
  const c = { ...conexao(), close: async () => {} };
  // O getter acompanha a transição que o driver faria, sem abrir socket.
  let atual = { readyState: 0 };
  t.mock.getter(mongoose, "connection", () => atual);
  t.mock.method(mongoose, "connect", async (uri, opcoes) => {
    assert.equal(uri, ambiente.MONGO_TEST_URI);
    assert.deepEqual(opcoes, {
      dbName: BANCO_TESTES, serverSelectionTimeoutMS: 10000,
      autoIndex: false, autoCreate: false, monitorCommands: false,
    });
    Object.assign(atual, c);
  });
  const conectado = await conectarBancoCommitReal();
  assert.equal(conectado, atual);
  await assert.rejects(conectarBancoCommitReal(), /conexão Mongoose anterior/);
  await assert.rejects(conectarBancoCommitReal({ permissao: null }), /adicional/);
});

test("Falha de índices na preparação não expõe erro interno", async () => {
  const c = conexao();
  c.models = { fixture: model(c, {
    createCollection: async () => {},
    createIndexes: async () => { throw new Error("credencial secreta"); },
  }) };
  await assert.rejects(prepararColecoesTeste(c), (erro) => {
    assert.ok(!erro.message.includes("secreta"));
    return /preparar coleções/.test(erro.message);
  });
});

test("Falha de preparação fecha a conexão e limpeza bloqueia banco incorreto", async (t) => {
  configurar(t, ambiente);
  let fechou = false;
  const c = { ...conexao(), close: async () => { fechou = true; } };
  c.models.fixture = model(c, {
    createCollection: async () => { throw new Error("preparação parcial"); },
  });
  c.readyState = 0;
  t.mock.getter(mongoose, "connection", () => c);
  t.mock.method(mongoose, "connect", async () => { c.readyState = 1; });
  await assert.rejects(conectarBancoTeste(), /preparar coleções/);
  assert.equal(fechou, true);
  c.db.databaseName = "producao";
  await assert.rejects(limparRegistrosTeste(c, new Map()), /bloqueada/);
});
