import mongoose from "mongoose";
import CriancaModel from "../models/criancaModel.js";
import PerfilJogoModel from "../models/perfilJogoModel.js";
import JogoSalvoModel from "../models/jogoSalvoModel.js";
import ComodoModel from "../models/comodoModel.js";
import TarefaModel from "../models/tarefaModel.js";
import {
  verificarComodoDesbloqueado,
  verificarDificuldadeDesbloqueada,
  verificarTarefaDesbloqueada,
} from "./validarProgressaoService.js";

// Criar uma nova partida para um personagem
const criarJogoSalvo = async (usuarioId, perfilJogoId, nomeJogo) => {
  // Verificar se o ID do personagem é válido
  if (!mongoose.isValidObjectId(perfilJogoId)) {
    throw new Error("ID_INVALIDO");
  }

  // Localizar a criança autenticada
  const crianca = await CriancaModel.findOne({
    usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Confirmar que o personagem pertence à criança e está ativo
  const personagem = await PerfilJogoModel.findOne({
    _id: perfilJogoId,
    criancaId: crianca._id,
    status: "ativo",
  });

  if (!personagem) {
    throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
  }

  // Validar o nome da partida
  if (typeof nomeJogo !== "string" || !nomeJogo.trim()) {
    throw new Error("DADOS_INVALIDOS");
  }

  // Criar uma nova partida com progresso inicial
  const jogoSalvo = await JogoSalvoModel.create({
    perfilJogoId: personagem._id,
    nomeJogo: nomeJogo.trim(),
  });

  return jogoSalvo;
};

// Listar os jogos salvos da criança autenticada
const listarJogosSalvos = async (usuarioId) => {
  // Localizar a criança
  const crianca = await CriancaModel.findOne({
    usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Buscar os personagens ativos dessa criança
  const personagens = await PerfilJogoModel.find({
    criancaId: crianca._id,
    status: "ativo",
  }).select("_id");

  // Extrair os identificadores dos personagens
  const personagensIds = personagens.map((personagem) => personagem._id);

  // Buscar as partidas pertencentes a esses personagens
  const jogosSalvos = await JogoSalvoModel.find({
    perfilJogoId: { $in: personagensIds },
  })
    .populate("perfilJogoId", "nomeAvatar imagemAvatar")
    .sort({ atualizadoEm: -1 });

  return jogosSalvos;
};
// escolher jogo salvo

// Buscar uma partida específica da criança autenticada
const buscarJogoSalvoPorId = async (usuarioId, jogoSalvoId) => {
  // Validar o identificador da partida
  if (!mongoose.isValidObjectId(jogoSalvoId)) {
    throw new Error("ID_INVALIDO");
  }

  // Localizar a criança autenticada
  const crianca = await CriancaModel.findOne({
    usuarioId,
  });

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Buscar a partida e os dados do personagem
  const jogoSalvo = await JogoSalvoModel.findById(jogoSalvoId).populate(
    "perfilJogoId",
    "criancaId nomeAvatar imagemAvatar status",
  );

  if (!jogoSalvo) {
    throw new Error("JOGO_SALVO_NAO_ENCONTRADO");
  }

  // Confirmar que o personagem pertence à criança e está ativo
  const personagem = jogoSalvo.perfilJogoId;

  if (
    !personagem ||
    personagem.criancaId.toString() !== crianca._id.toString() ||
    personagem.status !== "ativo"
  ) {
    throw new Error("JOGO_SALVO_NAO_ENCONTRADO");
  }

  return jogoSalvo;
};
// guardar o save quando a crianca parou
const atualizarJogoSalvo = async (usuarioId, jogoSalvoId, dadosAtualizacao) => {
  // Confirmar se a partida pertence à criança autenticada
  const jogoSalvo = await buscarJogoSalvoPorId(usuarioId, jogoSalvoId);

  const { nomeJogo, comodoId, tarefaId, dificuldade } = dadosAtualizacao ?? {};

  // Verificar se existe algum campo para atualizar
  if (
    nomeJogo === undefined &&
    comodoId === undefined &&
    tarefaId === undefined &&
    dificuldade === undefined
  ) {
    throw new Error("DADOS_INVALIDOS");
  }

  // Atualizar o nome da partida
  if (nomeJogo !== undefined) {
    if (typeof nomeJogo !== "string" || !nomeJogo.trim()) {
      throw new Error("DADOS_INVALIDOS");
    }

    jogoSalvo.nomeJogo = nomeJogo.trim();
  }

  // Validar e atualizar o cômodo
  if (comodoId !== undefined) {
    if (comodoId !== null && !mongoose.isValidObjectId(comodoId)) {
      throw new Error("ID_INVALIDO");
    }

    jogoSalvo.comodoId = comodoId;
  }

  // Validar e atualizar a tarefa
  if (tarefaId !== undefined) {
    if (tarefaId !== null && !mongoose.isValidObjectId(tarefaId)) {
      throw new Error("ID_INVALIDO");
    }

    jogoSalvo.tarefaId = tarefaId;
  }

  // Validar e atualizar a dificuldade
  if (dificuldade !== undefined) {
    if (!["facil", "medio", "dificil"].includes(dificuldade)) {
      throw new Error("DADOS_INVALIDOS");
    }

    jogoSalvo.dificuldade = dificuldade;
  }
  // Verificar a combinação final de cômodo e tarefa
  const comodoFinal = jogoSalvo.comodoId;
  const tarefaFinal = jogoSalvo.tarefaId;

  // Uma tarefa precisa estar associada a um cômodo
  if (tarefaFinal && !comodoFinal) {
    throw new Error("DADOS_INVALIDOS");
  }

  // Verificar se o cômodo existe e está ativo

  if (comodoFinal) {
    // Buscar o cômodo informado
    const comodo = await ComodoModel.findOne({
      _id: comodoFinal,
      ativo: true,
    });

    if (!comodo) {
      throw new Error("DADOS_INVALIDOS");
    }

    // Verificar se a partida desbloqueou esse cômodo
    const comodoDesbloqueado = await verificarComodoDesbloqueado(
      jogoSalvo._id,
      comodo,
    );

    if (!comodoDesbloqueado) {
      throw new Error("COMODO_BLOQUEADO");
    }
  }
  // Verificar se a dificuldade está desbloqueada
  if (comodoFinal) {
    const dificuldadeDesbloqueada = await verificarDificuldadeDesbloqueada(
      jogoSalvo._id,
      comodoFinal,
      jogoSalvo.dificuldade,
    );

    if (!dificuldadeDesbloqueada) {
      throw new Error("DIFICULDADE_BLOQUEADA");
    }
  }

  // Verificar se a tarefa pertence ao cômodo
  if (tarefaFinal) {
    const tarefa = await TarefaModel.findOne({
      _id: tarefaFinal,
      comodoId: comodoFinal,
      ativo: true,
    });

    if (!tarefa) {
      throw new Error("DADOS_INVALIDOS");
    }

    // Verificar se as tarefas anteriores foram concluídas
    const tarefaDesbloqueada = await verificarTarefaDesbloqueada(
      jogoSalvo._id,
      tarefa,
      jogoSalvo.dificuldade,
    );

    if (!tarefaDesbloqueada) {
      throw new Error("TAREFA_FORA_DA_ORDEM");
    }
  }
  // Registrar a data da atualização
  jogoSalvo.atualizadoEm = new Date();

  await jogoSalvo.save();

  return jogoSalvo;
};

// Excluir uma partida sem apagar seu histórico
const excluirJogoSalvo = async (usuarioId, jogoSalvoId) => {
  // Verificar se a partida pertence à criança autenticada
  const jogoSalvo = await buscarJogoSalvoPorId(usuarioId, jogoSalvoId);

  // Excluir somente a partida encontrada
  const resultado = await JogoSalvoModel.deleteOne({
    _id: jogoSalvo._id,
    perfilJogoId: jogoSalvo.perfilJogoId._id,
  });

  // Verificar se a exclusão aconteceu
  if (resultado.deletedCount === 0) {
    throw new Error("JOGO_SALVO_NAO_ENCONTRADO");
  }
};

export {
  criarJogoSalvo,
  listarJogosSalvos,
  buscarJogoSalvoPorId,
  atualizarJogoSalvo,
  excluirJogoSalvo,
};
