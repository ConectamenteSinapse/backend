// Importando o express no usuarioRouter.js
import express from "express";
// importando o controller
import usuarioController from "../controllers/usuarioController.js";
//Criando a variavel para usar a função Router() qu e ajuda a separar e agrupar rotas
const router = express.Router();

// Rota para listar todos os usuarios:
router.get("/", usuarioController.getAllUsuarios);

//rota para um usuario em especifico:
router.get("/:id", usuarioController.getUsuarioById);

// Rota POST para cadastro de um novo usuario
router.post("/", usuarioController.postUsuario);

// Rota PUT para alterar completamente um usuario
router.put("/:id", usuarioController.putUsuarioById);

// Rota PATCH para atualizacao de somente um parte
router.patch("/:id", usuarioController.patchUsuarioById);

//rota delete
router.delete("/:id", usuarioController.deleteUsuarioById);

//Exportando o router para ser usado em outros lugares
export default router;
