import express from "express";

import respostaController from "../controllers/respostaController.js";
import autentificar from "../middleware/Auth.js";

const router = express.Router();
// Rota para listar todas as tarefas
router.get("/", autentificar, respostaController.getAllRespostas);

// Rota para buscar uma resposta pelo ID
router.get("/:respostaId", autentificar, respostaController.getRespostaById);

// Rotas administrativas temporariamente desativadas
// //Rota para cadastrar uma resposta
// router.post("/", autentificar, respostaController.postResposta);

// // Rota para atualizar complentamente uma resposta
// router.put("/:respostaId", autentificar, respostaController.putRespostaById);

// // Rota para atualizar parcialmente uma resposta
// router.patch(
//   "/:respostaId",
//   autentificar,
//   respostaController.patchRespostaById,
// );

// // Rota para excluir resposta
// router.delete(
//   "/:respostaId",
//   autentificar,
//   respostaController.deleteRespostaById,
// );

export default router;
