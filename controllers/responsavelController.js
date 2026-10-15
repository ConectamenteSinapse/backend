import responsavelService from "../services/responsavelService.js"
// tratar error
const tratarErro = (error, res) => {
    if(error.message === "ID_INVALIDO"){
        return res.status(400).json({mensagem: error.message})
    }
    if(error.message === "PERFIL_USUARIO_INVALIDO"){
        return res.status(400).json({mensagem: error. message})
    }
    if(error.message === "USUARIO_NAO_ENCONTRADO"){
        return res.status(404).json({mensagem: "Usuario não encontrado"})
    }
    if(error.message === "RESPONSAVEL_NAO_ENCONTRADO"){
        return res.status(404).json({mensagem: "Responsavel nao encontrado"})
    }
    if(error.message === "PERFIL_RESPONSAVEL_EXISTENTE"){
        return res.status(409).json({mensagem : "Este usuario ja possui um perfil de responsavel"})
    }
    if(error.name === "ValidationError" || error.name === "CastError"){
        return res.status(400).json({mensagem : "Dados invalidos"})
    }
    // duplicidadae do mongoDB
    if (error.code === 11000){
        return res.status(409).json({ mensagem: "Registro duplicado"})
    }
    console.log(error)
    return res.status(500).json({mensagem : "Erro interno do servidor"})
}   
// Listar os Responsaveis
const getResponsaveis = async (req,res) => {
    try{
        const responsaveis = await responsavelService.getResponsaveis();
        return res.status(200).json(responsaveis)
    }catch(error){
        return tratarErro(error, res)
    }
}

