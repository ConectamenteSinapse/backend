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
// Verifica se a referência de mídia é válida
const validarMidia = (valor) => {
  // Campo opcional
  if (valor === undefined || valor === null) {
    return;
  }

  if (typeof valor !== "string" || valor.trim() === "") {
    const error = new Error("Referência de mídia inválida");
    error.status = 400;
    throw error;
  }
};
// Funcao para pegar todas as respostas
const getAllRespostas = async () => {
  const respostas = await RespostaModel.find().select("-correta");
  return respostas;
};
// Função para pegar resposta pelo Id
const getRespostaById = async (id) => {
  const resposta = await RespostaModel.findById(id).select("-correta");
  return resposta;
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
  // Valida as referências de imagem e áudio
  validarMidia(dadosResposta.imagem);
  validarMidia(dadosResposta.audio);
  const novaResposta = await RespostaModel.create(dadosResposta);
  return novaResposta;
};

// funcao para edicao completa da resposta
const putRespostaById = async (id, dadosAtualizados) => {
  await validarTarefa(dadosAtualizados.tarefaId);
  validarMidia(dadosAtualizados.imagem);
  validarMidia(dadosAtualizados.audio);
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
  validarMidia(dadosAtualizados.imagem);
  validarMidia(dadosAtualizados.audio);
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
  getRespostasByTarefaIdSemCorreta,
  postResposta,
  putRespostaById,
  patchRespostaById,
  deleteRespostaById,
};
