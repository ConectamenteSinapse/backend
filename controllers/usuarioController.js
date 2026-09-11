

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

// funcao para listar todos os usuarios
const getAllUsuarios = (req, res) =>{
// retorna todos os usuarios cadastrados 
    return res.status(200).json(usuarios)
}
//funcao para listar o usuario pelo ID
const getUsuarioByID = (req, res)=>{
    const id = Number(req.params.id);
    const usuario = usuarios.find((usuario) => usuario.id === id)
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
    
    //criando o objeto do novo usuario
    const novoUsuario = {
        id: usuarios.length +1,
        nome: nome,
        // podemos usar desta forma quando a chave e fechadura sao escritos da mesma forma
        email,
        senha,
        perfil 
    }
    usuarios.push(novoUsuario)
    // se der certo retorna o status 201 (created) e mostar o usuario criado em Json
    return res.status(201).json(novoUsuario)
}
// funcao para atualizar totalmente o usuario:
const putUsuarioById = (req, res)=>{
    const id = Number(req.params.id);
    const usuario = usuarios.find((usuario)=> usuario.id === id)
    // Se o usuario nao existir, retornar 404
    if(!usuario){
        return res.status(404).json({
            mensagem : "Usuario não encontrado"
        })
    }
    
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
    // atualiza os dados necessario
    usuario.nome = nome
    usuario.email = email
    usuario.senha = senha
    usuario.perfil = perfil

    
    return res.status(201).json(usuario)
}

// funcao para atualizar campo especifico do usuario
const patchUsuarioById = (req,res)=>{
    const id = Number(req.params.id)
    
    const usuario = usuarios.find((usuario)=> usuario.id === id)
    if (!usuario){ res.status(404).json({ mensagem : "Usuario nao encontrado"})}
    
    if (req.body.nome !== undefined){
        usuario.nome = req.body.nome
    }

    if (req.body.email !== undefined){
        usuario.email = req.body.email
    }

    if (req.body.senha !== undefined){
        usuario.senha = req.body.senha
    }

    if (req.body.perfil !== undefined){
        usuario.perfil = req.body.perfil
    }
    return res.status(200).json(usuario)
    
}
const deleteUsuarioById =(req,res)=>{
    const id = Number(req.params.id)
    // Procura a posicao ao usuario no array
    const indice = usuarios.findIndex((usuario) => usuario.id === id)
    // quando nao tem nenhum valor encontrado a resposta da -1
    if(indice === -1){
        return res.status(404).json({ mensagem : "usuario nao encontrado"})
    }
    usuarios.splice(indice, 1)

    // Retorna 204
    return res.sendStatus(204)
}
export default {getAllUsuarios, getUsuarioByID, postUsuario, putUsuarioById, patchUsuarioById}