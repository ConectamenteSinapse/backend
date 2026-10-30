import mongoose from "mongoose";
import Tarefa from "../../models/tarefaModel.js";
import Resposta from "../../models/respostaModel.js";
import tarefaService from "../../services/tarefaService.js";
import respostaService from "../../services/respostaService.js";
import tarefaController from "../../controllers/tarefaController.js";
import respostaController from "../../controllers/respostaController.js";

export const id = () => new mongoose.Types.ObjectId();
export const serializar = (valor) => JSON.parse(JSON.stringify(valor));
export function dadosTarefa(valores = {}) {
  return {
    _id: id(), titulo: "Tarefa fictícia #90", enunciado: "Escolha uma alternativa",
    descricao: "Fixture exclusiva de teste", comodoId: id(), imagemObjeto: "objeto.png",
    posicao: { x: 0, y: 0, largura: 10, altura: 10 }, ordem: 1,
    ...valores,
  };
}
export function dadosResposta(valores = {}) {
  return { _id: id(), tarefaId: id(), texto: "Alternativa fictícia", correta: false, ordem: 1, ...valores };
}
export const especificacoes = [
  { nome: "tarefa", Model: Tarefa, service: tarefaService, controller: tarefaController,
    campos: ["audioEnunciado"], referencia: "comodoId", dados: dadosTarefa,
    post: "postTarefa", put: "putTarefaById", patch: "patchTarefaById", parametro: "id" },
  { nome: "resposta", Model: Resposta, service: respostaService, controller: respostaController,
    campos: ["imagem", "audio"], referencia: "tarefaId", dados: dadosResposta,
    post: "postResposta", put: "putRespostaById", patch: "patchRespostaById", parametro: "respostaId" },
];
