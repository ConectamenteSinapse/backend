import ResponsavelModel from "../models/responsavelModel.js";
import UsuarioModel from "../models/usuarioModel.js";
import CriancaModel from "../models/criancaModel.js";
import mongoose from "mongoose";

// Validar o formato do Id

const validarId = (id) => {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new Error("ID_INVALIDO");
  }
};
//lista responsaveis
const getResponsaveis = async () => {
  return await ResponsavelModel.find();
};
//Buscar o responsavel pelo Id do perfil responsavel
const getResponsavelById = async (id) => {
  validarId(id);
  return await ResponsavelModel.findById(id);
};
//Buscar o responsavel pelo Id do usuarioId
const getResponsavelByUsuarioId = async (usuarioId) => {
  validarId(usuarioId);
  return await ResponsavelModel.findOne({ usuarioId });
};

// cadastrar perfil responsavel
const postResponsavel = async (dadosResponsavel) => {
  validarId(dadosResponsavel?.usuarioId);
  const usuario = await UsuarioModel.findById(dadosResponsavel.usuarioId);

  if (!usuario) {
    throw new Error("USUARIO_NAO_ENCONTRADO");
  }
  if (usuario.perfil !== "responsavel") {
    throw new Error("PERFIL_USUARIO_INVALIDO");
  }
  const responsavelExistente = await ResponsavelModel.findOne({
    usuarioId: usuario._id,
  });
  if (responsavelExistente) {
    throw new Error("PERFIL_RESPONSAVEL_EXISTENTE");
  }
  return await ResponsavelModel.create({
    usuarioId: usuario._id,
  });
};
// Listar crianças vinculadas ao responsável
const getCriancasByResponsavelId = async (responsavelId) => {
  validarId(responsavelId);

  const responsavel = await ResponsavelModel.findById(responsavelId);

  if (!responsavel) {
    throw new Error("RESPONSAVEL_NAO_ENCONTRADO");
  }

  return await CriancaModel.find({ responsavelId });
};

// vincular uma crianca a um responsavel
const vincularCrianca = async (responsavelId, criancaId) => {
  // validando dos resposnavelId e criancaId
  validarId(responsavelId);
  validarId(criancaId);
  // Verificando se o responsavel existe
  const responsavel = await ResponsavelModel.findById(responsavelId);
  if (!responsavel) {
    throw new Error("RESPONSAVEL_NAO_ENCONTRADO");
  }

  // Verificar se a criança existe
  const crianca = await CriancaModel.findById(criancaId);
  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }
  //  Verificar se já possui responsável
  if (crianca.responsavelId) {
    throw new Error("CRIANCA_JA_VINCULADA");
  }
  // Atualizar o vinculo
  return await CriancaModel.findByIdAndUpdate(
    criancaId,
    { responsavelId: responsavelId },
    { new: true, runValidators: true },
  );
};
export default {
  getResponsaveis,
  getResponsavelById,
  getResponsavelByUsuarioId,
  postResponsavel,
  getCriancasByResponsavelId,
  vincularCrianca,
};
