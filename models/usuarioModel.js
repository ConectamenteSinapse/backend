import mongoose from "moongose";

const usuarioSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
  },

  senha: {
    type: String,
    required: true,
  },

  perfil: {
    type: String,
    required: true,
    enum: ["responsavel", "crianca"],
  },

  criadoEm: {
    type: Date,
    default: Date.now,
  },
});
const UsuarioModel = mongoose.model("Usuario", usuarioSchema);

export default UsuarioModel;
