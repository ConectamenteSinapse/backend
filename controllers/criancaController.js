import criancaService from "../services/criancaService.js";

// funcao para tratar erros

const tratarErro = (error, res) => {
  // id invalido ou perfil de usuario incorreto
  if (
    error.message === "ID_INVALIDO" ||
    error.message === "PERFIL_USUARIO_INVALIDO"
  ) {
    return res.status(400).json({ erro: true, mensagem: error.message });
  }
  //Usuario nao encontrado
  if (error.message === "USUARIO_NAO_ENCONTRADO") {
    return res
      .status(404)
      .json({ erro: true, mensagem: "Usuário não encontrado" });
  }
  //Perfil da crianca ja cadastrado
  if (error.message === "PERFIL_CRIANCA_EXISTENTE") {
    return res.status(409).json({
      erro: true,
      mensagem: "O usuário já possui um perfil de criança",
    });
  }
  // Erro de conversao do mongoose
  if (error.name === "CastError") {
    return res.status(400).json({ erro: true, mensagem: "Dados inválidos" });
  }
  // Erro de validação do mongoose
  if (error.name === "ValidationError") {
    return res
      .status(400)
      .json({ erro: true, mensagem: "Erro de validação de dados" });
  }
  // Erro de indice unico no MongoDB
  if (error.code === 11000) {
    return res
      .status(409)
      .json({ erro: true, mensagem: "Já existe um perfil para esse usuário" });
  }
  // outro erro
  console.error(error);
  return res
    .status(500)
    .json({ erro: true, mensagem: "Erro interno do servidor" });
};
//consultar todos as criancas
const getCriancas = async (req, res) => {
  try {
    const criancas = await criancaService.getCriancas();
    return res.status(200).json(criancas);
  } catch (error) {
    return tratarErro(error, res);
  }
};

// consultar o proprio perfil da crainca autenticada
const getMeuPerfil = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const crianca = await criancaService.getCriancaByUsuarioId(usuarioId);
    if (!crianca) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Perfil de criança não encontrado" });
    }
    return res.status(200).json(crianca);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// Buscar uma crianca pelo id do Perfil
const getCriancaById = async (req, res) => {
  try {
    const crianca = await criancaService.getCriancaById(req.params.id);
    if (!crianca) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Criança não encontrada" });
    }
    return res.status(200).json(crianca);
  } catch (error) {
    return tratarErro(error, res);
  }
};
//Buscar uma crianca pelo id do Usuario (usuarioId)
const getCriancaByUsuarioId = async (req, res) => {
  try {
    const crianca = await criancaService.getCriancaByUsuarioId(
      req.params.usuarioId,
    );
    if (!crianca) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Perfil de criança não encontrado" });
    }
    return res.status(200).json(crianca);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// cadastrar crianca
const postCrianca = async (req, res) => {
  try {
    // retorna o ID do usuario autentificado pelo JWT
    const usuarioId = req.usuario.id;
    // Verificar se o body foi informado
    if (!req.body) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Body da requisição obrigatório" });
    }
    const crianca = await criancaService.postCrianca(req.body, usuarioId);
    return res.status(201).json(crianca);
  } catch (error) {
    return tratarErro(error, res);
  }
};

// Atulizar completamente dadaos cadastrais da crianca
const putCriancaById = async (req, res) => {
  try {
    const crianca = await criancaService.putCriancaById(
      req.params.id,
      req.body,
    );
    if (!crianca) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Criança não encontrada" });
    }
    return res.status(200).json(crianca);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// atulalizar parcialmente patch

const patchCriancaById = async (req, res) => {
  try {
    const crianca = await criancaService.patchCriancaById(
      req.params.id,
      req.body,
    );
    if (!crianca) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Criança não encontrada" });
    }
    return res.status(200).json(crianca);
  } catch (error) {
    return tratarErro(error, res);
  }
};

export default {
  getCriancas,
  getCriancaById,
  getCriancaByUsuarioId,
  postCrianca,
  putCriancaById,
  patchCriancaById,
  getMeuPerfil,
};
