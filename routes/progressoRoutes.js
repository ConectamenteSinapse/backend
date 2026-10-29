import { Router } from "express";
import {
  obterProgresso,
  obterEvolucaoDiaria,
} from "../controllers/progressoController.js";
import autentificar from "../middleware/Auth.js";

const router = Router();

// Consultar o progresso de uma criança
router.get("/:criancaId", autentificar, obterProgresso);

// Consultar evolução diária do progresso da criança
router.get("/:criancaId/evolucao-diaria", autentificar, obterEvolucaoDiaria);

export default router;
