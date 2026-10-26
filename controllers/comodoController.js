import comodoService from "../services/comodoService.js";
import tarefaService from "../services/tarefaService.js";

// Trata os erros retornados pelas operações
const tratarErro = (error, res) => {
  if (error.name === "CastError") {
    return res.status(400).json({ erro: true, mensagem: "ID inválido" });
  }
  if (error.name === "ValidationError") {
    return res.status(400).json({ erro: true, mensagem: "Erro de validação" });
  }
  if (error.status === 400) {
    return res.status(400).json({ erro: true, mensagem: error.message });
  }
  console.error(error);
  return res
    .status(500)
    .json({ erro: true, mensagem: "Erro interno do servidor" });
};
// funcao para listar os comodo pelo id
const getComodoById = async (req, res) => {
  const id = req.params.id;
  try {
    const comodo = await comodoService.getComodoById(id);
    if (!comodo) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Cômodo não encontrado" });
    }
    return res.status(200).json(comodo);
  } catch (error) {
    return tratarErro(error, res);
  }
};

// funcao de listar os comodos
const getAllComodos = async (req, res) => {
  try {
    //Busca os comodos atraves do service
    const comodos = await comodoService.getAllComodos();
    //retorna os comodos em JSON
    return res.status(200).json(comodos);
  } catch (error) {
    return tratarErro(error, res);
  }
};

// funcao para listar as tarefas do comodo
const getTarefasByComodoId = async (req, res) => {
  // pegando o comodoId no paramentro
  const comodoId = req.params.comodoId;
  try {
    // Verificando o comodo que contem o mesmo id do comodoId da tarefa
    const comodo = await comodoService.getComodoById(comodoId);
    // Se nao existir um comodo com a comodoId
    // Buscando as tarefas do comodo da tarefa
    if (!comodo) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Cômodo não encontrado" });
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
  } catch (error) {
    return tratarErro(error, res);
  }
};
export default { getAllComodos, getComodoById, getTarefasByComodoId };
