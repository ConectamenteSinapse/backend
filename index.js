//Importando o Express  - facilita a criacao do servidor das rotas e respostas HTTP
import express from "express"
// importando o usuarioRouter.js
import usuarioRoutes from "./routes/usuarioRoutes.js"
import comodoRoutes from "./routes/comodoRoutes.js"
import tarefaRoutes from "./routes/tarefaRoutes.js"

//criarndo a variavel app para configurar o servidor:
const app = express()
//Permite que o Express interprete dados enviados no  formato Json
app.use(express.json())
// definidnod o a porta que o servidor ficara disponivel, e colocando a variavel de ambiente na porta
const port = process.env.PORT || 3000

// criando o prefixos para as rotas do usuarioRotes
app.use("/usuarios", usuarioRoutes)
app.use("/comodos", comodoRoutes)
app.use("/tarefas", tarefaRoutes)
//array para estudo de usuarios cadastrados


//rota principal
// Requisiçoes Get feitas para "/"
app.get("/", (req, res) =>{
    return  res.status(200).send('Api iniciado com Sucesso')
    //code 200 sucess - sucesso
})



//inciando o servidor
app.listen(port,() =>{
    console.log(`Servidor rodando em http://localhost:${port}`)
})