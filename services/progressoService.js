import HistoricoJogoModel from "../models/historicoJogoModel.js";
import { validarAcessoCrianca } from "./validarAcessoCriancaService.js";

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

export { consultarProgresso };
