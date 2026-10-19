import mongoose from "mongoose";
import CriancaModel from "../models/criancaModel.js";
import PerfilJogoModel from "../models/perfilJogoModel.js";
import TarefaModel from "../models/tarefaModel.js";
import RespostaModel from "../models/respostaModel.js";
import HistoricoJogoModel from "../models/historicoJogoModel.js";

// Registrar a resposta escolhida pela criança
const registrarResposta = async (usuarioId, tarefaId, respostaEscolhidaId) => {
  // Validar o ID do usuário autenticado
  if (!mongoose.Types.ObjectId.isValid(usuarioId)) {
    throw new Error("ID_INVALIDO");
  }

  // Buscar o perfil infantil associado ao usuário autenticado
  const crianca = await CriancaModel.findOne({
    usuarioId: usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Verificar se a criança possui autorização para jogar
  if (!crianca.permissaoAtiva) {
    throw new Error("PERMISSAO_INATIVA");
  }

  // Validar os IDs da tarefa e da resposta
  if (
    !mongoose.Types.ObjectId.isValid(tarefaId) ||
    !mongoose.Types.ObjectId.isValid(respostaEscolhidaId)
  ) {
    throw new Error("ID_INVALIDO");
  }
  // Buscar a tarefa no MongoDB
  const tarefa = await TarefaModel.findById(tarefaId);
  if (!tarefa) {
    throw new Error("TAREFA_NAO_ENCONTRADA");
  }
  // Verificar se a tarefa está ativa
  if (!tarefa.ativo) {
    throw new Error("TAREFA_INATIVA");
  }
  // Buscar a resposta escolhida
  const resposta = await RespostaModel.findOne({
    _id: respostaEscolhidaId,
    tarefaId: tarefa._id,
  });

  if (!resposta) {
    throw new Error("RESPOSTA_INVALIDA");
  }
  // Buscar o perfil de jogo da criança autenticada
  const perfilJogo = await PerfilJogoModel.findOne({
    criancaId: crianca._id,
    status: "ativo",
  });

  if (!perfilJogo) {
    throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
  }
  // Verificar se a alternativa escolhida está correta
  const acertou = resposta.correta;

  // Contar as tentativas anteriores nesta tarefa
  const tentativasAnteriores = await HistoricoJogoModel.countDocuments({
    perfilJogoId: perfilJogo._id,
    tarefaId: tarefa._id,
  });

  // Definir o número da próxima tentativa
  const tentativa = tentativasAnteriores + 1;

  // Registrar a tentativa no histórico do jogo
  const historico = await HistoricoJogoModel.create({
    perfilJogoId: perfilJogo._id,
    criancaId: crianca._id,
    comodoId: tarefa.comodoId,
    tarefaId: tarefa._id,
    respostaEscolhidaId: resposta._id,
    acertou: acertou,
    tentativa: tentativa,
    pontuacaoGanha: 0,
    tempoGastoSegundos: 0,
  });

  // Retornar o registro criado
  return historico;
};
export default {
  registrarResposta,
};
