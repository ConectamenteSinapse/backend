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
  // Referência ao áudio que reproduz o enunciado da tarefa
  audioEnunciado: {
    type: String,
    required: false,
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
});
tarefaSchema.index({ comodoId: 1, ordem: 1 }, { unique: true });
const TarefaModel = mongoose.model("Tarefa", tarefaSchema);

export default TarefaModel;
