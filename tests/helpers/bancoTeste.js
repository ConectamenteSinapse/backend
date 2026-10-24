import { BANCO_TESTES, motivoIgnorarAtlas, abrirConexaoTeste, prepararColecoesTeste } from "./atlasSeguro.js";

export const opcoesTesteAtlas = { skip: motivoIgnorarAtlas() };

export async function conectarBancoTeste(opcoes = {}) {
  const conexao = await abrirConexaoTeste(opcoes);
  try {
    await prepararColecoesTeste(conexao);
  } catch (erro) {
    await conexao.close().catch(() => {});
    throw erro;
  }
  return BANCO_TESTES;
}
