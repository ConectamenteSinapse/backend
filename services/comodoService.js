import ComodoModel from "../models/comodoModel.js";

//Função responsavel por retornar todos os comodos
const getAllComodos = async () => {
  const comodos = await ComodoModel.find();
  return comodos;
};
//funcao responsavel por verificar o comodo especifico
const getComodoById = async (id) => {
  const comodo = await ComodoModel.findById(id);
  return comodo;
};

export default { getAllComodos, getComodoById };
