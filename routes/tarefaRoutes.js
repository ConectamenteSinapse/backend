import expresss from 'express'
import tarefaController from "../controllers/tarefaController.js"

const router = express.router()

router.get("/", tarefaController.getAlltarefas)
router.get("/:id", tarefaController.getTarefaById)
router.post("/", tarefaController.postTarefa)
router.put("/:id", tarefaController.putTarefaById)
router.patch("/:id", tarefaController.patchTarefaById)
router.delete("/:id", tarefaController.deleteTarefaById)

export default router