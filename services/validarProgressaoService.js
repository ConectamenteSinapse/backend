import TarefaModel from "../models/tarefaModel.js";
import HistoricoJogoModel from "../models/historicoJogoModel.js";
import ComodoModel from "../models/comodoModel.js";

// Verificar se todas as tarefas de uma dificuldade foram concluídas em uma partida específica
const verificarDificuldadeConcluida = async (
  jogoSalvoId,
  comodoId,
  dificuldade,
) => {
  // Buscar todas as tarefas ativas do cômodo
  const tarefas = await TarefaModel.find({
    comodoId,
    ativo: true,
  });

  // Sem tarefas, a dificuldade não está concluída
  if (tarefas.length === 0) {
    return false;
  }

  // Buscar as tarefas acertadas nesta partida
  const tarefasConcluidas = await HistoricoJogoModel.distinct("tarefaId", {
    jogoSalvoId,
    comodoId,
    dificuldade,
    acertou: true,
  });

  // Todas as tarefas precisam ter pelo menos um acerto
  return tarefas.every((tarefa) =>
    tarefasConcluidas.some(
      (idConcluido) => idConcluido.toString() === tarefa._id.toString(),
    ),
  );
};
// Verificar se os cômodos anteriores foram concluídos
const verificarComodoDesbloqueado = async (jogoSalvoId, comodoAtual) => {
  // Buscar os cômodos ativos anteriores
  const comodosAnteriores = await ComodoModel.find({
    ativo: true,
    ordem: { $lt: comodoAtual.ordem },
  }).sort({ ordem: 1 });

  // Verificar as três dificuldades de cada cômodo anterior
  for (const comodoAnterior of comodosAnteriores) {
    for (const dificuldade of ["facil", "medio", "dificil"]) {
      const concluido = await verificarDificuldadeConcluida(
        jogoSalvoId,
        comodoAnterior._id,
        dificuldade,
      );

      if (!concluido) {
        return false;
      }
    }
  }

  return true;
};

// Verificar se a dificuldade está desbloqueada nesta partida
const verificarDificuldadeDesbloqueada = async (
  jogoSalvoId,
  comodoId,
  dificuldade,
) => {
  // A dificuldade fácil está disponível inicialmente
  if (dificuldade === "facil") {
    return true;
  }

  // Para jogar no médio, é necessário concluir o fácil
  if (dificuldade === "medio") {
    return await verificarDificuldadeConcluida(jogoSalvoId, comodoId, "facil");
  }

  // Para jogar no difícil, é necessário concluir o médio
  if (dificuldade === "dificil") {
    return await verificarDificuldadeConcluida(jogoSalvoId, comodoId, "medio");
  }

  return false;
};

// Verificar se todas as tarefas anteriores foram concluídas
const verificarTarefaDesbloqueada = async (
  jogoSalvoId,
  tarefa,
  dificuldade,
) => {
  // Buscar tarefas anteriores no mesmo cômodo
  const tarefasAnteriores = await TarefaModel.find({
    comodoId: tarefa.comodoId,
    ativo: true,
    ordem: { $lt: tarefa.ordem },
  }).sort({ ordem: 1 });

  // Buscar tarefas acertadas nesta partida e dificuldade
  const tarefasConcluidas = await HistoricoJogoModel.distinct("tarefaId", {
    jogoSalvoId,
    comodoId: tarefa.comodoId,
    dificuldade,
    acertou: true,
  });

  // Verificar se todas as tarefas anteriores foram concluídas
  return tarefasAnteriores.every((tarefaAnterior) =>
    tarefasConcluidas.some(
      (idConcluido) => idConcluido.toString() === tarefaAnterior._id.toString(),
    ),
  );
};

export {
  verificarDificuldadeConcluida,
  verificarComodoDesbloqueado,
  verificarDificuldadeDesbloqueada,
  verificarTarefaDesbloqueada,
};
