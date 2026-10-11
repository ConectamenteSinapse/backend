import express from "express";

import respostaController from "../controllers/respostaController.js";

const router = express.Router();
// Rota para listar todas as tarefas
router.get("/", respostaController.getAllRespostas);

// Rota para buscar uma resposta pelo ID
router.get("/:respostaId", respostaController.getRespostaById);

//Rota para cadastrar uma resposta
router.post("/", respostaController.postResposta);

// Rota para atualizar complentamente uma resposta
router.put("/:respostaId", respostaController.putRespostaById);

// Rota para atualizar parcialmente uma resposta
router.patch("/:respostaId", respostaController.patchRespostaById);

// Rota para excluir resposta
router.delete("/:respostaId", respostaController.deleteRespostaById);

export default router;
