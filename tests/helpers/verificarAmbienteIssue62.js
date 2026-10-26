// Diagnóstico sem imprimir URI, segredo, hostname ou dados de documentos.
import { obterUriTeste, abrirConexaoTeste, confirmarBancoTeste } from "./atlasSeguro.js";
try {
  obterUriTeste();
  console.log("MONGO_TEST_URI validada: banco exclusivo conectamente_testes");
  const conexao = await abrirConexaoTeste();
  try {
    confirmarBancoTeste(conexao);
    const hello = await conexao.db.admin().command({ hello: 1 });
    console.log(`Conexão confirmada; transações: ${Boolean(hello.setName || hello.msg === "isdbgrid")}`);
  } finally { await conexao.close(); }
} catch (erro) {
  console.log(erro.message.startsWith("MONGO_TEST_URI") || erro.message.startsWith("Configure")
    ? erro.message : "Ambiente de integração indisponível (diagnóstico sanitizado)");
  process.exitCode = 2;
}
