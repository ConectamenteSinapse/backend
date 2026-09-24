const comodos = [
  {
    id: 1,
    nome: "Banheiro",
    descricao: "Cômodo com tarefas de higiene pessoal",
    ordem: 1,
  },
  {
    id: 2,
    nome: "Quarto",
    descricao: "Cômodo com tarefas de organização pessoal",
    ordem: 2,
  },
  {
    id: 3,
    nome: "Cozinha",
    descricao: "Cômodo com tarefas relacionadas à alimentação",
    ordem: 3,
  },
  {
    id: 4,
    nome: "Sala",
    descricao: "Cômodo com tarefas de convivência e organização",
    ordem: 4,
  },
];

//Função responsavel por retornar todos os comodos
const getAllComodos = () => {
  return comodos;
};
//funcao responsavel por verificar o comodo especifico
const getComodoById = (id) => {
  const comodo = comodos.find((comodo) => comodo.id === id);
  return comodo;
};

export default { getAllComodos, getComodoById };
