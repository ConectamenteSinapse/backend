import { Router } from "express";
import { obterProgresso } from "../controllers/progressoController.js";
import autentificar from "../middleware/Auth.js";

const router = Router();

// Consultar o progresso de uma criança
router.get("/:criancaId", autentificar, obterProgresso);

export default router;
