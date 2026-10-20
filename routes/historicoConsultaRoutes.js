import { Router } from "express";
import { obterHistorico } from "../controllers/historicoConsultaController.js";
import autentificar from "../middleware/Auth.js";

const router = Router();

// Consultar o histórico de tentativas de uma criança
router.get("/:criancaId/historico", autentificar, obterHistorico);

export default router;
