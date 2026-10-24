import mongoose from "mongoose";

export const BANCO_TESTES = "conectamente_testes";
const PERMISSOES = ["RUN_COMMIT_REAL_TESTS", "RUN_CONCORRENCIA_REAL_TESTS"];

export function validarAtivacao(ambiente = process.env, permissao) {
  if (ambiente.RUN_ATLAS_TESTS !== "1")
    throw new Error("Atlas desativado; exige RUN_ATLAS_TESTS=1");
  if (permissao !== undefined && !PERMISSOES.includes(permissao))
    throw new Error("Permissão de integração desconhecida");
  if (permissao && ambiente[permissao] !== "1")
    throw new Error(`Integração desativada; exige ${permissao}=1`);
}

export function obterUriTeste(ambiente = process.env) {
  const uri = ambiente.MONGO_TEST_URI;
  if (!uri) throw new Error("Configure MONGO_TEST_URI no ambiente do processo");
  try {
    const destino = new URL(uri);
    if (!["mongodb:", "mongodb+srv:"].includes(destino.protocol) ||
        destino.pathname !== `/${BANCO_TESTES}` || destino.hash ||
        [...destino.searchParams.keys()].some((chave) => chave.toLowerCase() === "dbname"))
      throw new Error();
  } catch {
    throw new Error(`MONGO_TEST_URI deve apontar exclusivamente para ${BANCO_TESTES}`);
  }
  return uri;
}

export function motivoIgnorarAtlas(ambiente = process.env, permissao) {
  try {
    validarAtivacao(ambiente, permissao);
    obterUriTeste(ambiente);
    return false;
  } catch (erro) {
    return erro.message;
  }
}

export function confirmarBancoTeste(conexao) {
  if (conexao?.readyState !== 1 || conexao.name !== BANCO_TESTES ||
      conexao.db?.databaseName !== BANCO_TESTES)
    throw new Error(`Operação de teste bloqueada: conexão não é ${BANCO_TESTES}`);
}

export function confirmarModels(conexao, models = Object.values(conexao.models ?? {})) {
  confirmarBancoTeste(conexao);
  for (const model of models) {
    if (model.db !== conexao || model.collection?.conn !== conexao)
      throw new Error("Operação de teste bloqueada: Model vinculado a outra conexão");
  }
}

export async function abrirConexaoTeste({ leitura = false, permissao, monitorCommands = false, ...extras } = {}) {
  validarAtivacao(process.env, permissao);
  const uri = obterUriTeste();
  if (Object.keys(extras).length)
    throw new Error("Opções de conexão não autorizadas");
  if (leitura) confirmarModels(mongoose.connection);
  if (!leitura && mongoose.connection.readyState !== 0)
    throw new Error("Integração exige processo sem conexão Mongoose anterior");
  const configuracao = {
    dbName: BANCO_TESTES, serverSelectionTimeoutMS: 10000,
    autoIndex: false, autoCreate: false, monitorCommands,
  };
  let conexao;
  try {
    if (leitura) {
      conexao = mongoose.createConnection(uri, configuracao);
      await conexao.asPromise();
    } else {
      conexao = mongoose.connection;
      await mongoose.connect(uri, configuracao);
    }
    confirmarModels(conexao);
    return conexao;
  } catch {
    await conexao?.close().catch(() => {});
    throw new Error(`Conexão de integração recusada para ${BANCO_TESTES}`);
  }
}

export async function prepararColecoesTeste(conexao) {
  confirmarModels(conexao);
  try {
    for (const model of Object.values(conexao.models)) {
      confirmarModels(conexao, [model]);
      await model.createCollection();
      confirmarModels(conexao, [model]);
      // Criação aditiva: não remove índices existentes.
      await model.createIndexes();
    }
  } catch {
    throw new Error("Falha ao preparar coleções do banco exclusivo de testes");
  }
}

// IDs registrados ANTES das inserções, inclusive em preparação parcial.
// Históricos gerados pelo Service são delimitados pelos perfis novos da execução.
export async function limparRegistrosTeste(conexao, registros, historico, perfis = []) {
  confirmarModels(conexao, [...registros.keys(), ...(historico ? [historico] : [])]);
  const tarefas = [];
  if (historico && perfis.length)
    tarefas.push([historico, { perfilJogoId: { $in: [...perfis] } }]);
  for (const [model, ids] of registros) {
    if (ids.length) tarefas.push([model, { _id: { $in: [...ids] } }]);
  }
  // Valida TODO o plano antes da primeira exclusão.
  for (const [, filtro] of tarefas) {
    const ids = Object.values(filtro)[0].$in;
    if (!ids.every((id) => id instanceof mongoose.Types.ObjectId))
      throw new Error("Limpeza bloqueada: IDs inválidos");
  }
  const falhas = [];
  for (const [model, filtro] of tarefas) {
    try {
      confirmarModels(conexao, [model]);
      await model.deleteMany(filtro);
      if (await model.countDocuments(filtro) !== 0) throw new Error();
    } catch {
      // Não propaga mensagens do driver nem documentos/credenciais.
      falhas.push(new Error("Falha na limpeza de registros da execução"));
    }
  }
  if (falhas.length) throw new AggregateError(falhas, "Limpeza incompleta dos testes");
}
