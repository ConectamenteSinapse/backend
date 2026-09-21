// Array temporário para estudo das respostas/alternativas das tarefas
const respostas = [
    {
        id: 1,
        tarefaId: 1,
        texto: "Escova de dentes",
        correta: true,
        ordem: 1
    },
    {
        id: 2,
        tarefaId: 1,
        texto: "Pente",
        correta: false,
        ordem: 2
    },
    {
        id: 3,
        tarefaId: 1,
        texto: "Colher",
        correta: false,
        ordem: 3
    },
    {
        id: 4,
        tarefaId: 2,
        texto: "Antes das refeições",
        correta: true,
        ordem: 1
    },
    {
        id: 5,
        tarefaId: 2,
        texto: "Somente antes de dormir",
        correta: false,
        ordem: 2
    },
    {
        id: 6,
        tarefaId: 2,
        texto: "Nunca precisa lavar",
        correta: false,
        ordem: 3
    }
]

// Funcao para pegar todas as respostas
const getAllRespostas = () =>{
    return respostas
}
// Função para pegar resposta pelo Id
const getRespostaById = (id) =>{
    
    const resposta = respostas.find((resposta) => resposta.id === id)

    return resposta
}
//funcao que pega as respostas de uma determinada tarefaId
const getRespostasByTarefaId = (tarefaId)=>{

    const respostasDaTarefa = respostas.filter((resposta)=> resposta.tarefaId === tarefaId)
    return respostasDaTarefa
}

// funcao para "Mascarar" o "correta: true || false"
const mascaraCampoCorreta = (resposta) => {
    return {
        id: resposta.id,
        tarefaId: resposta.tarefaId,
        texto: resposta.texto,
        ordem: resposta.ordem 
    }
}


// funcao  que pega as repostas SEM  o campo correto de uma determinada tarefaId
const getRespostasByTarefaIdSemCorreta = (tarefaId)=> {
    // pega as respostas da tarefaId desejado
    const respostasDaTarefa = getRespostasByTarefaId(tarefaId)
    // utiliza a respostas e tira o  o campo Correto aytaves da funcao mascaraCAmpoCorreto
    const respostasDaTarefaSemCorreta = respostasDaTarefa.map((resposta)=>mascaraCampoCorreta(resposta))
    return respostasDaTarefaSemCorreta
}


export default {getAllRespostas, getRespostaById, getRespostasByTarefaId, getRespostasByTarefaIdSemCorreta}