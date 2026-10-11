import RespostaModel from "../models/respostaModel.js";
import tarefaService from "../services/tarefaService.js";

//Verifica se a tarefa informada existe no banco
const validarTarefa = async (tarefaId) => {
  const tarefa = await tarefaService.getTarefaById(tarefaId);
  if (!tarefa) {
    const error = new Error("Tarefa não encontrada");
    error.status = 400;
    throw error;
  }
};

// Funcao para pegar todas as respostas
const getAllRespostas = async () => {
  const respostas = await RespostaModel.find();
  return respostas;
};
// Função para pegar resposta pelo Id
const getRespostaById = async (id) => {
  const resposta = await RespostaModel.findById(id);
  return resposta;
};

//funcao que pega as respostas de uma determinada tarefaId
const getRespostasByTarefaId = async (tarefaId) => {
  const respostasDaTarefa = await RespostaModel.find({
    tarefaId: tarefaId,
  }).sort({ ordem: 1 }); // ja deixa organizado as respostas de ordem crescente
  return respostasDaTarefa;
};

// funcao  que pega as repostas SEM  o campo correto de uma determinada tarefaId
const getRespostasByTarefaIdSemCorreta = async (tarefaId) => {
  // utiliza a respostas e tira o  o campo Correto aytaves da funcao mascaraCAmpoCorreto
  const respostasDaTarefaSemCorreta = await RespostaModel.find({
    tarefaId: tarefaId,
  })
    .select("-correta")
    .sort({ ordem: 1 });

  return respostasDaTarefaSemCorreta;
};

//funcao para criar Resposta
const postResposta = async (dadosResposta) => {
  await validarTarefa(dadosResposta.tarefaId);
  const novaResposta = await RespostaModel.create(dadosResposta);
  return novaResposta;
};

// funcao para edicao completa da resposta
const putRespostaById = async (id, dadosAtualizados) => {
  await validarTarefa(dadosAtualizados.tarefaId);
  const resposta = await RespostaModel.findByIdAndUpdate(id, dadosAtualizados, {
    new: true,
    runValidators: true,
  });
  return resposta;
};
// funcao para edicao PARCIAL da resposta
const patchRespostaById = async (id, dadosAtualizados) => {
  if (dadosAtualizados.tarefaId !== undefined) {
    await validarTarefa(dadosAtualizados.tarefaId);
  }
  const resposta = await RespostaModel.findByIdAndUpdate(id, dadosAtualizados, {
    new: true,
    runValidators: true,
  });
  return resposta;
};
//funcao para excluir uma resposta
const deleteRespostaById = async (id) => {
  const resposta = await RespostaModel.findByIdAndDelete(id);
  if (!resposta) {
    return false;
  }
  return true;
};

export default {
  getAllRespostas,
  getRespostaById,
  getRespostasByTarefaId,
  getRespostasByTarefaIdSemCorreta,
  postResposta,
  putRespostaById,
  patchRespostaById,
  deleteRespostaById,
};
