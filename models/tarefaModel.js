import mongoose from "mongoose";

const tarefaSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: true,
  },
  enunciado: {
    type: String,
    required: true,
  },

  descricao: {
    type: String,
    required: true,
  },

  comodoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Comodo",
    required: true,
  },

  imagemObjeto: {
    type: String,
    required: true,
  },

  posicao: {
    x: {
      type: Number,
      required: true,
    },
    y: {
      type: Number,
      required: true,
    },
    largura: {
      type: Number,
      required: true,
    },
    altura: {
      type: Number,
      required: true,
    },
  },

  ordem: {
    type: Number,
    required: true,
  },

  tipo: {
    type: String,
    default: "padrao",
  },

  ativo: {
    type: Boolean,
    default: true,
  },

  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    default: null,
  },

  dificuldade: {
    type: String,
    required: true,
    enum: ["facil", "medio", "dificil"],
  },
});

const TarefaModel = mongoose.model("Tarefa", tarefaSchema);

export default TarefaModel;
