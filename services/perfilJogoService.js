import CriancaModel from "../models/criancaModel.js";
import PerfilJogoModel from "../models/perfilJogoModel.js";
import mongoose from "mongoose";

// Criar um personagem para a criança autenticada
const criarPersonagem = async (usuarioId, nomeAvatar, imagemAvatar) => {
  // Buscar a criança associada ao usuário autenticado
  const crianca = await CriancaModel.findOne({
    usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Validar os dados obrigatórios do personagem
  if (
    typeof nomeAvatar !== "string" ||
    !nomeAvatar.trim() ||
    typeof imagemAvatar !== "string" ||
    !imagemAvatar.trim()
  ) {
    throw new Error("DADOS_INVALIDOS");
  }

  // Cadastrar um novo personagem
  const personagem = await PerfilJogoModel.create({
    criancaId: crianca._id,
    nomeAvatar: nomeAvatar.trim(),
    imagemAvatar: imagemAvatar.trim(),
  });

  return personagem;
};

// Listar os personagens ativos da criança autenticada
const listarPersonagens = async (usuarioId) => {
  // Buscar o cadastro da criança
  const crianca = await CriancaModel.findOne({
    usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Buscar somente os personagens ativos dessa criança
  const personagens = await PerfilJogoModel.find({
    criancaId: crianca._id,
    status: "ativo",
  })
    .sort({ criadoEm: -1 })
    .select("_id nomeAvatar imagemAvatar estrelasTotal nivelAtual")
    .lean();

  return personagens;
};
// Buscar um personagem específico da criança autenticada
const buscarPersonagemPorId = async (usuarioId, perfilJogoId) => {
  // Verificar se o identificador do personagem é válido
  if (!mongoose.isValidObjectId(perfilJogoId)) {
    throw new Error("ID_INVALIDO");
  }

  // Buscar a criança vinculada ao usuário autenticado
  const crianca = await CriancaModel.findOne({
    usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Consultar somente um personagem ativo dessa criança
  const personagem = await PerfilJogoModel.findOne({
    _id: perfilJogoId,
    criancaId: crianca._id,
    status: "ativo",
  })
    .select("_id nomeAvatar imagemAvatar estrelasTotal nivelAtual criadoEm")
    .lean();

  if (!personagem) {
    throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
  }

  return personagem;
};

const atualizarPersonagem = async (
  usuarioId,
  perfilJogoId,
  dadosAtualizacao,
) => {
  // Validar o identificador do personagem
  if (!mongoose.isValidObjectId(perfilJogoId)) {
    throw new Error("ID_INVALIDO");
  }

  // Localizar a criança autenticada
  const crianca = await CriancaModel.findOne({ usuarioId });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Buscar somente um personagem ativo dessa criança
  const personagem = await PerfilJogoModel.findOne({
    _id: perfilJogoId,
    criancaId: crianca._id,
    status: "ativo",
  });

  if (!personagem) {
    throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
  }

  // Permitir alterar somente nome e imagem do avatar
  const { nomeAvatar, imagemAvatar } = dadosAtualizacao ?? {};

  if (nomeAvatar === undefined && imagemAvatar === undefined) {
    throw new Error("DADOS_INVALIDOS");
  }

  if (nomeAvatar !== undefined) {
    if (typeof nomeAvatar !== "string" || !nomeAvatar.trim()) {
      throw new Error("DADOS_INVALIDOS");
    }

    personagem.nomeAvatar = nomeAvatar.trim();
  }

  if (imagemAvatar !== undefined) {
    if (typeof imagemAvatar !== "string" || !imagemAvatar.trim()) {
      throw new Error("DADOS_INVALIDOS");
    }

    personagem.imagemAvatar = imagemAvatar.trim();
  }

  // Persistir as alterações no MongoDB
  await personagem.save();

  return personagem;
};
const arquivarPersonagem = async (usuarioId, perfilJogoId) => {
  // Validar o identificador do personagem
  if (!mongoose.isValidObjectId(perfilJogoId)) {
    throw new Error("ID_INVALIDO");
  }

  // Identificar a criança autenticada
  const crianca = await CriancaModel.findOne({
    usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Arquivar somente se o personagem ainda estiver ativo
  const personagem = await PerfilJogoModel.findOneAndUpdate(
    {
      _id: perfilJogoId,
      criancaId: crianca._id,
      status: "ativo",
    },
    {
      $set: { status: "arquivado" },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!personagem) {
    throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
  }

  return personagem;
};

export {
  criarPersonagem,
  listarPersonagens,
  buscarPersonagemPorId,
  atualizarPersonagem,
  arquivarPersonagem,
};
