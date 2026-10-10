import tarefaService from "../services/tarefaService.js";

// funcao para tratar erros e nao precisar ficar repetindo
const tratarErro = (error, res) => {
  if (error.name === "CastError") {
    return res
      .status(400)
      .json({ mensagem: "ID invalido", erro: error.message });
  }
  if (error.name === "ValidationError") {
    return res
      .status(400)
      .json({ mensagem: "Erro da validacao", erro: error.message });
  }
  // Erros de regra de negócio, como cômodo inexistente
  if (error.status === 400) {
    return res.status(400).json({
      mensagem: error.message,
    });
  }
  console.log(error);
  return res.status(500).json({ mensagem: "Erro interno do servidor" });
};
// funcao para listar todas as tarefas
const getAllTarefas = async (req, res) => {
  try {
    const tarefas = await tarefaService.getAllTarefas();
    return res.status(200).json(tarefas);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//funcao para buscar uma tarefa especifica
const getTarefaById = async (req, res) => {
  const id = req.params.id;
  try {
    const tarefa = await tarefaService.getTarefaById(id);
    if (!tarefa) {
      return res.status(404).json({ mensagem: "Tarefa não encontrada" });
    }
    return res.status(200).json(tarefa);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//funcao para cadastrar uma tarefa
const postTarefa = async (req, res) => {
  const dadosTarefa = req.body;
  try {
    // verifianco se todos os campos obrigatorios foram pegos:
    if (
      !dadosTarefa ||
      !dadosTarefa.titulo ||
      !dadosTarefa.enunciado ||
      !dadosTarefa.descricao ||
      !dadosTarefa.comodoId ||
      !dadosTarefa.imagemObjeto ||
      !dadosTarefa.posicao ||
      dadosTarefa.ordem == null ||
      !dadosTarefa.dificuldade
    ) {
      return res
        .status(400)
        .json({ erro: "Campos obrigatorios nao preenchidos" });
    }
    const novaTarefa = await tarefaService.postTarefa(dadosTarefa);

    return res.status(201).json(novaTarefa);
  } catch (error) {
    return tratarErro(error, res);
  }
};
//funcao para edira totalmente uma tarefa
const putTarefaById = async (req, res) => {
  const id = req.params.id;
  const dadosTarefa = req.body;
  try {
    // verifianco se todos os campos obrigatorios foram pegos:
    if (
      !dadosTarefa ||
      !dadosTarefa.titulo ||
      !dadosTarefa.enunciado ||
      !dadosTarefa.descricao ||
      !dadosTarefa.comodoId ||
      !dadosTarefa.imagemObjeto ||
      !dadosTarefa.posicao ||
      dadosTarefa.ordem == null ||
      !dadosTarefa.dificuldade
    ) {
      return res
        .status(400)
        .json({ erro: "Campos obrigatorios nao preenchidos" });
    }
    const tarefa = await tarefaService.putTarefaById(id, dadosTarefa);
    if (!tarefa) {
      return res.status(404).json({ erro: "tarefa nao encontrada" });
    }
    return res.status(200).json(tarefa);
  } catch (error) {
    return tratarErro(error, res);
  }
};
//funcao para edira parte da tarefa
const patchTarefaById = async (req, res) => {
  const id = req.params.id;
  const dadosAtualizados = req.body;
  try {
    // verifianco se todos os campos obrigatorios foram pegos:
    if (!dadosAtualizados || Object.keys(dadosAtualizados).length === 0) {
      return res
        .status(400)
        .json({ erro: "Nenhum campo enviado para atualização" });
    }
    const tarefa = await tarefaService.patchTarefaById(id, dadosAtualizados);
    if (!tarefa) {
      return res.status(404).json({ erro: "tarefa nao encontrada" });
    }
    return res.status(200).json(tarefa);
  } catch (error) {
    return tratarErro(error, res);
  }
};
//funcao para DELETAR a tarefa
const deleteTarefaById = async (req, res) => {
  const id = req.params.id;
  try {
    const tarefaDeletada = await tarefaService.deleteTarefaById(id);
    if (!tarefaDeletada) {
      return res.status(404).json({ erro: "tarefa nao encontrada" });
    }
    return res.sendStatus(204);
  } catch (error) {
    return tratarErro(error, res);
  }
};

export default {
  getAllTarefas,
  getTarefaById,
  postTarefa,
  putTarefaById,
  patchTarefaById,
  deleteTarefaById,
};
