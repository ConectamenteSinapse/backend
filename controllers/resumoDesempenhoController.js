import { consultarResumoDesempenho } from "../services/resumoDesempenhoService.js";

// Consultar resumo de desempenho da criança
const obterResumoDesempenho = async (req, res) => {
  try {
    // Receber o ID da criança pela URL
    const { criancaId } = req.params;
    // Consultar o resumo no Service
    const resumo = await consultarResumoDesempenho(criancaId, req.usuario);
    // Retornar os indicadores
    return res.status(200).json(resumo);
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
        mensagem: "Você não tem permissão para consultar este resumo",
      });
    }
    console.error("Erro ao consultar resumo de desempenho:", error);
    return res.status(500).json({
      erro: true,
      mensagem: "Erro interno ao consultar resumo de desempenho",
    });
  }
};

export { obterResumoDesempenho };
