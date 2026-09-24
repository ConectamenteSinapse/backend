import mongoose from "mongoose";

const comodoSchema = new mongoose.Schema({
  nome: String,
  descricao: String,
  imagemCenario: String,
  ordem: Number,
  dificuldadesDisponiveis: [String],
  ativo: Boolean,
});

const Comodo = mongoose.model("Comodo", comodoSchema);

export default Comodo;
