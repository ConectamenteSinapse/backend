import mongoose from "mongoose";

// Schema do perfil utilizado pela criança no jogo
const perfilJogoSchema = new mongoose.Schema({
  criancaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Crianca",
    required: true,
  },

  nomeAvatar: {
    type: String,
    required: true,
  },

  imagemAvatar: {
    type: String,
    required: true,
  },

  nivelAtual: {
    type: Number,
    default: 1,
    min: 1,
  },

  estrelasTotal: {
    type: Number,
    default: 0,
    min: 0,
  },

  status: {
    type: String,
    enum: ["ativo", "arquivado"],
    default: "ativo",
  },

  criadoEm: {
    type: Date,
    default: Date.now,
  },
  ultimaInteracaoEm: {
    type: Date,
    default: null,
  },
});

// Utiliza a coleção existente no MongoDB
const PerfilJogoModel = mongoose.model(
  "PerfilJogo",
  perfilJogoSchema,
  "perfis_jogo",
);

export default PerfilJogoModel;
