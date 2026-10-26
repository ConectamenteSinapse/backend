import {
  consultarProgresso,
  consultarProgressoJogo,
} from "../services/progressoService.js";

// Consultar o progresso da criança
const obterProgresso = async (req, res) => {
  try {
    const { criancaId } = req.params;
    // O middleware JWT disponibiliza o usuário autenticado
    const progresso = await consultarProgresso(criancaId, req.usuario);
    return res.status(200).json(progresso);
  } catch (error) {
    if (error.message === "CRIANCA_ID_INVALIDO") {
      return res
        .status(400)
        .json({ erro: true, mensagem: "ID da criança inválido" });
    }
    if (error.message === "CRIANCA_NAO_ENCONTRADA") {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Criança não encontrada" });
    }
    if (error.message === "ACESSO_NEGADO") {
      return res.status(403).json({
        erro: true,
        mensagem: "Você não tem permissão para consultar este progresso",
      });
    }
    console.error("Erro ao consultar progresso:", error);
    return res
      .status(500)
      .json({ erro: true, mensagem: "Erro interno ao consultar progresso" });
  }
};

// Consultar o progresso de uma partida específica
const obterProgressoJogo = async (req, res) => {
  try {
    // Identificar a criança autenticada
    const usuarioId = req.usuario.id;
    // Receber o identificador da partida pela URL
    const { id } = req.params;
    // Consultar o progresso no Service
    const progresso = await consultarProgressoJogo(usuarioId, id);
    return res.status(200).json(progresso);
  } catch (error) {
    if (
      error.message === "ID_INVALIDO" ||
      error.name === "CastError" ||
      error.name === "ValidationError"
    ) {
      return res.status(400).json({ erro: true, mensagem: "Dados inválidos" });
    }
    if (
      error.message === "CRIANCA_NAO_ENCONTRADA" ||
      error.message === "JOGO_SALVO_NAO_ENCONTRADO"
    ) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Registro não encontrado" });
    }
    console.error("Erro ao consultar progresso da partida:", error);
    return res
      .status(500)
      .json({ erro: true, mensagem: "Erro interno do servidor" });
  }
};

export { obterProgresso, obterProgressoJogo };
