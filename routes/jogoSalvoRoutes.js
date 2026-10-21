import express from "express";

import {
  cadastrarJogoSalvo,
  obterJogosSalvos,
  obterJogoSalvoPorId,
  editarJogoSalvo,
  removerJogoSalvo,
} from "../controllers/jogoSalvoController.js";
import { obterProgressoJogo } from "../controllers/progressoController.js";
import { obterHistoricoJogo } from "../controllers/historicoConsultaController.js";

import autentificar from "../middleware/Auth.js";
import autorizarPerfil from "../middleware/autorizarPerfil.js";

const router = express.Router();

// Proteger todas as rotas com JWT e perfil criança
router.use(autentificar);
router.use(autorizarPerfil("crianca"));

// Criar uma nova partida
router.post("/", cadastrarJogoSalvo);

// Listar os jogos salvos
router.get("/", obterJogosSalvos);

// Consultar uma partida pelo ID
router.get("/:id", obterJogoSalvoPorId);

// Consultar o progresso de uma partida específica
router.get("/:id/progresso", obterProgressoJogo);

// Consultar o histórico de uma partida específica
router.get("/:id/historico", obterHistoricoJogo);

// Atualizar uma partida
router.patch("/:id", editarJogoSalvo);

// Excluir uma partida
router.delete("/:id", removerJogoSalvo);

export default router;
