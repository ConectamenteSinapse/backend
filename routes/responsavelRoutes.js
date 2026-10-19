// Importando o express no usuarioRouter.js
import express from "express";
// importando o controller
import responsavelController from "../controllers/responsavelController.js";
import autentificar from "../middleware/Auth.js";
import autorizarPerfil from "../middleware/autorizarPerfil.js";
//Criando a variavel para usar a função Router() qu e ajuda a separar e agrupar rotas
const router = express.Router();
// Cadastrar perfil responsável
router.post(
  "/",
  autentificar,
  autorizarPerfil("responsavel"),
  responsavelController.postResponsavel,
);
// visualizar as criancas  vinculadas a conta do responsavvel
// Listar minhas crianças
router.get(
  "/minhas-criancas",
  autentificar,
  autorizarPerfil("responsavel"),
  responsavelController.getMinhasCriancas,
);
router.post(
  "/vincular-crianca",
  autentificar,
  autorizarPerfil("responsavel"),
  responsavelController.vincularCrianca,
);
// Alterar a permissão de jogo de uma criança vinculada
router.patch(
  "/minhas-criancas/:criancaId/permissao",
  autentificar,
  autorizarPerfil("responsavel"),
  responsavelController.alterarPermissaoCrianca,
);
// rotas temporarelmente  bloquadas
// // Listar responsáveis
// router.get("/", responsavelController.getResponsaveis);

// // Buscar responsável pelo ID do usuário
// router.get(
//   "/usuario/:usuarioId",
//   responsavelController.getResponsavelByUsuarioId,
// );

// // Listar crianças vinculadas ao responsável
// router.get(
//   "/:responsavelId/criancas",
//   responsavelController.getCriancasByResponsavelId,
// );

// // Buscar responsável pelo ID do perfil
// router.get("/:id", responsavelController.getResponsavelById);

export default router;
