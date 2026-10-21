import mongoose from "mongoose";
import CriancaModel from "../models/criancaModel.js";
import PerfilJogoModel from "../models/perfilJogoModel.js";
import TarefaModel from "../models/tarefaModel.js";
import RespostaModel from "../models/respostaModel.js";
import HistoricoJogoModel from "../models/historicoJogoModel.js";
import ComodoModel from "../models/comodoModel.js";

// Verificar se todas as tarefas de uma dificuldade foram concluídas
const verificarDificuldadeConcluida = async (
  perfilJogoId,
  comodoId,
  dificuldade,
) => {
  // Buscar todas as tarefas ativas do cômodo
  const tarefas = await TarefaModel.find({
    comodoId: comodoId,
    ativo: true,
  });

  // Uma dificuldade sem tarefas não pode ser concluída
  if (tarefas.length === 0) {
    return false;
  }

  // Buscar os IDs das tarefas acertadas nessa dificuldade
  const tarefasConcluidas = await HistoricoJogoModel.distinct("tarefaId", {
    perfilJogoId: perfilJogoId,
    comodoId: comodoId,
    dificuldade: dificuldade,
    acertou: true,
  });

  // Conferir se todas as tarefas possuem pelo menos um acerto
  return tarefas.every((tarefa) => {
    return tarefasConcluidas.some((idConcluido) => {
      return idConcluido.toString() === tarefa._id.toString();
    });
  });
};
// Registrar a resposta escolhida pela criança
const registrarResposta = async (
  usuarioId,
  perfilJogoId,
  tarefaId,
  respostaEscolhidaId,
  dificuldade,
) => {
  // Validar o ID do usuário autenticado
  if (!mongoose.Types.ObjectId.isValid(usuarioId)) {
    throw new Error("ID_INVALIDO");
  }
  // Validar o identificador do personagem selecionado
  if (!mongoose.Types.ObjectId.isValid(perfilJogoId)) {
    throw new Error("ID_INVALIDO");
  }
  // Validar a dificuldade escolhida
  const dificuldadesValidas = ["facil", "medio", "dificil"];

  if (!dificuldadesValidas.includes(dificuldade)) {
    throw new Error("DIFICULDADE_INVALIDA");
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
  // Buscar o personagem selecionado pela criança
  const perfilJogo = await PerfilJogoModel.findOne({
    _id: perfilJogoId,
    criancaId: crianca._id,
    status: "ativo",
  });
  if (!perfilJogo) {
    throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
  }
  // Buscar o cômodo da tarefa
  const comodoAtual = await ComodoModel.findById(tarefa.comodoId);

  if (!comodoAtual || !comodoAtual.ativo) {
    throw new Error("COMODO_INDISPONIVEL");
  }

  // Verificar se existem tarefas disponíveis no cômodo
  const quantidadeTarefas = await TarefaModel.countDocuments({
    comodoId: comodoAtual._id,
    ativo: true,
  });

  if (quantidadeTarefas === 0) {
    throw new Error("COMODO_INDISPONIVEL");
  }

  // Buscar todos os cômodos ativos anteriores
  const comodosAnteriores = await ComodoModel.find({
    ativo: true,
    ordem: { $lt: comodoAtual.ordem },
  }).sort({ ordem: 1 });

  // Cada cômodo anterior precisa estar concluído nas três dificuldades
  for (const comodoAnterior of comodosAnteriores) {
    for (const nivel of ["facil", "medio", "dificil"]) {
      const concluido = await verificarDificuldadeConcluida(
        perfilJogo._id,
        comodoAnterior._id,
        nivel,
      );

      if (!concluido) {
        throw new Error("COMODO_BLOQUEADO");
      }
    }
  }
  // Verificar se a dificuldade escolhida está desbloqueada
  if (dificuldade === "medio") {
    const facilConcluido = await verificarDificuldadeConcluida(
      perfilJogo._id,
      tarefa.comodoId,
      "facil",
    );

    if (!facilConcluido) {
      throw new Error("DIFICULDADE_BLOQUEADA");
    }
  }

  if (dificuldade === "dificil") {
    const medioConcluido = await verificarDificuldadeConcluida(
      perfilJogo._id,
      tarefa.comodoId,
      "medio",
    );

    if (!medioConcluido) {
      throw new Error("DIFICULDADE_BLOQUEADA");
    }
  }
  // Buscar tarefas anteriores selecionada, no mesmo cômodo
  const tarefasAnteriores = await TarefaModel.find({
    comodoId: tarefa.comodoId,
    ativo: true,
    ordem: { $lt: tarefa.ordem },
  }).sort({ ordem: 1 });

  // Buscar tarefas que a criança já acertou nesta dificuldade
  const tarefasConcluidas = await HistoricoJogoModel.distinct("tarefaId", {
    perfilJogoId: perfilJogo._id,
    comodoId: tarefa.comodoId,
    dificuldade: dificuldade,
    acertou: true,
  });
  // Verificar se todas as tarefas anteriores já foram concluídas
  const anterioresConcluidas = tarefasAnteriores.every((tarefaAnterior) => {
    return tarefasConcluidas.some((idConcluido) => {
      return idConcluido.toString() === tarefaAnterior._id.toString();
    });
  });

  if (!anterioresConcluidas) {
    throw new Error("TAREFA_FORA_DA_ORDEM");
  }
  // Verificar se a alternativa escolhida está correta
  const acertou = resposta.correta;

  // Estrelas concedidas por dificuldade
  const estrelasPorDificuldade = {
    facil: 1,
    medio: 2,
    dificil: 3,
  };

  // Calcular as estrelas da tentativa
  const pontuacaoGanha = acertou ? estrelasPorDificuldade[dificuldade] : 0;

  // Iniciar uma sessão no MongoDB
  const session = await mongoose.startSession();

  try {
    let historico;

    await session.withTransaction(async () => {
      // Confirmar e reservar o personagem ativo nesta transação
      const perfilAtivo = await PerfilJogoModel.findOneAndUpdate(
        {
          _id: perfilJogo._id,
          criancaId: crianca._id,
          status: "ativo",
        },
        {
          $inc: { estrelasTotal: pontuacaoGanha },
          $currentDate: { ultimaInteracaoEm: true },
        },
        {
          session,
          new: true,
          runValidators: true,
        },
      );

      if (!perfilAtivo) {
        throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
      }
      // Contar as tentativas anteriores nesta tarefa
      const tentativasAnteriores = await HistoricoJogoModel.countDocuments({
        perfilJogoId: perfilJogo._id,
        tarefaId: tarefa._id,
        dificuldade: dificuldade,
      }).session(session);

      // Definir o número da próxima tentativa
      const tentativa = tentativasAnteriores + 1;

      // Registrar a tentativa com a pontuação calculada
      const historicosCriados = await HistoricoJogoModel.create(
        [
          {
            perfilJogoId: perfilJogo._id,
            criancaId: crianca._id,
            comodoId: tarefa.comodoId,
            tarefaId: tarefa._id,
            dificuldade: dificuldade,
            respostaEscolhidaId: resposta._id,
            acertou: acertou,
            tentativa: tentativa,
            pontuacaoGanha: pontuacaoGanha,
            tempoGastoSegundos: 0,
          },
        ],
        { session },
      );

      historico = historicosCriados[0];
    });

    return historico;
  } finally {
    await session.endSession();
  }
};
export default {
  registrarResposta,
};
