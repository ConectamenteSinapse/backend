import mongoose from "mongoose";

const responsavelSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true,
    unique: true,
  },
});

const ResponsavelModel = mongoose.model("Responsavel", responsavelSchema);

export default ResponsavelModel;
