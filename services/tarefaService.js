// Array temporário para estudo das tarefas do jogo
const tarefas = [
    {
        id: 1,
        titulo: "Escovar os dentes",
        enunciado: "Qual item usamos para escovar os dentes?",
        descricao: "Identificar o item correto para escovação",
        comodoId: 1,
        dificuldade: "facil",
        ordem: 1,
        tipo: "padrao",
        criadoPor: null
    },
    {
        id: 2,
        titulo: "Lavar as mãos",
        enunciado: "Quando devemos lavar as mãos?",
        descricao: "Reconhecer o momento correto de lavar as mãos",
        comodoId: 1,
        dificuldade: "facil",
        ordem: 2,
        tipo: "padrao",
        criadoPor: null
    },
    {
        id: 3,
        titulo: "Arrumar a cama",
        enunciado: "O que devemos fazer ao acordar?",
        descricao: "Organizar a cama depois de acordar",
        comodoId: 2,
        dificuldade: "facil",
        ordem: 1,
        tipo: "padrao",
        criadoPor: null
    },
    {
        id: 4,
        titulo: "Guardar os brinquedos",
        enunciado: "Onde devemos guardar os brinquedos depois de brincar?",
        descricao: "Guardar os brinquedos no local correto",
        comodoId: 2,
        dificuldade: "facil",
        ordem: 2,
        tipo: "padrao",
        criadoPor: null
    }
]

// funcao para listar todos as tarefas
const getAllTarefas = () =>{
   return tarefas
}

// funcao para llistar uma tarefa especifica
const getTarefaById = (id) => {
    const tarefa = tarefas.find((tarefa)=> tarefa.id === id)
    return tarefa
}
//funcao responsavel por verificar as tarfas referentes ao comodo
const getTarefasByComodoId = (comodoId) => {
    const tarefasDoComodo = tarefas.filter((tarefa)=>tarefa.comodoId === comodoId)
    return tarefasDoComodo
}
export default {getAllTarefas, getTarefaById, getTarefasByComodoId}