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
// funcao responsavel por buscar todos os usuarios
const getAllUsuarios = () => {
    return usuarios
}
// funcao para buscar somente um usuario pelo id
const getUsuarioById = (id) =>{
    const usuario = usuarios.find((usuario) => usuario.id === id)
    return usuario
}
// funcao para cadastar um usuario
const postUsuario = (nome, email, senha, perfil) =>{
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
    return novoUsuario
}
// funcao para editar totalmente um usuario pelo id
const putUsuarioById = (id, nome, email, senha ,perfil) =>{
    const usuario = usuarios.find((usuario)=> usuario.id === id)
    if (!usuario){
        return undefined
    }
     // atualiza os dados necessario
    usuario.nome = nome
    usuario.email = email
    usuario.senha = senha
    usuario.perfil = perfil
    // retorna o usuario ja modificado
    return usuario
}

// funcao para editar parcialmente um usuario pelo Id

const patchUsuarioById = (id, dadosAtualizados) =>{
    const usuario = usuarios.find((usuario)=>usuario.id === id)
    if(!usuario){
        return undefined
    }
    if (dadosAtualizados.nome !== undefined){
        usuario.nome = dadosAtualizados.nome
    }
    if (dadosAtualizados.email !== undefined){
        usuario.email = dadosAtualizados.email
    }
    if (dadosAtualizados.senha !== undefined){
        usuario.senha = dadosAtualizados.senha
    }
    if (dadosAtualizados.perfil !== undefined){
        usuario.perfil = dadosAtualizados.perfil
    }

    return usuario
}

//Funcao para deletar um Usuario
const deleteUsuarioById = (id)=>{
    const indice = usuarios.findIndex((usuario)=>usuario.id === id)
    if (indice === -1 ){
        return false
    }
    usuarios.splice(indice, 1)
    return  true

}
export default { getAllUsuarios, getUsuarioById, postUsuario, putUsuarioById, patchUsuarioById, deleteUsuarioById}