// importando o usuarioService
import usuarioService from "../services/usuarioService.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Função auxiliar para tratar erros
const tratarErro = (error, res) => {
  // Email já cadastrado
  if (error.code === 11000) {
    return res
      .status(409)
      .json({ erro: true, mensagem: "Email já cadastrado" });
  }
  // Erro de validação do Mongoose
  if (error.name === "ValidationError") {
    return res
      .status(400)
      .json({ erro: true, mensagem: "Dados de usuário inválidos" });
  }
  // ID inválido do MongoDB
  if (error.name === "CastError") {
    return res.status(400).json({ erro: true, mensagem: "ID inválido" });
  }
  // Perfil não permitido no cadastro
  if (error.message === "PERFIL_USUARIO_INVALIDO") {
    return res
      .status(400)
      .json({ erro: true, mensagem: "Perfil de usuário inválido" });
  }
  // Erro inesperado
  console.error(error);
  return res
    .status(500)
    .json({ erro: true, mensagem: "Erro interno do servidor" });
};

// funcao para listar todos os usuarios
const getAllUsuarios = async (req, res) => {
  try {
    // busca os usuarios no usuarioService
    const usuarios = await usuarioService.getAllUsuarios();
    // retorna todos os usuarios cadastrados
    return res.status(200).json(usuarios);
  } catch (error) {
    return tratarErro(error, res);
  }
};
const getMeuPerfil = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const usuario = await usuarioService.getUsuarioById(usuarioId);
    if (!usuario) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Usuário não encontrado" });
    }
    return res.status(200).json(usuario);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// funcao para listar o usuario pelo ID
const getUsuarioById = async (req, res) => {
  try {
    const id = req.params.id;
    // buscar o usuario atraves do service
    const usuario = await usuarioService.getUsuarioById(id);
    if (!usuario) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Usuário não encontrado" });
    }
    return res.status(200).json(usuario);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// funcao para cadastro de um usuario
const postUsuario = async (req, res) => {
  try {
    if (!req.body) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Dados do cadastro não informados" });
    }
    const nome = req.body.nome;
    const email = req.body.email;
    const senha = req.body.senha;
    const perfil = req.body.perfil;

    // Verificar se os campos obrigatórios são textos válidos
    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof senha !== "string" ||
      !senha.trim() ||
      typeof perfil !== "string" ||
      !perfil.trim()
    ) {
      return res.status(400).json({
        erro: true,
        mensagem: "Campos obrigatórios inválidos ou não preenchidos",
      });
    }
    const novoUsuario = await usuarioService.postUsuario(
      nome,
      email,
      senha,
      perfil,
    );
    return res.status(201).json(novoUsuario);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// funcao para atualizar totalmente o usuario
const putUsuarioById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!req.body) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Body da requisição obrigatório" });
    }
    const nome = req.body.nome;
    const email = req.body.email;
    const senha = req.body.senha;
    const perfil = req.body.perfil;

    if (!nome || !email || !senha || !perfil) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Campos obrigatórios não preenchidos" });
    }
    const usuario = await usuarioService.putUsuarioById(
      id,
      nome,
      email,
      senha,
      perfil,
    );
    if (!usuario) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Usuário não encontrado" });
    }
    return res.status(200).json(usuario);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// funcao para atualizar campo especifico do usuario
const patchUsuarioById = async (req, res) => {
  try {
    const id = req.params.id;
    const dadosAtualizados = req.body;
    const usuario = await usuarioService.patchUsuarioById(id, dadosAtualizados);
    if (!usuario) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Usuário não encontrado" });
    }
    return res.status(200).json(usuario);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// funcao para deletar um usuario
const deleteUsuarioById = async (req, res) => {
  try {
    const id = req.params.id;
    const usuarioDeletado = await usuarioService.deleteUsuarioById(id);
    if (!usuarioDeletado) {
      return res
        .status(404)
        .json({ erro: true, mensagem: "Usuário não encontrado" });
    }
    return res.sendStatus(204);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// realizar Login do usuario
const loginUsuario = async (req, res) => {
  try {
    if (!req.body) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Body da requisição obrigatório" });
    }
    const { email, senha } = req.body;
    if (
      typeof email !== "string" ||
      email.trim() === "" ||
      typeof senha !== "string" ||
      senha === ""
    ) {
      return res
        .status(400)
        .json({ erro: true, mensagem: "Email e senha são obrigatórios" });
    }
    const usuario = await usuarioService.getUsuarioByEmail(email);
    if (!usuario) {
      return res
        .status(401)
        .json({ erro: true, mensagem: "Email ou senha inválidos" });
    }
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res
        .status(401)
        .json({ erro: true, mensagem: "Email ou senha inválidos" });
    }
    // Verifia se o segredo JWT esta configurado na variavel de ambiente
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET_NAO_CONFIGURADO");
    }
    //Gerar o token JWT
    const token = jwt.sign(
      {
        id: usuario._id.toString(),
        perfil: usuario.perfil,
      },
      process.env.JWT_SECRET,
      { expiresIn: "5h" },
    );

    return res.status(200).json({
      mensagem: "Login realizado com sucesso",
      token,
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    });
  } catch (error) {
    return tratarErro(error, res);
  }
};
export default {
  getAllUsuarios,
  getUsuarioById,
  postUsuario,
  putUsuarioById,
  patchUsuarioById,
  deleteUsuarioById,
  loginUsuario,
  getMeuPerfil,
};
