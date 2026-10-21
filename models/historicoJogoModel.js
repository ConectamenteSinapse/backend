import mongoose from "mongoose";

// Schema do histórico de interações da criança com o jogo
const historicoJogoSchema = new mongoose.Schema({
  // Perfil de jogo utilizado na atividade
  perfilJogoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PerfilJogo",
    required: true,
  },
  // Partida em que a tentativa foi realizada
  jogoSalvoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JogoSalvo",
    default: null,
    index: true,
  },
  // Criança que realizou a atividade
  criancaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Crianca",
    required: true,
  },

  // Cômodo onde a tarefa foi realizada
  comodoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Comodo",
    required: true,
  },

  // Tarefa realizada
  tarefaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tarefa",
    required: true,
  },

  // Alternativa selecionada pela criança
  respostaEscolhidaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Resposta",
    required: true,
  },

  // Indica se a resposta foi correta
  acertou: {
    type: Boolean,
    required: true,
  },

  // Número da tentativa
  tentativa: {
    type: Number,
    required: true,
    min: 1,
  },

  // Pontos ganhos na tentativa
  pontuacaoGanha: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Tempo gasto para responder
  tempoGastoSegundos: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Data e hora da resposta
  dataHora: {
    type: Date,
    default: Date.now,
  },
  // Dificuldade em que a criança realizou a tarefa
  dificuldade: {
    type: String,
    enum: ["facil", "medio", "dificil"],
    required: true,
  },
});

// Utilizar a coleção já existente no MongoDB
const HistoricoJogoModel = mongoose.model(
  "HistoricoJogo",
  historicoJogoSchema,
  "historico_jogo",
);

export default HistoricoJogoModel;
