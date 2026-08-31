//Importando o Express  - facilita a criacao do servidor das rotas e respostas HTTP
import express from "express"

//criarndo a variavel app para configurar o servidor:
const app = express()
//Permite que o Express interprete dados enviados no  formato Json
app.use(express.json())
// definidnod o a porta que o servidor ficara disponivel
const port = 3000

//array para estudo de usuarios cadastrados
const usuarios = [
    {
        id: 1,
        nome: "Ana Souza",
        email: "ana@email.com",
        senha: "teste123",
        perfil: "responsavel"
    },
    {
        id: 2,
        nome: "Carlos Lima",
        email: "carlos@email.com",
        senha: "teste456",
        perfil: "responsavel"
    },
    {
        id: 3,
        nome: "Mariana Alves",
        email: "mariana@email.com",
        senha: "teste789",
        perfil: "crianca"
    },
    {
        id: 4,
        nome: "João Santos",
        email: "joao@email.com",
        senha: "teste321",
        perfil: "crianca"
    }

]

//rota principal
// Requisiçoes Get feitas para "/"
app.get("/", (req, res) =>{
    res.send('Api iniciado com Sucesso')
})
//rota status
app.get("/status", (req,res)=>{
    res.json({
        mensagem: "API Conectamente funcionando",
        status : "Online"
    })
})
//rota para listar todas os usuarios
app.get("/usuarios",(req, res) =>{
    res.status(200).json(usuarios)
})
//rota para listar usuario especificas
app.get("/usuarios/:id", (req,res)=> {
    //pega o valor enviado no paramentro :id da rota
    const id = Number(req.params.id)
    const usuario = usuarios.find((usuario) => usuario.id === id)
    //Verificar se foi encontrado ou nao um usuario com esse id:
    // No promeiro caso nao encontrou 
    if (!usuario){
        return res.status(404).json({
           mensagem : "Usuario nao encontrada" 
        })
    }
    res.status(200).json(usuario)
})
// Rota POST para cadastrar 
app.post("/usuarios", (req, res) => {

    const nome = req.body.nome
    const email = req.body.email
    const senha = req.body.senha
    const perfil = req.body.perfil
//Criando um novo usuario
    const novoUsuario = {
        id: usuarios.length +1,
        nome,
        email,
        senha,
        perfil
    }
    //adiciona um novo usuario ao array
    usuarios.push(novoUsuario)
    return res.status(201).json(novoUsuario)
})

//Rota PUT
app.put("/usuarios/:id",(req,res)=>{
    const id = Number(req.params.id)
    const usuario = usuarios.find((usuario)=> usuario.id === id)
    if (!usuario){
        return res.status(404).json({
            mensagem : "Usuarios não encontrado"
        })
    }

    usuario.nome = req.body.nome
    usuario.email = req.body.email
    usuario.senha = req.body.senha
    usuario.perfil = req.body.perfil
    return res.status(200).json(usuario)    
})

// rota DELETE  para exculsao do usuaroio
app.delete("/usuarios/:id", (req,res)=>{
    const id = Number(req.params.id)
    const indice = usuarios.findIndex((usuario)=> usuario.id === id )
    if(indice === -1){
        return res.status(404).json({
            mensagem: "Usuario nao encontrado"
        })
    }
    usuarios.splice(indice,1)
    return res.status(204).send()

    
})
//inciando o servidor
app.listen(port,() =>{
    console.log(`Servidor rodando em http://localhost:${port}`)
})