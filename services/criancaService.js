import CriancaModel from "../models/criancaModel.js";
import UsuarioModel from "../models/usuarioModel.js";
import mongoose from "mongoose";

// Função auxiliar para validar o formato dos IDs
const validarId = (id) => {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new Error("ID_INVALIDO");
  }
};

//Buscar os perfies de criancas
const getCriancas = async () => {
  return await CriancaModel.find();
};

//Buscar uma crainca pelo Id do perfil
const getCriancaById = async (id) => {
  validarId(id);
  return await CriancaModel.findById(id);
};

//Buscar o perfil pela ID da conta do usuario
const getCriancaByUsuarioId = async (usuarioId) => {
  validarId(usuarioId);
  return await CriancaModel.findOne({ usuarioId });
};

//cadastrar perfil da crianca
const postCrianca = async (dadosCrianca) => {
  validarId(dadosCrianca?.usuarioId);
  const usuario = await UsuarioModel.findById(dadosCrianca.usuarioId);
  if (!usuario) {
    throw new Error("USUARIO_NAO_ENCONTRADO");
  }
  if (usuario.perfil !== "crianca") {
    throw new Error("PERFIL_USUARIO_INVALIDO");
  }
  const criancaExistente = await CriancaModel.findOne({
    usuarioId: usuario._id,
  });
  if (criancaExistente) {
    throw new Error("PERFIL_CRIANCA_EXISTENTE");
  }
  return await CriancaModel.create({
    usuarioId: usuario._id,
    dataNascimento: dadosCrianca.dataNascimento,
  });
};

// Atulalizar os dados de um perfil de crianca

const putCriancaById = async (id, dadosAtualizados) => {
  validarId(id);
  const dadosPermitidos = { dataNascimento: dadosAtualizados.dataNascimento };
  return await CriancaModel.findByIdAndUpdate(id, dadosPermitidos, {
    new: true,
    runValidators: true,
  });
};
const patchCriancaById = async (id, dadosAtualizados) => {
  validarId(id);

  const dadosPermitidos = {};
  if (dadosAtualizados.dataNascimento !== undefined) {
    dadosPermitidos.dataNascimento = dadosAtualizados.dataNascimento;
  }
  return await CriancaModel.findByIdAndUpdate(id, dadosPermitidos, {
    new: true,
    runValidators: true,
  });
};
export default {
  getCriancas,
  getCriancaById,
  getCriancaByUsuarioId,
  postCrianca,
  putCriancaById,
  patchCriancaById,
};
