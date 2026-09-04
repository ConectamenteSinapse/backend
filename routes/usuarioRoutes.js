// Importando o express no usuarioRouter.js
import express from "express"

//Criando a variavel para usar a função Router() qu e ajuda a separar e agrupar rotas
const router = express.Router();

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

// Rota para listar todos os usuarios:
router.get("/",(req,res)=>{
    return res.status(200).json(usuarios)
})

//rota para um usuario em especifico:
router.get("/:id", (req, res)=>{
    const id = Number(req.params.id);
    const usuario = usuarios.find((usuario) => usuario.id === id)
    if (!usuario){
        return res.status(404).json({ mensagem: 'Usuario nao Encontrado'})
    }
    return 
        res.status(200).json(usuario)      
})
//Exportando o router para ser usado em outros lugares
export default router


