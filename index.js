//Importando o Express  - facilita a criacao do servidor das rotas e respostas HTTP
import express from "express"

//criarndo a variavel app para configurar o servidor:
const app = express()

// definidnod o a porta que o servidor ficara disponivel
const port = 3000

//inciando o servidor
app.listen(port,() =>{
    console.log(`Servidor rodando em http://localhost:${port}`)
})