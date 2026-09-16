import comodoService from "../services/comodoService.js"
import tarefaService from "../services/tarefaService.js"

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
        return res.status(404).json({mensagem : "Comodo nao encontrado"})
    }
    return res.status(200).json(comodo)
}

// funcao para listar as tarefas do comodo
const getTarefasByComodoId = (req,res)=>{
    // pegando o comodoId no paramentro
    const comodoId = Number(req.params.comodoId)
    // Verificando o comodo que contem o mesmo id do comodoId da tarefa
    const comodo = comodoService.getComodoById(comodoId)
    // Buscando as tarefas do comodo da tarefa
    const tarefas = tarefaService.getTarefasByComodoId(comodoId)
    // Se nao existir um comodo com a comodoId
    if (!comodo) {
        return res.status(404).json({mensagem: "Cômodo não encontrado"})
    }
    // Se o cômodo existe, mas não possui tarefas
    if (tarefas.length === 0) {
        return res.status(200).json({
            mensagem: "Este cômodo ainda não possui tarefas cadastradas",
            tarefas: []
        })
    }

    return res.status(200).json(tarefas)
}
export default {getAllComodos, getComodoById, getTarefasByComodoId}