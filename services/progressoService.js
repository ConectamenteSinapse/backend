import HistoricoJogoModel from "../models/historicoJogoModel.js";
import { validarAcessoCrianca } from "./validarAcessoCriancaService.js";
import { buscarJogoSalvoPorId } from "./jogoSalvoService.js";

// Consultar o progresso de uma criança
const consultarProgresso = async (criancaId, usuarioAutenticado) => {
  // Validar a existência da criança e a autorização do usuário
  const crianca = await validarAcessoCrianca(criancaId, usuarioAutenticado);
  // Buscar todas as interações da criança no MongoDB
  const historicos = await HistoricoJogoModel.find({
    // A API recebe o usuarioId; o histórico referencia o perfil Crianca.
    criancaId: crianca._id,
  })
    .sort({ dataHora: -1 })
    .lean();

  // Agrupar os resultados por tarefa e dificuldade
  const tarefasAgrupadas = new Map();

  for (const historico of historicos) {
    const chave = `${historico.tarefaId}:${historico.dificuldade}`;

    if (!tarefasAgrupadas.has(chave)) {
      tarefasAgrupadas.set(chave, {
        tarefaId: historico.tarefaId,
        dificuldade: historico.dificuldade,
        concluida: false,
        tentativas: 0,
        acertos: 0,
        erros: 0,
        ultimaInteracao: historico.dataHora,
      });
    }

    const tarefa = tarefasAgrupadas.get(chave);

    tarefa.tentativas += 1;

    if (historico.acertou) {
      tarefa.acertos += 1;
      tarefa.concluida = true;
    } else {
      tarefa.erros += 1;
    }
  }

  const tarefas = Array.from(tarefasAgrupadas.values());

  return {
    criancaId,
    resumo: {
      totalTentativas: historicos.length,
      acertos: historicos.filter((h) => h.acertou).length,
      erros: historicos.filter((h) => !h.acertou).length,
      tarefasConcluidas: tarefas.filter((t) => t.concluida).length,
      ultimaInteracao: historicos[0]?.dataHora ?? null,
    },
    tarefas,
  };
};

// Consultar o progresso de uma partida específica
const consultarProgressoJogo = async (usuarioId, jogoSalvoId) => {
  // Verificar se a partida pertence à criança autenticada
  const jogoSalvo = await buscarJogoSalvoPorId(usuarioId, jogoSalvoId);

  // Buscar somente as tentativas desta partida
  const historicos = await HistoricoJogoModel.find({
    jogoSalvoId: jogoSalvo._id,
  })
    .sort({ dataHora: -1 })
    .lean();

  // Agrupar as tentativas por tarefa e dificuldade
  const tarefasAgrupadas = new Map();

  for (const historico of historicos) {
    const chave = `${historico.tarefaId}:${historico.dificuldade}`;

    if (!tarefasAgrupadas.has(chave)) {
      tarefasAgrupadas.set(chave, {
        tarefaId: historico.tarefaId,
        dificuldade: historico.dificuldade,
        concluida: false,
        tentativas: 0,
        acertos: 0,
        erros: 0,
        ultimaInteracao: historico.dataHora,
      });
    }

    const tarefa = tarefasAgrupadas.get(chave);

    tarefa.tentativas += 1;

    if (historico.acertou) {
      tarefa.acertos += 1;
      tarefa.concluida = true;
    } else {
      tarefa.erros += 1;
    }
  }

  const tarefas = Array.from(tarefasAgrupadas.values());

  return {
    jogoSalvoId: jogoSalvo._id,
    estrelasTotal: jogoSalvo.estrelasTotal,
    resumo: {
      totalTentativas: historicos.length,
      acertos: historicos.filter((h) => h.acertou).length,
      erros: historicos.filter((h) => !h.acertou).length,
      tarefasConcluidas: tarefas.filter((t) => t.concluida).length,
      ultimaInteracao: historicos[0]?.dataHora ?? null,
    },
    tarefas,
  };
};
// Consultar a evolução diária do progresso da criança
const consultarEvolucaoDiaria = async (criancaId, usuarioAutenticado) => {
  // Validar a criança e a autorização do usuário
  const crianca = await validarAcessoCrianca(criancaId, usuarioAutenticado);

  // Consultar as tentativas registradas no MongoDB
  const historicos = await HistoricoJogoModel.find({
    criancaId: crianca._id,
  })
    .sort({ dataHora: 1 })
    .lean();
  // Agrupar as tentativas por dia
  const diasAgrupados = new Map();

  for (const historico of historicos) {
    // Converter a data para o horário de São Paulo
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(historico.dataHora);

    const ano = partes.find((parte) => parte.type === "year").value;
    const mes = partes.find((parte) => parte.type === "month").value;
    const dia = partes.find((parte) => parte.type === "day").value;

    const data = `${ano}-${mes}-${dia}`;

    // Criar o agrupamento caso o dia ainda não exista
    if (!diasAgrupados.has(data)) {
      diasAgrupados.set(data, {
        data,
        totalTentativas: 0,
        acertos: 0,
        erros: 0,
      });
    }

    // Recuperar os dados acumulados daquele dia
    const dadosDia = diasAgrupados.get(data);

    // Contabilizar a tentativa
    dadosDia.totalTentativas += 1;

    if (historico.acertou) {
      dadosDia.acertos += 1;
    } else {
      dadosDia.erros += 1;
    }
  }
  // Calcular o percentual de acertos de cada dia
  const evolucao = Array.from(diasAgrupados.values()).map((dia) => {
    const percentualAcertos = (dia.acertos / dia.totalTentativas) * 100;

    return {
      ...dia,
      percentualAcertos: Number(percentualAcertos.toFixed(2)),
    };
  });

  // Organizar os resultados por data
  evolucao.sort((a, b) => a.data.localeCompare(b.data));

  // Retornar a evolução diária da criança
  return {
    criancaId,
    evolucao,
  };
};

export { consultarProgresso, consultarProgressoJogo, consultarEvolucaoDiaria };
