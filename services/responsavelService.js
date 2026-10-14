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
const postResposnsavel = async (dadosResponsavel) => {
  validarId(dadosResponsavel?.usuarioId);
  const usuario = await UsuarioModel.findById(dadosResponsavel.usuarioId);

  if (!usuario) {
    throw new Error("USUARIO_NAO_ENCONTRADO");
  }
  if (usuario.perfil !== "responsavel") {
    throw new Error("PERFIL_USUARIO_INVALIDO");
  }
  const responsavelExistente = await ResponsavelModel.findOne({});
};
//Listar criancas vinculadas ao responsavel
const getCriancasByResponsavelId = async (responsavelId) => {
  validarId(responsavelId);
  return await CriancaModel.find({ responsavelId });
};

export default {
  getResponsavelById,
  getResponsavelByUsuarioId,
  getCriancasByResponsavelId,
};
