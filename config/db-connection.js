// Importando o mongoose, serve para conectar e manipular o MongoDb usando Javascript
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    //tenta concectar ao banco usando  a variavel que esta no env
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Atlas conectado com sucesso!");
  } catch (error) {
    console.log(`Erro ao conectar ao MongoDB Atlas: ${error}`);
  }
};
export default connectDB;
