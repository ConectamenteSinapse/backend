import {
  criarJogoSalvo,
  listarJogosSalvos,
  buscarJogoSalvoPorId,
  atualizarJogoSalvo,
  excluirJogoSalvo,
} from "../services/jogoSalvoService.js";

import {
  iniciarSessaoJogo,
  renovarSessaoJogo,
  pausarSessaoJogo,
  encerrarSessaoJogo,
} from "../services/tempoJogoService.js";

// Tratamento de erros dos jogos salvos
const tratarErro = (error, res) => {
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
    error.message === "PERFIL_JOGO_NAO_ENCONTRADO" ||
    error.message === "JOGO_SALVO_NAO_ENCONTRADO" ||
    error.name === "DocumentNotFoundError"
  ) {
    return res
      .status(404)
      .json({ erro: true, mensagem: "Registro não encontrado" });
  }
  if (error.message === "COMODO_BLOQUEADO") {
    return res.status(403).json({
      erro: true,
      mensagem: "Conclua o cômodo anterior para continuar!",
      codigo: "COMODO_BLOQUEADO",
    });
  }
  if (error.message === "DIFICULDADE_BLOQUEADA") {
    return res.status(403).json({
      erro: true,
      mensagem: "Conclua a dificuldade anterior para continuar!",
      codigo: "DIFICULDADE_BLOQUEADA",
    });
  }
  if (error.message === "TAREFA_FORA_DA_ORDEM") {
    return res.status(403).json({
      erro: true,
      mensagem: "Conclua as tarefas anteriores para continuar!",
      codigo: "TAREFA_FORA_DA_ORDEM",
    });
  }
  if (
    error.message === "SESSAO_INVALIDA" ||
    error.message === "SESSAO_INATIVA" ||
    error.message === "SESSAO_EXPIRADA"
  ) {
    return res.status(409).json({
      erro: true,
      mensagem: "A sessão de jogo não está disponível",
      codigo: error.message,
    });
  }

  if (error.message === "SESSAO_JA_ATIVA") {
    return res.status(409).json({
      erro: true,
      mensagem: "Já existe uma sessão de jogo ativa",
      codigo: error.message,
    });
  }

  if (error.message === "CONFLITO_SESSAO") {
    return res.status(409).json({
      erro: true,
      mensagem: "Não foi possível atualizar a sessão",
      codigo: error.message,
    });
  }

  if (
    error.message === "LIMITE_TEMPO_ATINGIDO" ||
    error.message === "PERMISSAO_INATIVA"
  ) {
    return res.status(403).json({
      erro: true,
      mensagem:
        error.message === "LIMITE_TEMPO_ATINGIDO"
          ? "O limite de tempo diário foi atingido"
          : "A permissão para jogar está inativa",
      codigo: error.message,
    });
  }
  console.error("Erro no gerenciamento de jogos salvos:", error);
  return res
    .status(500)
    .json({ erro: true, mensagem: "Erro interno do servidor" });
};
// Criar um novo jogo salvo
const cadastrarJogoSalvo = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { perfilJogoId, nomeJogo } = req.body ?? {};
    const jogoSalvo = await criarJogoSalvo(usuarioId, perfilJogoId, nomeJogo);
    return res.status(201).json(jogoSalvo);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// Listar os jogos salvos da criança
const obterJogosSalvos = async (req, res) => {
  try {
    const jogosSalvos = await listarJogosSalvos(req.usuario.id);
    return res.status(200).json(jogosSalvos);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// Buscar uma partida pelo ID
const obterJogoSalvoPorId = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;
    const jogoSalvo = await buscarJogoSalvoPorId(usuarioId, id);
    return res.status(200).json(jogoSalvo);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// Atualizar os dados de uma partida
const editarJogoSalvo = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;
    const jogoSalvo = await atualizarJogoSalvo(usuarioId, id, req.body);
    return res.status(200).json(jogoSalvo);
  } catch (error) {
    return tratarErro(error, res);
  }
};
// Excluir a partida sem apagar o histórico
const removerJogoSalvo = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;
    await excluirJogoSalvo(usuarioId, id);
    return res.sendStatus(204);
  } catch (error) {
    return tratarErro(error, res);
  }
};

const iniciarSessao = async (req, res) => {
  try {
    const resultado = await iniciarSessaoJogo(req.usuario.id, req.params.id);

    return res.status(201).json(resultado);
  } catch (error) {
    return tratarErro(error, res);
  }
};

const renovarSessao = async (req, res) => {
  try {
    const resultado = await renovarSessaoJogo(
      req.usuario.id,
      req.body?.sessaoId,
    );

    return res.status(200).json(resultado);
  } catch (error) {
    return tratarErro(error, res);
  }
};

const pausarSessao = async (req, res) => {
  try {
    const resultado = await pausarSessaoJogo(
      req.usuario.id,
      req.body?.sessaoId,
    );

    return res.status(200).json(resultado);
  } catch (error) {
    return tratarErro(error, res);
  }
};

const encerrarSessao = async (req, res) => {
  try {
    const resultado = await encerrarSessaoJogo(
      req.usuario.id,
      req.body?.sessaoId,
    );

    return res.status(200).json(resultado);
  } catch (error) {
    return tratarErro(error, res);
  }
};

export {
  cadastrarJogoSalvo,
  obterJogosSalvos,
  obterJogoSalvoPorId,
  editarJogoSalvo,
  removerJogoSalvo,
  iniciarSessao,
  renovarSessao,
  pausarSessao,
  encerrarSessao,
};
