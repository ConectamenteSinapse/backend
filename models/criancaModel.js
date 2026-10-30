import mongoose from "mongoose";

const criancaSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true,
    unique: true,
  },

  responsavelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Responsavel",
    default: null,
  },

  dataNascimento: {
    type: Date,
    default: null,
  },

  permissaoAtiva: {
    type: Boolean,
    default: false,
  },

  limiteTempoDiario: {
    type: Number,
    default: null,
    min: 0,
  },

  tempoUsadoHoje: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Dia ao qual pertence o consumo, no horário de São Paulo
  dataReferenciaTempo: {
    type: String,
    default: null,
  },

  // Identificador da sessão de utilização
  sessaoJogoId: {
    type: String,
    default: null,
  },

  // Partida vinculada à sessão
  sessaoJogoSalvoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JogoSalvo",
    default: null,
  },

  // Estado atual da sessão
  sessaoJogoEstado: {
    type: String,
    enum: ["ativa", "pausada", "encerrada"],
    default: "encerrada",
  },

  // Último instante contabilizado pelo servidor
  sessaoJogoContabilizadoEm: {
    type: Date,
    default: null,
  },

  // Prazo para renovação da sessão
  sessaoJogoExpiraEm: {
    type: Date,
    default: null,
  },

  // Controle de versão das atualizações
  sessaoJogoVersao: {
    type: Number,
    default: 0,
    min: 0,
  },
  criadoEm: {
    type: Date,
    default: Date.now,
  },
});

// Cria o model associado à coleção "criancas"
const CriancaModel = mongoose.model("Crianca", criancaSchema);

export default CriancaModel;
