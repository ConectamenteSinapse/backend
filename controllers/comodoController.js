import comodoService from "../services/comodoService.js"

// funcao de listar os comodos 
const getAllComodos = (req,res) => {
    //Busca os comodos atraves do service
    const comodos  = comodoService.getAllComodos()

    //retorna os comodos em JSON
    return res.status(200).json(comodos)
}
// funcao para listar os comodo pelo id
const getComodoById = (req,res)=> {
    const id = Number(req.params.id)
    const comodo = comodoService.getComodoById(id);
    if(!comodo){
        return res.status(404).json({mensagem : "Usuario nao encontrado"})
    }
    return res.status(200).json(comodo)
}

export default {getAllComodos, getComodoById}