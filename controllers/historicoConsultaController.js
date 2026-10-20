import { consultarHistorico } from "../services/historicoConsultaService.js";

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
      return res.status(400).json({
        mensagem: "ID da criança inválido",
      });
    }

    // Criança não encontrada
    if (error.message === "CRIANCA_NAO_ENCONTRADA") {
      return res.status(404).json({
        mensagem: "Criança não encontrada",
      });
    }

    // Usuário sem autorização
    if (error.message === "ACESSO_NEGADO") {
      return res.status(403).json({
        mensagem: "Você não tem permissão para consultar este histórico",
      });
    }

    // Erro inesperado
    console.error("Erro ao consultar histórico:", error);

    return res.status(500).json({
      mensagem: "Erro interno ao consultar histórico",
    });
  }
};

export { obterHistorico };
