import { consultarProgresso } from "../services/progressoService.js";

// Consultar o progresso da criança
const obterProgresso = async (req, res) => {
  try {
    const { criancaId } = req.params;

    // O middleware JWT disponibiliza o usuário autenticado
    const progresso = await consultarProgresso(criancaId, req.usuario);

    return res.status(200).json(progresso);
  } catch (error) {
    if (error.message === "CRIANCA_ID_INVALIDO") {
      return res.status(400).json({
        mensagem: "ID da criança inválido",
      });
    }

    if (error.message === "CRIANCA_NAO_ENCONTRADA") {
      return res.status(404).json({
        mensagem: "Criança não encontrada",
      });
    }

    if (error.message === "ACESSO_NEGADO") {
      return res.status(403).json({
        mensagem: "Você não tem permissão para consultar este progresso",
      });
    }

    console.error("Erro ao consultar progresso:", error);

    return res.status(500).json({
      mensagem: "Erro interno ao consultar progresso",
    });
  }
};

export { obterProgresso };
