import {
  BANCO_TESTES, obterUriTeste, motivoIgnorarAtlas, confirmarModels,
  abrirConexaoTeste, prepararColecoesTeste,
} from "./atlasSeguro.js";

export const BANCO_COMMIT_REAL = BANCO_TESTES;
export const obterUriCommitReal = obterUriTeste;
export const confirmarBancoCommitReal = confirmarModels;
export const prepararColecoesCommitReal = prepararColecoesTeste;
export function motivoIgnorarCommitReal(ambiente = process.env, permissao = "RUN_COMMIT_REAL_TESTS") {
  return motivoIgnorarAtlas(ambiente, permissao);
}
export async function conectarBancoCommitReal({ permissao = "RUN_COMMIT_REAL_TESTS", ...opcoes } = {}) {
  if (!["RUN_COMMIT_REAL_TESTS", "RUN_CONCORRENCIA_REAL_TESTS"].includes(permissao))
    throw new Error("Permissão adicional de integração obrigatória");
  return abrirConexaoTeste({ ...opcoes, permissao });
}
