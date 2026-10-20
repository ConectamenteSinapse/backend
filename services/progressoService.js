import mongoose from "mongoose";
import HistoricoJogoModel from "../models/historicoJogoModel.js";
import CriancaModel from "../models/criancaModel.js";
import ResponsavelModel from "../models/responsavelModel.js";

// Consultar o progresso de uma criança
const consultarProgresso = async (criancaId, usuarioAutenticado) => {
  // Validar o formato do identificador
  if (!mongoose.isValidObjectId(criancaId)) {
    throw new Error("CRIANCA_ID_INVALIDO");
  }
  // Verificar se a criança existe no MongoDB
  const crianca = await CriancaModel.findOne({
    usuarioId: criancaId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }
  // Verificar quem está solicitando o progresso
  if (usuarioAutenticado.perfil === "crianca") {
    // A criança só pode consultar seu próprio progresso
    if (crianca.usuarioId.toString() !== usuarioAutenticado.id) {
      throw new Error("ACESSO_NEGADO");
    }
  } else if (usuarioAutenticado.perfil === "responsavel") {
    // Buscar o cadastro do responsável autenticado
    const responsavel = await ResponsavelModel.findOne({
      usuarioId: usuarioAutenticado.id,
    });

    // Confirmar o vínculo entre responsável e criança
    if (
      !responsavel ||
      !crianca.responsavelId ||
      crianca.responsavelId.toString() !== responsavel._id.toString()
    ) {
      throw new Error("ACESSO_NEGADO");
    }
  } else {
    // Outros perfis não têm acesso nesta versão
    throw new Error("ACESSO_NEGADO");
  }
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
