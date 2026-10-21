import express from "express";

import {
  cadastrarPersonagem,
  obterPersonagens,
  obterPersonagemPorId,
  editarPersonagem,
  excluirPersonagem,
} from "../controllers/perfilJogoController.js";

import autentificar from "../middleware/Auth.js";
import autorizarPerfil from "../middleware/autorizarPerfil.js";

const router = express.Router();

// Todas as rotas exigem JWT e perfil de criança
router.use(autentificar);
router.use(autorizarPerfil("crianca"));

// Criar personagem
router.post("/", cadastrarPersonagem);

// Listar personagens ativos
router.get("/", obterPersonagens);

// Buscar personagem pelo ID
router.get("/:id", obterPersonagemPorId);

// Atualizar nome ou imagem do personagem
router.patch("/:id", editarPersonagem);

// Arquivar personagem (soft delete)
router.delete("/:id", excluirPersonagem);

export default router;
