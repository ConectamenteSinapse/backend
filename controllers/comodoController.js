import comodoService from "../services/comodoService.js";
import tarefaService from "../services/tarefaService.js";

// funcao de listar os comodos
const getAllComodos = async (req, res) => {
  //Busca os comodos atraves do service
  const comodos = await comodoService.getAllComodos();

  //retorna os comodos em JSON
  return res.status(200).json(comodos);
};
// funcao para listar os comodo pelo id
const getComodoById = async (req, res) => {
  const id = req.params.id;
  const comodo = await comodoService.getComodoById(id);
  if (!comodo) {
    return res.status(404).json({ mensagem: "Comodo nao encontrado" });
  }
  return res.status(200).json(comodo);
};

// funcao para listar as tarefas do comodo
const getTarefasByComodoId = async (req, res) => {
  // pegando o comodoId no paramentro
  const comodoId = req.params.comodoId;
  // Verificando o comodo que contem o mesmo id do comodoId da tarefa
  const comodo = await comodoService.getComodoById(comodoId);
  // Se nao existir um comodo com a comodoId
  // Buscando as tarefas do comodo da tarefa
  if (!comodo) {
    return res.status(404).json({ mensagem: "Cômodo não encontrado" });
  }
  const tarefas = await tarefaService.getTarefasByComodoId(comodoId);
  // Se o cômodo existe, mas não possui tarefas
  if (tarefas.length === 0) {
    return res.status(200).json({
      mensagem: "Este cômodo ainda não possui tarefas cadastradas",
      tarefas: [],
    });
  }

  return res.status(200).json(tarefas);
};
export default { getAllComodos, getComodoById, getTarefasByComodoId };
