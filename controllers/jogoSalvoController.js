import {
  criarJogoSalvo,
  listarJogosSalvos,
  buscarJogoSalvoPorId,
  atualizarJogoSalvo,
  excluirJogoSalvo,
} from "../services/jogoSalvoService.js";

// Tratamento de erros dos jogos salvos
const tratarErro = (error, res) => {
  if (
    error.message === "ID_INVALIDO" ||
    error.message === "DADOS_INVALIDOS" ||
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      mensagem: "Dados inválidos",
    });
  }

  if (
    error.message === "CRIANCA_NAO_ENCONTRADA" ||
    error.message === "PERFIL_JOGO_NAO_ENCONTRADO" ||
    error.message === "JOGO_SALVO_NAO_ENCONTRADO" ||
    error.name === "DocumentNotFoundError"
  ) {
    return res.status(404).json({
      mensagem: "Registro não encontrado",
    });
  }
  if (error.message === "COMODO_BLOQUEADO") {
    return res.status(403).json({
      mensagem: "Conclua o cômodo anterior para continuar!",
      codigo: "COMODO_BLOQUEADO",
    });
  }

  if (error.message === "DIFICULDADE_BLOQUEADA") {
    return res.status(403).json({
      mensagem: "Conclua a dificuldade anterior para continuar!",
      codigo: "DIFICULDADE_BLOQUEADA",
    });
  }

  if (error.message === "TAREFA_FORA_DA_ORDEM") {
    return res.status(403).json({
      mensagem: "Conclua as tarefas anteriores para continuar!",
      codigo: "TAREFA_FORA_DA_ORDEM",
    });
  }

  console.error("Erro no gerenciamento de jogos salvos:", error);

  return res.status(500).json({
    mensagem: "Erro interno do servidor",
  });
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

    return res.status(204).send();
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
};
