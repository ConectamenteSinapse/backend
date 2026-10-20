import HistoricoJogoModel from "../models/historicoJogoModel.js";
import { validarAcessoCrianca } from "./validarAcessoCriancaService.js";

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
      "perfilJogoId comodoId tarefaId respostaEscolhidaId dificuldade acertou tentativa pontuacaoGanha dataHora",
    )
    .lean();

  // Retornar todas as tentativas, sem agrupamento
  return {
    criancaId,
    totalTentativas: tentativas.length,
    tentativas,
  };
};

export { consultarHistorico };
