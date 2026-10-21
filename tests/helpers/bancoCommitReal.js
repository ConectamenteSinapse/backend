import dotenv from "dotenv";
import mongoose from "mongoose";

export const BANCO_COMMIT_REAL = "conectamente_test";

export function motivoIgnorarCommitReal(ambiente = process.env) {
  if (ambiente.RUN_COMMIT_REAL_TESTS !== "1") {
    return "Commit real desativado; exige RUN_COMMIT_REAL_TESTS=1";
  }
  try {
    obterUriCommitReal(ambiente);
    return false;
  } catch {
    return "Commit real exige MONGO_TEST_URI válida para conectamente_test";
  }
}

export function obterUriCommitReal(ambiente = process.env) {
  const uri = ambiente.MONGO_TEST_URI;
  if (!uri)
    throw new Error("Configure MONGO_TEST_URI para o teste de commit real");
  let destino;
  try {
    destino = new URL(uri);
    if (!["mongodb:", "mongodb+srv:"].includes(destino.protocol))
      throw new Error();
    if (decodeURIComponent(destino.pathname) !== `/${BANCO_COMMIT_REAL}`)
      throw new Error();
  } catch {
    // Não inclui a URI nem o erro original, que podem conter credenciais.
    throw new Error(
      "MONGO_TEST_URI deve apontar exclusivamente para conectamente_test",
    );
  }
  return uri;
}

export function confirmarBancoCommitReal(conexao) {
  if (
    conexao.name !== BANCO_COMMIT_REAL ||
    conexao.db?.databaseName !== BANCO_COMMIT_REAL
  ) {
    throw new Error(
      "Operação de teste bloqueada: banco conectado não é conectamente_test",
    );
  }
}

export async function conectarBancoCommitReal({
  leitura = false,
  ...opcoes
} = {}) {
  dotenv.config({ quiet: true });
  const uri = obterUriCommitReal();
  const configuracao = {
    ...opcoes,
    dbName: BANCO_COMMIT_REAL,
    serverSelectionTimeoutMS: 10000,
    autoIndex: false,
    autoCreate: false,
  };
  let conexao;
  try {
    if (leitura) {
      conexao = mongoose.createConnection(uri, configuracao);
      await conexao.asPromise();
    } else {
      await mongoose.connect(uri, configuracao);
      conexao = mongoose.connection;
    }
  } catch (erro) {
    if (leitura) await conexao?.close().catch(() => {});
    if (
      erro.code === 18 ||
      /bad auth|authentication failed|authenticationfailed/i.test(erro.message)
    ) {
      throw new Error(
        "Falha de autenticação no Atlas usando MONGO_TEST_URI; verifique o usuário de testes, a senha codificada e authSource",
      );
    }
    throw new Error("Não foi possível conectar ao banco conectamente_test");
  }
  // Executada antes de qualquer criação, escrita, leitura de dados ou limpeza.
  confirmarBancoCommitReal(conexao);
  return conexao;
}

export async function prepararColecoesCommitReal(conexao) {
  confirmarBancoCommitReal(conexao);
  try {
    for (const model of Object.values(conexao.models)) {
      await model.createCollection();
    }
  } catch (erro) {
    if (/not allowed|not authorized|unauthorized/i.test(erro.message)) {
      throw new Error(
        "Atlas negou a preparação das coleções em conectamente_test; configure permissão readWrite nesse banco",
      );
    }
    throw new Error(
      "Não foi possível preparar as coleções em conectamente_test",
    );
  }
}
