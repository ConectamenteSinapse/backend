import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";

// O nome nunca é recebido do ambiente: cada preparação usa um banco novo.
// A URI fornece apenas o servidor e a autenticação, nunca o banco de destino.
export const opcoesTesteAtlas = {
  skip:
    process.env.RUN_ATLAS_TESTS !== "1" &&
    "Atlas desativado; exige RUN_ATLAS_TESTS=1",
};

export async function conectarBancoTeste(opcoes = {}) {
  assert.equal(
    process.env.RUN_ATLAS_TESTS,
    "1",
    "Conexão Atlas exige ativação explícita",
  );
  dotenv.config({ quiet: true });
  const uri = process.env.MONGO_TEST_URI || process.env.MONGO_URI;
  assert.ok(uri, "Configure MONGO_TEST_URI ou MONGO_URI no .env");
  const dbName = `t72_${randomUUID().replaceAll("-", "")}`;
  try {
    await mongoose.connect(uri, {
      ...opcoes,
      dbName,
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
    });
  } catch {
    // Não propaga erros de conexão que possam conter credenciais.
    throw new Error("Não foi possível conectar ao banco isolado de testes");
  }
  assert.equal(mongoose.connection.name, dbName);
  assert.deepEqual(
    await mongoose.connection.db.listCollections().toArray(),
    [],
  );
  // Coleções precisam existir antes das transações reais do Atlas.
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection();
  }
  return dbName;
}
