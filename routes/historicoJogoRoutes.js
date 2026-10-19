import express from "express";
import historicoJogoController from "../controllers/historicoJogoController.js";
import autentificar from "../middleware/Auth.js";
import autorizarPerfil from "../middleware/autorizarPerfil.js";

const router = express.Router();

// Registrar a resposta escolhida pela criança autenticada
router.post(
  "/responder",
  autentificar,
  autorizarPerfil("crianca"),
  historicoJogoController.registrarResposta,
);

export default router;
