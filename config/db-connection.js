// Importando o mongoose, serve para conectar e manipular o MongoDb usando Javascript
import mongoose from "mongoose";

const connectDB = async () => {
  const ambiente = process.env.MONGO_AMBIENTE || "atlas";
  let uri;
  if (ambiente === "local") {
    uri = process.env.MONGO_URI_LOCAL;
  } else if (ambiente === "atlas") {
    uri = process.env.MONGO_URI;
  } else {
    throw new Error("Ambiente MongoDB inválido");
  }
  if (!uri) {
    throw new Error("URI do MongoDB não configurada");
  }
  try {
    await mongoose.connect(uri);
    console.log("MongoDB conectado com sucesso!");
  } catch (error) {
    console.error("Erro ao conectar ao MongoDB");
    throw new Error("Falha na conexão com o banco de dados");
  }
};

export default connectDB;
