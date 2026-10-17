// Importando o express no usuarioRouter.js
import express from "express";
// importando o controller
import responsavelController from "../controllers/responsavelController.js";
//Criando a variavel para usar a função Router() qu e ajuda a separar e agrupar rotas
const router = express.Router();

// Listar responsáveis
router.get("/", responsavelController.getResponsaveis);

// Buscar responsável pelo ID do usuário
router.get(
  "/usuario/:usuarioId",
  responsavelController.getResponsavelByUsuarioId,
);

// Listar crianças vinculadas ao responsável
router.get(
  "/:responsavelId/criancas",
  responsavelController.getCriancasByResponsavelId,
);

// Buscar responsável pelo ID do perfil
router.get("/:id", responsavelController.getResponsavelById);

// Cadastrar perfil responsável
router.post("/", responsavelController.postResponsavel);

//Vincular a crianca
router.patch(
  "/criancas/:criancaId/responsavel",
  responsavelController.vincularCrianca,
);
export default router;
