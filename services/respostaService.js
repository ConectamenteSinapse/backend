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
export default {getAllRespostas, getRespostaById, getRespostasByTarefaId}