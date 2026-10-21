import HistoricoJogoModel from "../models/historicoJogoModel.js";
import { validarAcessoCrianca } from "./validarAcessoCriancaService.js";
import { buscarJogoSalvoPorId } from "./jogoSalvoService.js";

// Consultar as tentativas realizadas por uma criança
const consultarHistorico = async (criancaId, usuarioAutenticado) => {
  // Validar a existência da criança e a autorização
  const crianca = await validarAcessoCrianca(criancaId, usuarioAutenticado);

  // Buscar as tentativas registradas no MongoDB
  const tentativas = await HistoricoJogoModel.find({
    criancaId: crianca._id,
  })
    .sort({ dataHora: -1 })
    .select(
      "perfilJogoId jogoSalvoId comodoId tarefaId respostaEscolhidaId dificuldade acertou tentativa pontuacaoGanha dataHora",
    )
    .lean();

  // Retornar todas as tentativas, sem agrupamento
  return {
    criancaId,
    totalTentativas: tentativas.length,
    tentativas,
  };
};

// Consultar somente as tentativas de uma partida
const consultarHistoricoJogo = async (usuarioId, jogoSalvoId) => {
  // Confirmar que a partida pertence à criança autenticada
  const jogoSalvo = await buscarJogoSalvoPorId(usuarioId, jogoSalvoId);

  // Buscar somente as tentativas dessa partida
  const tentativas = await HistoricoJogoModel.find({
    jogoSalvoId: jogoSalvo._id,
  })
    .sort({ dataHora: -1 })
    .select(
      "jogoSalvoId perfilJogoId comodoId tarefaId respostaEscolhidaId dificuldade acertou tentativa pontuacaoGanha dataHora",
    )
    .lean();

  return {
    jogoSalvoId: jogoSalvo._id,
    totalTentativas: tentativas.length,
    tentativas,
  };
};

export { consultarHistorico, consultarHistoricoJogo };
