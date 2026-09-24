import express from "express";

import respostaController from "../controllers/respostaController.js";

const router = express.Router();
// Rota para listar todas as tarefas
router.get("/", respostaController.getAllRespostas);

// Rota para buscar uma resposta pelo ID
router.get("/:respostaId", respostaController.getRespostaById);

export default router;
