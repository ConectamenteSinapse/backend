// Importando o express no usuarioRouter.js
import express from "express";
// importando o controller
import usuarioController from "../controllers/usuarioController.js";
//importando o autentificar do Auth.js
import autentificar from "../middleware/Auth.js";
//Criando a variavel para usar a função Router() qu e ajuda a separar e agrupar rotas
const router = express.Router();

//rota publica
//Rota de login
router.post("/auth", usuarioController.loginUsuario);
// Rota POST para cadastro de um novo usuario
router.post("/", usuarioController.postUsuario);

//Rotas protegidas
// Rota para listar todos os usuarios:
router.get("/", autentificar, usuarioController.getAllUsuarios);

//rota para um usuario em especifico:
router.get("/:id", autentificar, usuarioController.getUsuarioById);

// Rota PUT para alterar completamente um usuario
router.put("/:id", autentificar, usuarioController.putUsuarioById);

// Rota PATCH para atualizacao de somente um parte
router.patch("/:id", autentificar, usuarioController.patchUsuarioById);

//rota delete
router.delete("/:id", autentificar, usuarioController.deleteUsuarioById);

//Exportando o router para ser usado em outros lugares
export default router;
