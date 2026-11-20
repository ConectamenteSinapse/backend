// Importando o mongoose, serve para conectar e manipular o MongoDb usando Javascript
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    //tenta concectar ao banco usando  a variavel que esta no env
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB conectado com sucesso!");
  } catch (error) {
    console.error("Erro ao conectar ao MongoDB");
    throw new Error("Falha na conexão com o banco de dados");
  }
};
export default connectDB;
