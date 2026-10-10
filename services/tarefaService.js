import TarefaModel from "../models/tarefaModel.js";
import comodoService from "../services/comodoService.js";

// Verifica se o comodo existe
const validarComodo = async (comodoId) => {
  const comodo = await comodoService.getComodoById(comodoId);

  if (!comodo) {
    const error = new Error("Cômodo não encontrado");
    error.status = 400;
    throw error;
  }
};
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
  // verificando se o comodo informado existe no Mondgo
  await validarComodo(dadosTarefa.comodoId);
  const tarefa = await TarefaModel.create(dadosTarefa);
  return tarefa;
};
//função para atualizar totalmente uma tarefa
const putTarefaById = async (id, dadosTarefa) => {
  // verificando se o comodo informado existe no Mondgo
  await validarComodo(dadosTarefa.comodoId);
  const tarefa = await TarefaModel.findByIdAndUpdate(id, dadosTarefa, {
    new: true,
    runValidators: true,
  });
  return tarefa;
};
//função para atualizar parcialmente uma tarefa
const patchTarefaById = async (id, dadosAtualizados) => {
  // verificando se o comodo existe se o mesmo for informado

  if (dadosAtualizados.comodoId !== undefined) {
    // verificando se o comodo informado existe no Mondgo
    await validarComodo(dadosAtualizados.comodoId);
  }
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
