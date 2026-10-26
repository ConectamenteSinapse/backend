import responsavelService from "../services/responsavelService.js";
// tratar error
const tratarErro = (error, res) => {
  if (error.message === "ID_INVALIDO") {
    return res.status(400).json({ erro: true, mensagem: "ID inválido" });
  }
  if (error.message === "PERFIL_USUARIO_INVALIDO") {
    return res
      .status(400)
      .json({ erro: true, mensagem: "Perfil de usuário inválido" });
  }
  if (error.message === "USUARIO_NAO_ENCONTRADO") {
    return res
      .status(404)
      .json({ erro: true, mensagem: "Usuario não encontrado" });
  }
  if (error.message === "RESPONSAVEL_NAO_ENCONTRADO") {
    return res
      .status(404)
      .json({ erro: true, mensagem: "Responsavel nao encontrado" });
  }
  if (error.message === "PERFIL_RESPONSAVEL_EXISTENTE") {
    return res.status(409).json({
      erro: true,
      mensagem: "Este usuario ja possui um perfil de responsavel",
    });
  }
  if (error.message === "CRIANCA_NAO_ENCONTRADA") {
    return res
      .status(404)
      .json({ erro: true, mensagem: "Criança não encontrada" });
  }
  if (error.message === "CRIANCA_JA_VINCULADA") {
    return res.status(409).json({
      erro: true,
      mensagem: "Criança já possui responsável vinculado",
    });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ erro: true, mensagem: "Dados invalidos" });
  }
  // duplicidadae do mongoDB
  if (error.code === 11000) {
    return res.status(409).json({ erro: true, mensagem: "Registro duplicado" });
  }
  if (error.message === "CREDENCIAIS_INVALIDAS") {
    return res
      .status(401)
      .json({ erro: true, mensagem: "E-mail ou senha inválidos" });
  }
  if (error.message === "PERMISSAO_INVALIDA") {
    return res
      .status(400)
      .json({ erro: true, mensagem: "A permissão deve ser true ou false" });
  }
  if (error.message === "CRIANCA_NAO_VINCULADA") {
    return res.status(404).json({
      erro: true,
      mensagem: "Criança não encontrada entre as contas vinculadas",
    });
  }
  console.log(error);
  return res
    .status(500)
    .json({ erro: true, mensagem: "Erro interno do servidor" });
};

// Listar os Responsaveis
const getResponsaveis = async (req, res) => {
  try {
    const responsaveis = await responsavelService.getResponsaveis();
    return res.status(200).json(responsaveis);
  } catch (error) {
    return tratarErro(error, res);
  }
};

// Buscar resposnavel pelo ID de perfil

const getResponsavelById = async (req, res) => {
  try {
    const responsavel = await responsavelService.getResponsavelById(
      req.params.id,
    );
    if (!responsavel) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Responsavel não encontrado" });
    }
    return res.status(200).json(responsavel);
  } catch (error) {
    return tratarErro(error, res);
  }
};

// Alterar a permissão de jogo de uma criança vinculada
const alterarPermissaoCrianca = async (req, res) => {
  try {
    // Identificar o responsável autenticado pelo JWT
    const usuarioId = req.usuario.id;
    // Obter o ID da criança pela URL
    const criancaId = req.params.criancaId;
    // Verificar se o Body foi informado
    if (!req.body) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Body da requisição obrigatório" });
    }
    // Obter a permissão enviada pelo responsável
    const permissaoAtiva = req.body.permissaoAtiva;
    // Chamar o Service
    const crianca = await responsavelService.alterarPermissaoCrianca(
      usuarioId,
      criancaId,
      permissaoAtiva,
    );
    // Retornar apenas a informação atualizada
    return res.status(200).json({
      mensagem: "Permissão atualizada com sucesso",
      permissaoAtiva: crianca.permissaoAtiva,
    });
  } catch (error) {
    return tratarErro(error, res);
  }
};

//Buscar responsavel pelo ID usuario

const getResponsavelByUsuarioId = async (req, res) => {
  try {
    const responsavel = await responsavelService.getResponsavelByUsuarioId(
      req.params.usuarioId,
    );
    if (!responsavel) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Responsavel nao encontrado" });
    }
    return res.status(200).json(responsavel);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//cadastrar perfil responsavel
const postResponsavel = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const responsavel = await responsavelService.postResponsavel(usuarioId);
    return res.status(201).json(responsavel);
  } catch (error) {
    return tratarErro(error, res);
  }
};

// listar criancas do responsavel autentificado
const getMinhasCriancas = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    const criancas = await responsavelService.getMinhasCriancas(usuarioId);
    return res.status(200).json(criancas);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//Vincular crianca ao responsavel
const vincularCrianca = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    if (!req.body) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Body da requisição obrigatorio" });
    }
    const email = req.body.email;
    const senha = req.body.senha;
    if (
      typeof email !== "string" ||
      email.trim() === "" ||
      typeof senha !== "string" ||
      senha.trim() === ""
    ) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "E-mail e senha são obrigatórios" });
    }
    const resultado = await responsavelService.vincularCrianca(
      usuarioId,
      email,
      senha,
    );
    return res.status(200).json(resultado);
  } catch (error) {
    return tratarErro(error, res);
  }
};

export default {
  getResponsaveis,
  getResponsavelById,
  getResponsavelByUsuarioId,
  postResponsavel,
  getMinhasCriancas,
  vincularCrianca,
  alterarPermissaoCrianca,
};
