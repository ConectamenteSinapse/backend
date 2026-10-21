import mongoose from "mongoose";

// Schema responsável pelos jogos salvos de cada personagem
const jogoSalvoSchema = new mongoose.Schema({
  // Personagem associado à partida
  perfilJogoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PerfilJogo",
    required: true,
    index: true,
  },

  // Nome para identificar o jogo salvo
  nomeJogo: {
    type: String,
    required: true,
    trim: true,
  },

  // Cômodo onde a criança parou
  comodoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Comodo",
    default: null,
  },

  // Tarefa em que a criança parou
  tarefaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tarefa",
    default: null,
  },

  // Dificuldade atual da partida
  dificuldade: {
    type: String,
    enum: ["facil", "medio", "dificil"],
    default: "facil",
  },

  // Pontuação independente desta partida
  estrelasTotal: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Data de criação
  criadoEm: {
    type: Date,
    default: Date.now,
  },

  // Data da última alteração
  atualizadoEm: {
    type: Date,
    default: Date.now,
  },
});

// Collection utilizada no MongoDB
const JogoSalvoModel = mongoose.model(
  "JogoSalvo",
  jogoSalvoSchema,
  "jogos_salvos",
);

export default JogoSalvoModel;
