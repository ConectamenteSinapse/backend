import UsuarioModel from "../models/usuarioModel.js";
import bcrypt from "bcrypt";
// funcao responsavel por buscar todos os usuarios
const getAllUsuarios = async () => {
  const usuarios = await UsuarioModel.find().select("-senha");
  return usuarios;
};
// funcao para buscar somente um usuario pelo id
const getUsuarioById = async (id) => {
  const usuario = await UsuarioModel.findById(id).select("-senha");
  return usuario;
};
// Buscar usuario pelom  email para realizar o login
const getUsuarioByEmail = async (email) => {
  const usuario = await UsuarioModel.findOne({ email });
  return usuario;
};

// funcao para cadastar um usuario
const postUsuario = async (nome, email, senha, perfil) => {
  // Regra de negócio: somente perfis permitidos
  if (!["crianca", "responsavel"].includes(perfil)) {
    throw new Error("PERFIL_USUARIO_INVALIDO");
  }
  // gerar o hash da senha
  const senhaHash = await bcrypt.hash(senha, 12);

  //criando o objeto do novo usuario
  const novoUsuario = await UsuarioModel.create({
    nome,
    email,
    senha: senhaHash,
    perfil,
  });
  // remver a senha da resposta
  const usuario = novoUsuario.toObject();
  delete usuario.senha;

  return usuario;
};
// funcao para editar totalmente um usuario pelo id
const putUsuarioById = async (id, nome, email, senha, perfil) => {
  const senhaHash = await bcrypt.hash(senha, 12);

  const usuario = await UsuarioModel.findByIdAndUpdate(
    id,
    {
      nome,
      email,
      senha: senhaHash,
      perfil,
    },
    {
      new: true,
      runValidators: true,
    },
  );
  if (!usuario) {
    return null;
  }

  // Remover o hash da resposta
  const usuarioAtualizado = usuario.toObject();
  delete usuarioAtualizado.senha;

  return usuarioAtualizado;
};

// funcao para editar parcialmente um usuario pelo Id

const patchUsuarioById = async (id, dadosAtualizados) => {
  if (dadosAtualizados.senha !== undefined) {
    if (
      typeof dadosAtualizados.senha !== "string" ||
      dadosAtualizados.senha.trim() === ""
    ) {
      throw new Error("SENHA_INVALIDA");
    }
    // Gerar o hash antes de atualizar
    dadosAtualizados.senha = await bcrypt.hash(dadosAtualizados.senha, 12);
  }
  const usuario = await UsuarioModel.findByIdAndUpdate(id, dadosAtualizados, {
    new: true,
    runValidators: true,
  });
  if (!usuario) {
    return null;
  }
  // Remover o hash da resposta
  const usuarioAtualizado = usuario.toObject();
  delete usuarioAtualizado.senha;

  return usuarioAtualizado;
};

//Funcao para deletar um Usuario
const deleteUsuarioById = async (id) => {
  const usuario = await UsuarioModel.findByIdAndDelete(id);

  if (!usuario) {
    return false;
  }

  return true;
};
export default {
  getAllUsuarios,
  getUsuarioById,
  postUsuario,
  putUsuarioById,
  patchUsuarioById,
  deleteUsuarioById,
  getUsuarioByEmail,
};
