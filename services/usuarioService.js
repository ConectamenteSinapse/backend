import UsuarioModel from "../models/usuarioModel.js"

// funcao responsavel por buscar todos os usuarios
const getAllUsuarios = async() => {
    const usuarios = await UsuarioModel.find()
    return usuarios
}
// funcao para buscar somente um usuario pelo id
const getUsuarioById = async(id) =>{
    const usuario = await UsuarioModel.findById(id)
    return usuario
}
// funcao para cadastar um usuario
const postUsuario = async (nome, email, senha, perfil) =>{
    //criando o objeto do novo usuario
    const novoUsuario = await UsuarioModel.create({
        
        nome, 
        email,
        senha,
        perfil 
    })
   
    return novoUsuario
}
// funcao para editar totalmente um usuario pelo id
const putUsuarioById = async (id, nome, email, senha, perfil) => {
    const usuario = await UsuarioModel.findByIdAndUpdate(
        id,
        {
            nome,
            email,
            senha,
            perfil
        },
        {
            new: true,
            runValidators: true
        }
    )

    return usuario
}

// funcao para editar parcialmente um usuario pelo Id

const patchUsuarioById = async (id, dadosAtualizados) => {
    const usuario = await UsuarioModel.findByIdAndUpdate(
        id,
        dadosAtualizados,
        {
            new: true,
            runValidators: true
        }
    )

    return usuario
}


//Funcao para deletar um Usuario
const deleteUsuarioById = async (id) => {
    const usuario = await UsuarioModel.findByIdAndDelete(id)

    if (!usuario) {
        return false
    }

    return true
}
export default { getAllUsuarios, getUsuarioById, postUsuario, putUsuarioById, patchUsuarioById, deleteUsuarioById}