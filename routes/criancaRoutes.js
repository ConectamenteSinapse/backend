import express from "express";
import criancaController from "../controllers/criancaController.js";
import autentificar from "../middleware/Auth.js";

const router = express.Router();

//Consultar todos os perfis de Criancas
router.get("/", autentificar, criancaController.getCriancas);
//Buscar perfil pelo ID da conta do usuario
router.get(
  "/usuario/:usuarioId",
  autentificar,
  criancaController.getCriancaByUsuarioId,
);
//Buscar perfil pelo Id do Perfil
router.get("/:id", autentificar, criancaController.getCriancaById);
//Cadatsrar perfil da crianca
router.post("/", autentificar, criancaController.postCrianca);
//Atualizar dados cadastrais
router.put("/:id", autentificar, criancaController.putCriancaById);
//Atualizar dados cadastrais
router.patch("/:id", autentificar, criancaController.patchCriancaById);

// nao sera feiro o delete de proposito ppois essa rota nao vai ser usado no jogo.

export default router;
