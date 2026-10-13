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

  criadoEm: {
    type: Date,
    default: Date.now,
  },
});

// Cria o model associado à coleção "criancas"
const CriancaModel = mongoose.model("Crianca", criancaSchema);

export default CriancaModel;
