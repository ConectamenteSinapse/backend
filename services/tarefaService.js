import TarefaModel from "../models/tarefaModel.js";

// funcao para listar todos as tarefas
const getAllTarefas = async () => {
  const tarefas = await TarefaModel.find();
  return tarefas;
};

// funcao para listar uma tarefa especifica
const getTarefaById = async (id) => {
  const tarefa = await TarefaModel.findById(id);
  return tarefa;
};
//funcao responsavel por verificar as tarfas referentes ao comodo
const getTarefasByComodoId = async (comodoId) => {
  const tarefasDoComodo = await TarefaModel.find({ comodoId: comodoId });
  return tarefasDoComodo;
};

// funcao para poder cadastrar uma tarefa

const postTarefa = async (dadosTarefa) => {
  const tarefa = await TarefaModel.create(dadosTarefa);
  return tarefa;
};
//função para atualizar totalmente uma tarefa
const putTarefaById = async (id, dadosTarefa) => {
  const tarefa = await TarefaModel.findByIdAndUpdate(id, dadosTarefa, {
    new: true,
    runValidators: true,
  });
  return tarefa;
};
//função para atualizar parcialmente uma tarefa
const patchTarefaById = async (id, dadosAtualizados) => {
  const tarefa = await TarefaModel.findByIdAndUpdate(id, dadosAtualizados, {
    new: true,
    runValidators: true,
  });
  return tarefa;
};

//funcao para deletar as tarefas
const deleteTarefaById = async (id) => {
  const tarefa = await TarefaModel.findByIdAndDelete(id);
  if (!tarefa) {
    return false;
  }
  return true;
};

export default {
  getAllTarefas,
  getTarefaById,
  getTarefasByComodoId,
  postTarefa,
  putTarefaById,
  patchTarefaById,
  deleteTarefaById,
};
