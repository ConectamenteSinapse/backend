import historicoJogoService from "../services/historicoJogoService.js";

// Tratamento de erros
const tratarErro = (error, res) => {
  if (error.message === "ID_INVALIDO") {
    return res.status(400).json({ erro: true, mensagem: "ID inválido" });
  }

  if (
    error.message === "TAREFA_NAO_ENCONTRADA" ||
    error.message === "CRIANCA_NAO_ENCONTRADA" ||
    error.message === "PERFIL_JOGO_NAO_ENCONTRADO" ||
    error.message === "JOGO_SALVO_NAO_ENCONTRADO"
  ) {
    return res
      .status(404)
      .json({ erro: true, mensagem: "Registro não encontrado" });
  }
  if (error.message === "PERMISSAO_INATIVA") {
    return res
      .status(403)
      .json({ erro: true, mensagem: "Permissão para jogar inativa" });
  }
  if (error.message === "TAREFA_INATIVA") {
    return res
      .status(403)
      .json({ erro: true, mensagem: "Tarefa indisponível" });
  }
  if (error.message === "RESPOSTA_INVALIDA") {
    return res
      .status(400)
      .json({ erro: true, mensagem: "Resposta inválida para a tarefa" });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ erro: true, mensagem: "Dados inválidos" });
  }
  if (error.message === "DIFICULDADE_INVALIDA") {
    return res
      .status(400)
      .json({ erro: true, mensagem: "Dificuldade inválida" });
  }
  if (error.message === "TAREFA_FORA_DA_ORDEM") {
    return res.status(403).json({
      erro: true,
      mensagem: "Vamos tentar outra atividade primeiro!",
      codigo: "TAREFA_FORA_DA_ORDEM",
    });
  }
  if (error.message === "DIFICULDADE_BLOQUEADA") {
    return res.status(403).json({
      erro: true,
      mensagem: "Conclua a dificuldade anterior para continuar!",
      codigo: "DIFICULDADE_BLOQUEADA",
    });
  }
  if (error.message === "COMODO_BLOQUEADO") {
    return res.status(403).json({
      erro: true,
      mensagem: "Conclua o cômodo anterior para continuar!",
      codigo: "COMODO_BLOQUEADO",
    });
  }
  if (error.message === "COMODO_INDISPONIVEL") {
    return res.status(403).json({
      erro: true,
      mensagem: "Cômodo indisponível no momento",
      codigo: "COMODO_INDISPONIVEL",
    });
  }
  if (
    error.message === "SESSAO_INVALIDA" ||
    error.message === "SESSAO_INATIVA" ||
    error.message === "SESSAO_EXPIRADA" ||
    error.message === "SESSAO_JA_ATIVA" ||
    error.message === "CONFLITO_SESSAO"
  ) {
    return res.status(409).json({
      erro: true,
      mensagem: "A sessão de jogo não está disponível",
      codigo: error.message,
    });
  }

  if (error.message === "LIMITE_TEMPO_ATINGIDO") {
    return res.status(403).json({
      erro: true,
      mensagem: "O limite diário de jogo foi atingido",
      codigo: "LIMITE_TEMPO_ATINGIDO",
    });
  }
  console.error(error);
  return res
    .status(500)
    .json({ erro: true, mensagem: "Erro interno do servidor" });
};

// Registrar resposta escolhida pela criança
const registrarResposta = async (req, res) => {
  try {
    // Identificar o usuário autenticado pelo JWT
    const usuarioId = req.usuario.id;
    // Verificar se o Body foi enviado
    if (!req.body) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Body da requisição obrigatório" });
    }
    // Obter os dados enviados pelo frontend
    const perfilJogoId = req.body.perfilJogoId;
    const jogoSalvoId = req.body.jogoSalvoId;
    const tarefaId = req.body.tarefaId;
    const respostaEscolhidaId = req.body.respostaEscolhidaId;
    const dificuldade = req.body.dificuldade;
    const sessaoId = req.body.sessaoId;
    // Verificar se os campos foram informados
    if (
      !perfilJogoId ||
      !jogoSalvoId ||
      !tarefaId ||
      !respostaEscolhidaId ||
      !dificuldade
    ) {
      return res.status(400).json({
        erro: true,
        mensagem:
          "Personagem, jogo salvo, tarefa, resposta e dificuldade são obrigatórios",
      });
    }
    const dificuldadesValidas = ["facil", "medio", "dificil"];
    if (!dificuldadesValidas.includes(dificuldade)) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Dificuldade inválida" });
    }
    // Registrar a tentativa pelo Service
    const historico = await historicoJogoService.registrarResposta(
      usuarioId,
      perfilJogoId,
      jogoSalvoId,
      tarefaId,
      respostaEscolhidaId,
      dificuldade,
      sessaoId,
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
