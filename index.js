//Importando o Express  - facilita a criacao do servidor das rotas e respostas HTTP
import express from "express";
//Impotando o dotenv
import dotenv from "dotenv";
//Importando a conexao com o banco
import connectDB from "./config/db-connection.js";
// importando os Router.js
import usuarioRoutes from "./routes/usuarioRoutes.js";
import comodoRoutes from "./routes/comodoRoutes.js";
import tarefaRoutes from "./routes/tarefaRoutes.js";
import respostaRoutes from "./routes/respostaRoutes.js";
import criancaRoutes from "./routes/criancaRoutes.js";
import responsavelRoutes from "./routes/responsavelRoutes.js";
import historicoJogoRoutes from "./routes/historicoJogoRoutes.js";
import progressoRoutes from "./routes/progressoRoutes.js";
import historicoConsultaRoutes from "./routes/historicoConsultaRoutes.js";
import perfilJogoRoutes from "./routes/perfilJogoRoutes.js";
import jogoSalvoRoutes from "./routes/jogoSalvoRoutes.js";

//criarndo a variavel app para configurar o servidor:
const app = express();
//chamando o dotenv
dotenv.config();
//Permite que o Express interprete dados enviados no  formato Json
app.use(express.json());
//Conectando o backend ao MongoDB Atlas
connectDB();
// definidnod o a porta que o servidor ficara disponivel, e colocando a variavel de ambiente na porta
const port = process.env.PORT || 3000;

// criando o prefixos para as rotas
app.use("/usuarios", usuarioRoutes);
app.use("/comodos", comodoRoutes);
app.use("/tarefas", tarefaRoutes);
app.use("/respostas", respostaRoutes);
app.use("/criancas", criancaRoutes);
app.use("/responsaveis", responsavelRoutes);
app.use("/historico-jogo", historicoJogoRoutes);
app.use("/criancas", progressoRoutes);
app.use("/criancas", historicoConsultaRoutes);
app.use("/perfis-jogo", perfilJogoRoutes);
app.use("/jogos-salvos", jogoSalvoRoutes);

//rota principal
// Requisiçoes Get feitas para "/"
app.get("/", (req, res) => {
  return res.status(200).send("Api iniciado com Sucesso");
  //code 200 sucess - sucesso
});
// Tratar erros de JSON e URL inválidos
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ erro: true, mensagem: "JSON inválido" });
  }
  if (error instanceof URIError) {
    return res.status(400).json({ erro: true, mensagem: "URL inválida" });
  }
  return next(error);
});
// Tratar rotas inexistentes
app.use((req, res) => {
  return res.status(404).json({ erro: true, mensagem: "Rota não encontrada" });
});
//inciando o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
