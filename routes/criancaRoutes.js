import express from "express";
import criancaController from "../controllers/criancaController.js";

const router = express.Router();

//Consultar todos os perfis de Criancas
router.get("/", criancaController.getCriancas);
//Buscar perfil pelo ID da conta do usuario
router.get("/usuario/:usuarioId", criancaController.getCriancaByUsuarioId);
//Buscar perfil pelo Id do Perfil
router.get("/:id", criancaController.getCriancaById);
//Cadatsrar perfil da crianca
router.post("/", criancaController.postCrianca);
//Atualizar dados cadastrais
router.put("/:id", criancaController.putCriancaById);
//Atualizar dados cadastrais
router.patch("/:id", criancaController.patchCriancaById);

// nao sera feiro o delete de proposito ppois essa rota nao vai ser usado no jogo.

export default router;
