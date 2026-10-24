import mongoose from "mongoose";
import Comodo from "../../models/comodoModel.js";
import Tarefa from "../../models/tarefaModel.js";
import Resposta from "../../models/respostaModel.js";

import { confirmarModels } from "./atlasSeguro.js";

// Documentos novos; a sessão é opcional nas suítes de commit real.
export async function criarCatalogo(session, ids, identificador = "") {
  confirmarModels(mongoose.connection, [Comodo, Tarefa, Resposta]);
  const primeiroExistente = await Comodo.findOne()
    .sort({ ordem: 1 })
    .session(session)
    .lean();
  // Coloca a sequência temporária antes do catálogo existente, sem editá-lo.
  const inicio = Math.min(0, primeiroExistente?.ordem ?? 0) - 10;
  const nomes = [
    "Quarto",
    "Banheiro",
    "Cozinha",
    "Inativo",
    "Vazio",
    "Só tarefas inativas",
  ];
  const comodos = nomes.map((nome, indice) => ({
    _id: new mongoose.Types.ObjectId(),
    nome,
    descricao: `Cômodo temporário de teste ${identificador}`.trim(),
    imagemCenario: "teste.png",
    ordem: inicio + indice,
    dificuldadesDisponiveis: ["facil", "medio", "dificil"],
    ativo: nome !== "Inativo",
  }));
  ids.comodos.push(...comodos.map((comodo) => comodo._id));
  await Comodo.insertMany(comodos, { session, ordered: true });

  const inexistenteId = new mongoose.Types.ObjectId();
  const tarefas = [];
  function novaTarefa(comodoId, ordem, ativo = true) {
    const tarefa = {
      _id: new mongoose.Types.ObjectId(),
      comodoId,
      titulo: "Tarefa temporária",
      enunciado: "Escolha a alternativa correta",
      descricao: `Dados fictícios de teste ${identificador}`.trim(),
      imagemObjeto: "teste.png",
      posicao: { x: 0, y: 0, largura: 1, altura: 1 },
      ordem,
      ativo,
      dificuldade: "facil",
    };
    tarefas.push(tarefa);
    return tarefa;
  }
  const [quarto, banheiro, cozinha, inativo, vazio, soInativas] = comodos;
  for (const comodo of [quarto, banheiro, cozinha]) {
    comodo.tarefas = [novaTarefa(comodo._id, 1), novaTarefa(comodo._id, 2)];
  }
  inativo.tarefa = novaTarefa(inativo._id, 1);
  soInativas.tarefa = novaTarefa(soInativas._id, 1, false);
  const tarefaOrfa = novaTarefa(inexistenteId, 1);
  ids.tarefas.push(...tarefas.map((tarefa) => tarefa._id));
  await Tarefa.insertMany(tarefas, { session, ordered: true });

  const respostas = tarefas.flatMap((tarefa) => {
    tarefa.correta = {
      _id: new mongoose.Types.ObjectId(),
      tarefaId: tarefa._id,
      texto: "Correta",
      correta: true,
      ordem: 1,
    };
    tarefa.incorreta = {
      _id: new mongoose.Types.ObjectId(),
      tarefaId: tarefa._id,
      texto: "Incorreta",
      correta: false,
      ordem: 2,
    };
    return [tarefa.correta, tarefa.incorreta];
  });
  ids.respostas.push(...respostas.map((resposta) => resposta._id));
  await Resposta.insertMany(respostas, { session, ordered: true });

  // Não é inserida: permite testar uma tentativa sem tarefa cadastrada.
  vazio.tarefaAusente = {
    _id: new mongoose.Types.ObjectId(),
    correta: { _id: new mongoose.Types.ObjectId() },
  };
  return {
    quarto,
    banheiro,
    cozinha,
    inativo,
    vazio,
    soInativas,
    tarefaOrfa,
    inexistenteId,
  };
}
