import mongoose from "mongoose";

const comodoSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
    },

    descricao: {
        type: String,
        required: true
    },

    imagemCenario: {
        type: String,
        required: true
    },

    ordem: {
        type: Number,
        required: true
    },

    dificuldadesDisponiveis: {
        type: [String],
        required: true,
        enum: ["facil", "medio", "dificil"]
    },

    ativo: {
        type: Boolean,
        default: true
    }
})

const ComodoModel = mongoose.model("Comodo", comodoSchema);

export default ComodoModel; 
