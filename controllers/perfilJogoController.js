import {
  criarPersonagem,
  listarPersonagens,
  buscarPersonagemPorId,
  atualizarPersonagem,
  arquivarPersonagem,
} from "../services/perfilJogoService.js";

// funcao para tratar erros
const tratarErro = (res, error) => {
  if (
    error.message === "ID_INVALIDO" ||
    error.message === "DADOS_INVALIDOS" ||
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({ erro: true, mensagem: "Dados inválidos" });
  }
  if (
    error.message === "CRIANCA_NAO_ENCONTRADA" ||
    error.message === "PERFIL_JOGO_NAO_ENCONTRADO"
  ) {
    return res
      .status(404)
      .json({ erro: true, mensagem: "Criança ou personagem não encontrado" });
  }
  console.error("Erro no gerenciamento de personagens:", error);
  return res
    .status(500)
    .json({ erro: true, mensagem: "Erro interno do servidor" });
};
// Criar um personagem
const cadastrarPersonagem = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { nomeAvatar, imagemAvatar } = req.body ?? {};
    const personagem = await criarPersonagem(
      usuarioId,
      nomeAvatar,
      imagemAvatar,
    );
    return res.status(201).json(personagem);
  } catch (error) {
    return tratarErro(res, error);
  }
};
// Listar personagens ativos
const obterPersonagens = async (req, res) => {
  try {
    const personagens = await listarPersonagens(req.usuario.id);
    return res.status(200).json(personagens);
  } catch (error) {
    return tratarErro(res, error);
  }
};
//Listar personagem por Id
const obterPersonagemPorId = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;
    const personagem = await buscarPersonagemPorId(usuarioId, id);
    return res.status(200).json(personagem);
  } catch (error) {
    return tratarErro(res, error);
  }
};
//eDITAR pERSONAGEM
const editarPersonagem = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;
    const personagem = await atualizarPersonagem(usuarioId, id, req.body);
    return res.status(200).json(personagem);
  } catch (error) {
    return tratarErro(res, error);
  }
};
//excluir
const excluirPersonagem = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;
    await arquivarPersonagem(usuarioId, id);
    return res.sendStatus(204);
  } catch (error) {
    return tratarErro(res, error);
  }
};

export {
  cadastrarPersonagem,
  obterPersonagens,
  obterPersonagemPorId,
  editarPersonagem,
  excluirPersonagem,
};
