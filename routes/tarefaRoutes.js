import express from "express";
import tarefaController from "../controllers/tarefaController.js";
import respostaController from "../controllers/respostaController.js";
import autentificar from "../middleware/Auth.js";

const router = express.Router();

// Rota de consulta de tarefas
router.get("/", autentificar, tarefaController.getAllTarefas);
router.get("/:id", autentificar, tarefaController.getTarefaById);

// Rota de cadastrar, atualizar e excluir tarefas

router.post("/", autentificar, tarefaController.postTarefa);
router.put("/:id", autentificar, tarefaController.putTarefaById);
router.patch("/:id", autentificar, tarefaController.patchTarefaById);
router.delete("/:id", autentificar, tarefaController.deleteTarefaById);

// rotas para listar respostas de uma tarefa pelo ID
router.get(
  "/:tarefaId/respostas",
  autentificar,
  respostaController.getRespostasByTarefaId,
);

export default router;
