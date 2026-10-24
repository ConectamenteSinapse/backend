import express from "express";
import criancaController from "../controllers/criancaController.js";
import autentificar from "../middleware/Auth.js";
import autorizarPerfil from "../middleware/autorizarPerfil.js";
import { obterResumoDesempenho } from "../controllers/resumoDesempenhoController.js";

const router = express.Router();

// Consultar o próprio perfil da criança
router.get(
  "/meu-perfil",
  autentificar,
  autorizarPerfil("crianca"),
  criancaController.getMeuPerfil,
);
//Cadatsrar perfil da crianca
router.post(
  "/",
  autentificar,
  autorizarPerfil("crianca"),
  criancaController.postCrianca,
);
router.get(
  "/:criancaId/resumo-desempenho",
  autentificar,
  obterResumoDesempenho,
);
//Rotas desatividadas temporarialmente
//Consultar todos os perfis de Criancas- reservada para o admin futuramente
//router.get("/", autentificar, criancaController.getCriancas);
//Buscar perfil pelo ID da conta do usuario
// router.get("/usuario/:usuarioId",autentificar,criancaController.getCriancaByUsuarioId,);
// //Buscar perfil pelo Id do Perfil
// router.get("/:id", autentificar, criancaController.getCriancaById);
// //Atualizar dados cadastrais
// router.put("/:id", autentificar, criancaController.putCriancaById);
// //Atualizar dados cadastrais
// router.patch("/:id", autentificar, criancaController.patchCriancaById);

// nao sera feiro o delete de proposito ppois essa rota nao vai ser usado no jogo.

export default router;
