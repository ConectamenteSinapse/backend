import mongoose from "mongoose";
import CriancaModel from "../models/criancaModel.js";
import PerfilJogoModel from "../models/perfilJogoModel.js";
import TarefaModel from "../models/tarefaModel.js";
import RespostaModel from "../models/respostaModel.js";
import HistoricoJogoModel from "../models/historicoJogoModel.js";
import ComodoModel from "../models/comodoModel.js";
import JogoSalvoModel from "../models/jogoSalvoModel.js";
import {
  verificarComodoDesbloqueado,
  verificarDificuldadeDesbloqueada,
  verificarTarefaDesbloqueada,
} from "./validarProgressaoService.js";

// Registrar a resposta escolhida pela criança
const registrarResposta = async (
  usuarioId,
  perfilJogoId,
  jogoSalvoId,
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
  // Validar o identificador da partida
  if (!mongoose.Types.ObjectId.isValid(jogoSalvoId)) {
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

  // Buscar a partida selecionada pela criança
  const jogoSalvo = await JogoSalvoModel.findOne({
    _id: jogoSalvoId,
    perfilJogoId: perfilJogo._id,
  });

  // Verificar se a partida existe e pertence ao personagem
  if (!jogoSalvo) {
    throw new Error("JOGO_SALVO_NAO_ENCONTRADO");
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

  // Verificar se todos os cômodos anteriores foram concluídos
  const comodoDesbloqueado = await verificarComodoDesbloqueado(
    jogoSalvo._id,
    comodoAtual,
  );

  if (!comodoDesbloqueado) {
    throw new Error("COMODO_BLOQUEADO");
  }
  // Verificar se a dificuldade selecionada está desbloqueada
  const dificuldadeDesbloqueada = await verificarDificuldadeDesbloqueada(
    jogoSalvo._id,
    tarefa.comodoId,
    dificuldade,
  );

  if (!dificuldadeDesbloqueada) {
    throw new Error("DIFICULDADE_BLOQUEADA");
  }
  // Verificar se as tarefas anteriores foram concluídas nesta partida
  const tarefaDesbloqueada = await verificarTarefaDesbloqueada(
    jogoSalvo._id,
    tarefa,
    dificuldade,
  );

  if (!tarefaDesbloqueada) {
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

      // Atualizar a pontuação da partida selecionada
      const partidaAtualizada = await JogoSalvoModel.findOneAndUpdate(
        {
          _id: jogoSalvo._id,
          perfilJogoId: perfilJogo._id,
        },
        {
          $inc: {
            estrelasTotal: pontuacaoGanha,
          },
          $set: {
            comodoId: tarefa.comodoId,
            tarefaId: tarefa._id,
            dificuldade: dificuldade,
          },
          $currentDate: {
            atualizadoEm: true,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
        },
      );

      // Impedir respostas para partidas excluídas
      if (!partidaAtualizada) {
        throw new Error("JOGO_SALVO_NAO_ENCONTRADO");
      }

      // Contar as tentativas anteriores nesta tarefa
      const tentativasAnteriores = await HistoricoJogoModel.countDocuments({
        jogoSalvoId: jogoSalvo._id,
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
            jogoSalvoId: jogoSalvo._id,
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
