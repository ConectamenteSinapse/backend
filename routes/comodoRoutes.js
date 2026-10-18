import express from "express";
import comodoController from "../controllers/comodoController.js";
const router = express.Router();
import autentificar from "../middleware/Auth.js";

// Rota  para  listar todos os comodos
router.get("/", autentificar, comodoController.getAllComodos);
// Rota  para  listar tarefas do comodo
router.get(
  "/:comodoId/tarefas",
  autentificar,
  comodoController.getTarefasByComodoId,
);
// Rota para chamar um comodo em especifico
router.get("/:id", autentificar, comodoController.getComodoById);

export default router;
