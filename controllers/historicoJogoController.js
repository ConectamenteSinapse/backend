import historicoJogoService from "../services/historicoJogoService.js";

// Tratamento de erros
const tratarErro = (error, res) => {
  if (error.message === "ID_INVALIDO") {
    return res.status(400).json({ mensagem: "ID inválido" });
  }

  if (
    error.message === "TAREFA_NAO_ENCONTRADA" ||
    error.message === "CRIANCA_NAO_ENCONTRADA" ||
    error.message === "PERFIL_JOGO_NAO_ENCONTRADO"
  ) {
    return res.status(404).json({ mensagem: "Registro não encontrado" });
  }

  if (error.message === "PERMISSAO_INATIVA") {
    return res.status(403).json({ mensagem: "Permissão para jogar inativa" });
  }

  if (error.message === "TAREFA_INATIVA") {
    return res.status(403).json({ mensagem: "Tarefa indisponível" });
  }

  if (error.message === "RESPOSTA_INVALIDA") {
    return res
      .status(400)
      .json({ mensagem: "Resposta inválida para a tarefa" });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ mensagem: "Dados inválidos" });
  }
  if (error.message === "DIFICULDADE_INVALIDA") {
    return res.status(400).json({
      mensagem: "Dificuldade inválida",
    });
  }
  if (error.message === "TAREFA_FORA_DA_ORDEM") {
    return res.status(403).json({
      mensagem: "Vamos tentar outra atividade primeiro!",
      codigo: "TAREFA_FORA_DA_ORDEM",
    });
  }
  if (error.message === "DIFICULDADE_BLOQUEADA") {
    return res.status(403).json({
      mensagem: "Conclua a dificuldade anterior para continuar!",
      codigo: "DIFICULDADE_BLOQUEADA",
    });
  }
  if (error.message === "COMODO_BLOQUEADO") {
    return res.status(403).json({
      mensagem: "Conclua o cômodo anterior para continuar!",
      codigo: "COMODO_BLOQUEADO",
    });
  }

  if (error.message === "COMODO_INDISPONIVEL") {
    return res.status(403).json({
      mensagem: "Cômodo indisponível no momento",
      codigo: "COMODO_INDISPONIVEL",
    });
  }
  console.error(error);
  return res.status(500).json({ mensagem: "Erro interno do servidor" });
};

// Registrar resposta escolhida pela criança
const registrarResposta = async (req, res) => {
  try {
    // Identificar o usuário autenticado pelo JWT
    const usuarioId = req.usuario.id;

    // Verificar se o Body foi enviado
    if (!req.body) {
      return res.status(400).json({
        mensagem: "Body da requisição obrigatório",
      });
    }

    // Obter os dados enviados pelo frontend
    const tarefaId = req.body.tarefaId;
    const respostaEscolhidaId = req.body.respostaEscolhidaId;
    const dificuldade = req.body.dificuldade;

    // Verificar se os campos foram informados
    if (!tarefaId || !respostaEscolhidaId || !dificuldade) {
      return res.status(400).json({
        mensagem: "Tarefa, resposta e dificuldade são obrigatórias",
      });
    }
    const dificuldadesValidas = ["facil", "medio", "dificil"];

    if (!dificuldadesValidas.includes(dificuldade)) {
      return res.status(400).json({
        mensagem: "Dificuldade inválida",
      });
    }

    // Registrar a tentativa pelo Service
    const historico = await historicoJogoService.registrarResposta(
      usuarioId,
      tarefaId,
      respostaEscolhidaId,
      dificuldade,
    );

    // Retornar somente os dados necessários ao jogo
    return res.status(201).json({
      acertou: historico.acertou,
      tentativa: historico.tentativa,
      pontuacaoGanha: historico.pontuacaoGanha,
      dificuldade: historico.dificuldade,
    });
  } catch (error) {
    return tratarErro(error, res);
  }
};

export default {
  registrarResposta,
};
