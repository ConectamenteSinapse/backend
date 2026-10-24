import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  obterUriCommitReal,
  confirmarBancoCommitReal,
  prepararColecoesCommitReal,
  motivoIgnorarCommitReal,
} from "./helpers/bancoCommitReal.js";

// URIs locais de teste geradas em memória; nenhuma URI autenticada é armazenada.
function uriFicticia(banco, protocolo = "mongodb:") {
  return `${protocolo}//localhost/${banco}`;
}

test("Commit real é ignorado por padrão mesmo com MONGO_TEST_URI configurada", () => {
  assert.match(
    motivoIgnorarCommitReal({
      MONGO_TEST_URI: uriFicticia("conectamente_testes"),
    }),
    /desativado/,
  );
});

test("Commit real exige ativação explícita e URI válida do banco autorizado", () => {
  for (const MONGO_TEST_URI of [
    undefined,
    uriFicticia("conectamente"),
    "invalida",
  ]) {
    assert.match(
      motivoIgnorarCommitReal({
        RUN_ATLAS_TESTS: "1",
        RUN_COMMIT_REAL_TESTS: "1",
        MONGO_TEST_URI,
      }),
      /MONGO_TEST_URI/,
    );
  }
  assert.equal(
    motivoIgnorarCommitReal({
      RUN_ATLAS_TESTS: "1",
      RUN_COMMIT_REAL_TESTS: "1",
      MONGO_TEST_URI: uriFicticia("conectamente_testes"),
    }),
    false,
  );
});

test("Preparação das coleções bloqueia produção antes de qualquer criação", async () => {
  let criacoes = 0;
  await assert.rejects(
    () =>
      prepararColecoesCommitReal({
        name: "conectamente",
        db: { databaseName: "conectamente" },
        models: {
          Ficticio: {
            async createCollection() {
              criacoes++;
            },
          },
        },
      }),
    /Operação de teste bloqueada/,
  );
  assert.equal(criacoes, 0);
});

test("Commit real exige MONGO_TEST_URI, sem fallback para MONGO_URI", () => {
  assert.throws(
    () => obterUriCommitReal({ MONGO_URI: uriFicticia("conectamente") }),
    /Configure MONGO_TEST_URI/,
  );
});

test("Commit real rejeita produção, banco ausente ou diferente antes da conexão", () => {
  for (const uri of [
    uriFicticia("conectamente"),
    uriFicticia(""),
    uriFicticia("outro_test"),
    uriFicticia("conectamente_testes_extra"),
    "https://localhost/conectamente_testes",
    "uri-invalida",
  ]) {
    assert.throws(
      () => obterUriCommitReal({ MONGO_TEST_URI: uri }),
      /exclusivamente para conectamente_testes/,
    );
  }
});

test("Commit real aceita somente URI MongoDB do banco conectamente_testes", () => {
  for (const uri of [
    uriFicticia("conectamente_testes"),
    uriFicticia("conectamente_testes", "mongodb+srv:"),
  ])
    assert.equal(obterUriCommitReal({ MONGO_TEST_URI: uri }), uri);
});

test("Commit real confere o nome efetivo da conexão e do banco antes de operações", () => {
  assert.doesNotThrow(() =>
    confirmarBancoCommitReal({
      readyState: 1,
      name: "conectamente_testes",
      db: { databaseName: "conectamente_testes" },
    }),
  );
  for (const conexao of [
    { readyState: 1, name: "conectamente", db: { databaseName: "conectamente" } },
    { readyState: 1, name: "conectamente_testes", db: { databaseName: "conectamente" } },
    { readyState: 1, name: "conectamente_testes" },
  ])
    assert.throws(
      () => confirmarBancoCommitReal(conexao),
      /Operação de teste bloqueada/,
    );
});

test("Erros de validação não incluem URI nem credenciais", () => {
  const destino = new URL(uriFicticia("conectamente"));
  destino.username = randomUUID();
  destino.password = randomUUID();
  const uri = destino.toString();
  assert.throws(
    () => obterUriCommitReal({ MONGO_TEST_URI: uri }),
    (erro) => {
      assert.ok(!erro.message.includes(uri));
      assert.ok(!erro.message.includes(destino.username));
      assert.ok(!erro.message.includes(destino.password));
      return true;
    },
  );
});
