import mongoose from "mongoose";

const respostaSchema = new mongoose.Schema({
  tarefaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tarefa",
    required: true,
  },

  texto: {
    type: String,
    required: true,
  },
  // Referência da imagem apresentada na alternativa
  imagem: {
    type: String,
    required: false,
  },

  // Referência do áudio da alternativa
  audio: {
    type: String,
    required: false,
  },

  correta: {
    type: Boolean,
    required: true,
  },

  ordem: {
    type: Number,
    required: true,
  },
});

// Índice único composto
respostaSchema.index({ tarefaId: 1, ordem: 1 }, { unique: true });

const RespostaModel = mongoose.model("Resposta", respostaSchema);

export default RespostaModel;
