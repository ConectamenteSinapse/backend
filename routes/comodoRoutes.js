import express from "express"
import comodoController from "../controllers/comodoController.js"
const router  = express.Router()

// Rota  para  listar todos os comodos
router.get("/", comodoController.getAllComodos)
// Rota  para  listar tarefas do comodo
router.get("/:comodoId/tarefas", comodoController.getTarefasByComodoId)
// Rota para chamar um comodo em especifico
router.get("/:id", comodoController.getComodoById)

export default router