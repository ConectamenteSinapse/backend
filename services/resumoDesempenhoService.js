import HistoricoJogoModel from "../models/historicoJogoModel.js";
import { validarAcessoCrianca } from "./validarAcessoCriancaService.js";

const consultarResumoDesempenho = async (
  criancaId,
  usuarioAutenticado,
) => {
  // Validar a criança e a autorização do usuário
  const crianca = await validarAcessoCrianca(
    criancaId,
    usuarioAutenticado,
  );

  // Buscar todas as tentativas da criança
  const historicos = await HistoricoJogoModel.find({
    criancaId: crianca._id,
  }).sort({ dataHora: -1 }).lean();
    // Contar o total de tentativas
  const totalTentativas = historicos.length;

  //Contar as respostas corretas
  const acertos = historicos.filter(
    (historico) => historico.acertou === true,
  ).length;

  //Contar as respostas incorretas
  const erros = historicos.filter(
    (historico) => historico.acertou === false,
  ).length;

  //Calcular o percentual de acertos
  // Evitar divisão por zero quando não houver tentativas
  const percentualAcertos =
    totalTentativas > 0
      ? (acertos / totalTentativas) * 100
      : 0;

  //Obter a última interação
  const ultimaInteracao = historicos[0]?.dataHora ?? null;

  //Somar as estrelas recebidas em todas as tentativas
  const totalEstrelas = historicos.reduce(
    (total, historico) => total + (historico.pontuacaoGanha ?? 0),
    0,
  );

  //Armazenar os IDs das tarefas concluídas sem repetições
  const tarefasConcluidas = new Set();

  for (const historico of historicos) {
    if (historico.acertou === true && historico.tarefaId) {
      tarefasConcluidas.add(historico.tarefaId.toString());
    }
  }

  //Contar as tarefas distintas concluídas
  const totalTarefasConcluidas = tarefasConcluidas.size;
// Criar um Map para armazenar cada cômodo
const comodosAgrupados = new Map();

// Percorrer todas as tentativas da criança
for (const historico of historicos) {
  // Ignorar registros que não possuem cômodo
  if (!historico.comodoId) {
    continue;
  }

  // Converter o ID do cômodo em texto
  const comodoId = historico.comodoId.toString();

  // Criar o cômodo somente se ainda não existir
  if (!comodosAgrupados.has(comodoId)) {
    comodosAgrupados.set(comodoId, {
      comodoId,
      tentativas: 0,
      acertos: 0,
      erros: 0,
      tarefasConcluidas: new Set(),
    });
  }

  // Recuperar os dados do cômodo
  const comodo = comodosAgrupados.get(comodoId);

  // Somar uma tentativa
  comodo.tentativas += 1;

  // Verificar se foi acerto ou erro
  if (historico.acertou === true) {
    comodo.acertos += 1;

    // Registrar a tarefa concluída sem duplicar o ID
    if (historico.tarefaId) {
      comodo.tarefasConcluidas.add(
        historico.tarefaId.toString(),
      );
    }
  } else if (historico.acertou === false) {
  comodo.erros += 1;
    }
}

// Transformar os dados agrupados em um array e calcular o percentual de acertos de cada cômodo
const desempenhoPorComodo = Array.from(
  comodosAgrupados.values(),
).map((comodo) => {
  const percentualAcertos =
    comodo.tentativas > 0
      ? (comodo.acertos / comodo.tentativas) * 100
      : 0;

  return {
  comodoId: comodo.comodoId,
  tentativas: comodo.tentativas,
  acertos: comodo.acertos,
  erros: comodo.erros,
  percentualAcertos: Number(percentualAcertos.toFixed(2)),
  tarefasConcluidas: comodo.tarefasConcluidas.size,
};
});
  // Retornar o resumo de desempenho
  return {
    criancaId: crianca._id,
    resumo: {
      totalTentativas,
      acertos,
      erros,
      percentualAcertos: Number(percentualAcertos.toFixed(2)),
      totalEstrelas,
      tarefasConcluidas: totalTarefasConcluidas,
      ultimaInteracao,
    },

    // Resultados separados por cômodo
    desempenhoPorComodo,
  };
};
export { consultarResumoDesempenho }