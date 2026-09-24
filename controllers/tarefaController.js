import tarefaService from "../services/tarefaService.js";

// funcao para listar todas as tarefas
const getAllTarefas = (req, res) => {
  const tarefas = tarefaService.getAllTarefas();
  return res.status(200).json(tarefas);
};

//funcao para listar uma tarefa especifica
const getTarefaById = (req, res) => {
  const id = Number(req.params.id);
  const tarefa = tarefaService.getTarefaById(id);
  if (!tarefa) {
    return res.status(404).json({ mensagem: "Tarefa não encontrada" });
  }
  return res.status(200).json(tarefa);
};
export default { getAllTarefas, getTarefaById };
