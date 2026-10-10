import express from "express";
import tarefaController from "../controllers/tarefaController.js";
import respostaController from "../controllers/respostaController.js";

const router = express.Router();

// Rota de consulta de tarefas
router.get("/", tarefaController.getAllTarefas);
router.get("/:id", tarefaController.getTarefaById);

// Rota de cadastrar, atualizar e excluir tarefas

router.post("/", tarefaController.postTarefa);
router.put("/:id", tarefaController.putTarefaById);
router.patch("/:id", tarefaController.patchTarefaById);
router.delete("/:id", tarefaController.deleteTarefaById);

// rotas para listar respostas de uma tarefa pelo ID
router.get("/:tarefaId/respostas", respostaController.getRespostasByTarefaId);

export default router;
