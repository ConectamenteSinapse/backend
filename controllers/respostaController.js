import respostaService from "../services/respostaService.js"
import tarefaService from "../services/tarefaService.js"
//funcao para listar todas as respostas
const getAllRespostas = (req, res) =>{
   
    const respostas = respostaService.getAllRespostas()
    return res.status(200).json(respostas)
}

//funcao para listar uma resposta em especifica pelo Id
const getRespostaById = (req, res) => {
     const id  = Number(req.params.respostaId)
     const resposta = respostaService.getRespostaById(id)
     if(!resposta){
       return res.status(404).json({mensagem : "resposta nao encontrado"})
     }
     return res.status(200).json(resposta)
}

//funcao para listar as respostas de uma determinada tarefaId
const getRespostasByTarefaId = (req,res) => {
    const tarefaId = Number(req.params.tarefaId)
        // Verifica se a tarefa existe
    const tarefa = tarefaService.getTarefaById(tarefaId)

    // Se a tarefa não existir, retorna 404
    if (!tarefa) {
        return res.status(404).json({
            mensagem: "Tarefa não encontrada"
        })
    }
    const respostas = respostaService.getRespostasByTarefaId(tarefaId)
    if(respostas.length === 0){
        return res.status(200).json({mensagem : "Nao existem nenhuma resposta para essa tarefa", respostas : []})
    }
    return res.status(200).json(respostas)
}

export default {getAllRespostas, getRespostaById, getRespostasByTarefaId }