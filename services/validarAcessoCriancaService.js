import mongoose from "mongoose";
import CriancaModel from "../models/criancaModel.js";
import ResponsavelModel from "../models/responsavelModel.js";

// Verificar a existência da criança e a autorização do usuário
const validarAcessoCrianca = async (criancaId, usuarioAutenticado) => {
  // O parâmetro da URL representa Usuario._id
  if (!mongoose.isValidObjectId(criancaId)) {
    throw new Error("CRIANCA_ID_INVALIDO");
  }

  const crianca = await CriancaModel.findOne({
    usuarioId: criancaId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  if (!usuarioAutenticado) {
    throw new Error("ACESSO_NEGADO");
  }

  if (usuarioAutenticado.perfil === "crianca") {
    if (crianca.usuarioId.toString() !== String(usuarioAutenticado.id)) {
      throw new Error("ACESSO_NEGADO");
    }
  } else if (usuarioAutenticado.perfil === "responsavel") {
    const responsavel = await ResponsavelModel.findOne({
      usuarioId: usuarioAutenticado.id,
    });

    if (
      !responsavel ||
      !crianca.responsavelId ||
      crianca.responsavelId.toString() !== responsavel._id.toString()
    ) {
      throw new Error("ACESSO_NEGADO");
    }
  } else {
    throw new Error("ACESSO_NEGADO");
  }

  // Retornar o documento da criança para as próximas consultas
  return crianca;
};

export { validarAcessoCrianca };
