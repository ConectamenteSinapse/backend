import ResponsavelModel from "../models/responsavelModel.js";
import UsuarioModel from "../models/usuarioModel.js";
import CriancaModel from "../models/criancaModel.js";
import bcrypt from "bcrypt";
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
const postResponsavel = async (usuarioId) => {
  validarId(usuarioId);
  const usuario = await UsuarioModel.findById(usuarioId);

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
// Listar crianças vinculadas ao responsável autenticado
const getMinhasCriancas = async (usuarioId) => {
  validarId(usuarioId);

  const responsavel = await ResponsavelModel.findOne({ usuarioId: usuarioId });

  if (!responsavel) {
    throw new Error("RESPONSAVEL_NAO_ENCONTRADO");
  }

  const criancas = await CriancaModel.find({
    responsavelId: responsavel._id,
  }).populate("usuarioId", "nome email");

  return criancas.map((crianca) => {
    const dados = crianca.toObject();
    const usuario = dados.usuarioId;

    return {
      ...dados,
      usuarioId: usuario?._id ?? null,
      nome: usuario?.nome ?? null,
      email: usuario?.email ?? null,
    };
  });
};

// vincular uma crianca a um responsavel
const vincularCrianca = async (usuarioId, email, senha) => {
  // validando dos resposnavelId e criancaId
  validarId(usuarioId);
  // Verificando se o responsavel existe
  const responsavel = await ResponsavelModel.findOne({ usuarioId: usuarioId });
  if (!responsavel) {
    throw new Error("RESPONSAVEL_NAO_ENCONTRADO");
  }
  // Buscar usuário pelo e-mail informado
  const usuarioCrianca = await UsuarioModel.findOne({
    email: email,
  });
  if (!usuarioCrianca) {
    throw new Error("CREDENCIAIS_INVALIDAS");
  }
  if (usuarioCrianca.perfil !== "crianca") {
    throw new Error("CREDENCIAIS_INVALIDAS");
  }
  const senhaCorreta = await bcrypt.compare(senha, usuarioCrianca.senha);

  if (!senhaCorreta) {
    throw new Error("CREDENCIAIS_INVALIDAS");
  }
  // Verificar se a criança existe
  const crianca = await CriancaModel.findOne({ usuarioId: usuarioCrianca._id });
  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }
  //  Verificar se já possui responsável
  if (crianca.responsavelId) {
    // Pendente: confirmação de responsabilidade e gravação segura
    throw new Error("CRIANCA_JA_VINCULADA");
  }
  // Atualizar o vínculo somente se a criança ainda não possui responsável
  const criancaAtualizada = await CriancaModel.findOneAndUpdate(
    {
      _id: crianca._id,
      responsavelId: null,
    },
    {
      $set: {
        responsavelId: responsavel._id,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  // Verificar se a atualização foi realizada
  if (!criancaAtualizada) {
    throw new Error("CRIANCA_JA_VINCULADA");
  }

  return criancaAtualizada;
};

// Alterar a permissão de jogo de uma criança vinculada
const alterarPermissaoCrianca = async (
  usuarioId,
  criancaId,
  permissaoAtiva,
) => {
  // Validar os identificadores
  validarId(usuarioId);
  validarId(criancaId);

  // Verificar se o valor recebido é booleano
  if (typeof permissaoAtiva !== "boolean") {
    throw new Error("PERMISSAO_INVALIDA");
  }

  // Buscar o perfil do responsável autenticado
  const responsavel = await ResponsavelModel.findOne({
    usuarioId: usuarioId,
  });

  if (!responsavel) {
    throw new Error("RESPONSAVEL_NAO_ENCONTRADO");
  }

  // Atualizar somente uma criança vinculada a esse responsável
  const criancaAtualizada = await CriancaModel.findOneAndUpdate(
    {
      _id: criancaId,
      responsavelId: responsavel._id,
    },
    {
      $set: {
        permissaoAtiva: permissaoAtiva,
      },
      $inc: {
        sessaoJogoVersao: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!criancaAtualizada) {
    throw new Error("CRIANCA_NAO_VINCULADA");
  }

  return criancaAtualizada;
};

const alterarLimiteTempoCrianca = async (
  usuarioId,
  criancaId,
  limiteTempoDiario,
) => {
  validarId(usuarioId);
  validarId(criancaId);
  if (
    limiteTempoDiario !== null &&
    (!Number.isInteger(limiteTempoDiario) || limiteTempoDiario < 1)
  ) {
    throw new Error("LIMITE_TEMPO_INVALIDO");
  }
  const responsavel = await ResponsavelModel.findOne({
    usuarioId: usuarioId,
  });

  if (!responsavel) {
    throw new Error("RESPONSAVEL_NAO_ENCONTRADO");
  }
  const criancaAtualizada = await CriancaModel.findOneAndUpdate(
    {
      _id: criancaId,
      responsavelId: responsavel._id,
    },
    {
      $set: {
        limiteTempoDiario: limiteTempoDiario,
      },
      $inc: {
        sessaoJogoVersao: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );
  if (!criancaAtualizada) {
    throw new Error("CRIANCA_NAO_VINCULADA");
  }

  return criancaAtualizada;
};
// Desvincular uma criança do responsável autenticado
const desvincularCrianca = async (usuarioId, criancaId) => {
  // Validar os identificadores
  validarId(usuarioId);
  validarId(criancaId);

  // Buscar o perfil do responsável autenticado
  const responsavel = await ResponsavelModel.findOne({
    usuarioId: usuarioId,
  });

  if (!responsavel) {
    throw new Error("RESPONSAVEL_NAO_ENCONTRADO");
  }

  // Desvincular somente uma criança pertencente ao responsável
  const criancaAtualizada = await CriancaModel.findOneAndUpdate(
    {
      _id: criancaId,
      responsavelId: responsavel._id,
    },
    {
      $set: {
        responsavelId: null,
        permissaoAtiva: false,
      },
      $inc: {
        sessaoJogoVersao: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!criancaAtualizada) {
    throw new Error("CRIANCA_NAO_VINCULADA");
  }

  return criancaAtualizada;
};
export default {
  getResponsaveis,
  getResponsavelById,
  getResponsavelByUsuarioId,
  postResponsavel,
  getMinhasCriancas,
  vincularCrianca,
  alterarPermissaoCrianca,
  alterarLimiteTempoCrianca,
  desvincularCrianca,
};
