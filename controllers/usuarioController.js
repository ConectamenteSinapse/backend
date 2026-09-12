// importando o usuarioService
import usuarioService from "../services/usuarioService.js"



// funcao para listar todos os usuarios
const getAllUsuarios = (req, res) =>{
    //busca os usuarios no usuarioService
    const usuarios = usuarioService.getAllUsuarios()
// retorna todos os usuarios cadastrados 
    return res.status(200).json(usuarios)
}

//funcao para listar o usuario pelo ID
const getUsuarioById = (req, res)=>{
    const id = Number(req.params.id);
    //buscar o usuario atraves do service
    const usuario = usuarioService.getUsuarioById(id)
   
    if (!usuario){
        return res.status(404).json({ mensagem: 'Usuario nao Encontrado'})
    }
    return res.status(200).json(usuario)      
}

//funcao para cadastro de um usuario
const postUsuario = (req, res)=>{
    //pegando os dados do novo usuario
    const nome = req.body.nome;
    const email = req.body.email;
    const senha = req.body.senha;
    const perfil = req.body.perfil;
    // verificando se algum campo nao foi enviado
    if (!nome || !email || !senha ||! perfil){
        return res.status(400).json({
            mensagem : "Campos Obrigatorios nao preenchidos"
            })
        }
    const novoUsuario = usuarioService.postUsuario(nome, email, senha, perfil)
    // se der certo retorna o status 201 (created) e mostar o usuario criado em Json
    return res.status(201).json(novoUsuario)
}
// funcao para atualizar totalmente o usuario:
const putUsuarioById = (req, res)=>{
    const id = Number(req.params.id);
    // Se o usuario nao existir, retornar 404
    
    const nome = req.body.nome;
    const email = req.body.email;
    const senha = req.body.senha;
    const perfil = req.body.perfil;
    // verifica se todos os campos foram preenchidos
    if (!nome || !email || !senha ||! perfil){
        return res.status(400).json({
            mensagem : "Campos Obrigatorios nao preenchidos"
        })
    }
    
    const usuario = usuarioService.putUsuarioById(id, nome, email, senha, perfil)
    if(!usuario){
        return res.status(404).json({
            mensagem : "Usuario não encontrado"
        })
    }
    
    return res.status(200).json(usuario)
}

// funcao para atualizar campo especifico do usuario
const patchUsuarioById = (req,res)=>{
    const id = Number(req.params.id)
    
    //Pega dados enviados no Body
    const dadosAtualizados = req.body

    //Atualiza o usuario atraves do service
    const usuario = usuarioService.patchUsuarioById(id, dadosAtualizados)
    
    //Se o usuario nao existir, retorna 404 not found
    if (!usuario){ return res.status(404).json({ mensagem : "Usuario nao encontrado"})}
    
    //Retorna o 200 sucesso e o json atualizado do usuario
    return res.status(200).json(usuario)
    
}
const deleteUsuarioById =(req,res)=>{
    const id = Number(req.params.id)
    const usuarioDeletado = usuarioService.deleteUsuarioById(id)

    if(!usuarioDeletado){
        return res.status(404).json({ mensagem : "usuario nao encontrado"})
    }
    
    return res.sendStatus(204)
}
export default {getAllUsuarios, getUsuarioById, postUsuario, putUsuarioById, patchUsuarioById, deleteUsuarioById}