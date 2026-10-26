import {
  consultarHistorico,
  consultarHistoricoJogo,
} from "../services/historicoConsultaService.js";

// Consultar o histórico de tentativas da criança
const obterHistorico = async (req, res) => {
  try {
    // Identificador da criança recebido pela URL
    const { criancaId } = req.params;
    // Consultar histórico com o usuário autenticado
    const historico = await consultarHistorico(criancaId, req.usuario);
    return res.status(200).json(historico);
  } catch (error) {
    // Identificador inválido
    if (error.message === "CRIANCA_ID_INVALIDO") {
      return res
        .status(400)
        .json({ erro: true, mensagem: "ID da criança inválido" });
    }
    // Criança não encontrada
    if (error.message === "CRIANCA_NAO_ENCONTRADA") {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Criança não encontrada" });
    }
    // Usuário sem autorização
    if (error.message === "ACESSO_NEGADO") {
      return res.status(403).json({
        erro: true,
        mensagem: "Você não tem permissão para consultar este histórico",
      });
    }
    // Erro inesperado
    console.error("Erro ao consultar histórico:", error);
    return res
      .status(500)
      .json({ erro: true, mensagem: "Erro interno ao consultar histórico" });
  }
};

// Consultar o histórico de uma partida específica
const obterHistoricoJogo = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;
    const historico = await consultarHistoricoJogo(usuarioId, id);
    return res.status(200).json(historico);
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
    console.error("Erro ao consultar histórico da partida:", error);
    return res
      .status(500)
      .json({ erro: true, mensagem: "Erro interno do servidor" });
  }
};

export { obterHistorico, obterHistoricoJogo };
