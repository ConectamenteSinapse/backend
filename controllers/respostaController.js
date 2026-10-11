import respostaService from "../services/respostaService.js";
import tarefaService from "../services/tarefaService.js";

//funcao de tratamento de erro
const tratarErro = (error, res) => {
  if (error.name === "CastError") {
    return res.status(400).json({ mensagem: "ID invalido" });
  }
  if (error.name === "ValidationError") {
    return res
      .status(400)
      .json({ mensagem: "Erro de validação", erro: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({
      mensagem: "Ja existe uma resposta nessa ordem para essa tarefa",
    });
  }
  console.log(error);
  return res.status(500).json({ mensagem: "Erro interno do Servidor" });
};
//funcao para listar todas as respostas
const getAllRespostas = async (req, res) => {
  try {
    const respostas = await respostaService.getAllRespostas();
    return res.status(200).json(respostas);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//funcao para listar uma resposta em especifica pelo Id
const getRespostaById = async (req, res) => {
  try {
    const id = req.params.respostaId;
    const resposta = await respostaService.getRespostaById(id);
    if (!resposta) {
      return res.status(404).json({ mensagem: "resposta nao encontrado" });
    }
    return res.status(200).json(resposta);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//funcao para listar as respostas sem revelar a correta de uma determinada tarefaId
const getRespostasByTarefaId = async (req, res) => {
  try {
    const tarefaId = req.params.tarefaId;
    // Verifica se a tarefa existe
    const tarefa = await tarefaService.getTarefaById(tarefaId);
    // Se a tarefa não existir, retorna 404
    if (!tarefa) {
      return res.status(404).json({ mensagem: "Tarefa não encontrada" });
    }
    const respostas =
      await respostaService.getRespostasByTarefaIdSemCorreta(tarefaId);
    if (respostas.length === 0) {
      return res.status(200).json({
        mensagem: "Não existem respostas cadastradas para esta tarefa",
        respostas: [],
      });
    }
    return res.status(200).json(respostas);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//Função para cadasrear uma resposta
const postResposta = async (req, res) => {
  try {
    const dadosResposta = req.body;
    if (
      !dadosResposta ||
      !dadosResposta.tarefaId ||
      !dadosResposta.texto ||
      typeof dadosResposta.correta !== "boolean" ||
      dadosResposta.ordem == null
    ) {
      return res
        .status(400)
        .json({ mensagem: "Campos Obrigatorios nao foram preenchidos" });
    }
    const novaResposta = await respostaService.postResposta(dadosResposta);
    return res.status(201).json(novaResposta);
  } catch (error) {
    return tratarErro(error, res);
  }
};

//Função para atualizar uma resposta completa
const putRespostaById = async (req, res) => {
  try {
    const id = req.params.respostaId;
    const dadosResposta = req.body;
    if (
      !dadosResposta ||
      !dadosResposta.tarefaId ||
      !dadosResposta.texto ||
      typeof dadosResposta.correta !== "boolean" ||
      dadosResposta.ordem == null
    ) {
      return res
        .status(400)
        .json({ mensagem: "Campos Obrigatorios nao foram preenchidos" });
    }
    const resposta = await respostaService.putRespostaById(id, dadosResposta);
    if (!resposta) {
      return res.status(404).json({ mensagem: "Resposta não encontrada" });
    }
    return res.status(200).json(resposta);
  } catch (error) {
    return tratarErro(error, res);
  }
};
//Função para atualizar uma resposta completa
const patchRespostaById = async (req, res) => {
  try {
    const id = req.params.respostaId;
    const dadosAtualizados = req.body;
    if (!dadosAtualizados || Object.keys(dadosAtualizados).length === 0) {
      return res
        .status(400)
        .json({ mensagem: "Nenhum campo enviado para atualização" });
    }
    const resposta = await respostaService.patchRespostaById(
      id,
      dadosAtualizados,
    );
    if (!resposta) {
      return res.status(404).json({ mensagem: "Resposta não encontrada" });
    }
    return res.status(200).json(resposta);
  } catch (error) {
    return tratarErro(error, res);
  }
};
//Função para excluir uma resposta
const deleteRespostaById = async (req, res) => {
  try {
    const id = req.params.respostaId;
    const respostaDeletada = await respostaService.deleteRespostaById(id);

    if (!respostaDeletada) {
      return res.status(404).json({ mensagem: "Resposta não encontrada" });
    }
    return res.sendStatus(204);
  } catch (error) {
    return tratarErro(error, res);
  }
};

export default {
  getAllRespostas,
  getRespostaById,
  getRespostasByTarefaId,
  postResposta,
  putRespostaById,
  patchRespostaById,
  deleteRespostaById,
};
