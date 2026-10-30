import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { preparar, id, Tarefa, Historico, Perfil, Jogo, Comodo } from "./helpers/jogoSalvoMock.js";
import {
  verificarDificuldadeConcluida, verificarDificuldadeDesbloqueada,
  verificarTarefaDesbloqueada, verificarComodoDesbloqueado,
} from "../services/validarProgressaoService.js";
import tarefaController from "../controllers/tarefaController.js";
import { dadosTarefa } from "./helpers/midiaIssue90.js";

const dificuldades = ["facil", "medio", "dificil"];
const pontos = { facil: 1, medio: 2, dificil: 3 };
const estado = j => JSON.stringify([j.linhas(Historico), j.linhas(Jogo), j.linhas(Perfil)]);
function acerto(j, jogo, tarefa, dificuldade, extras = {}) {
  return j.inserir(Historico, {
    ...j.bodyResposta(jogo, tarefa, true, dificuldade),
    criancaId: j.crianca._id, comodoId: tarefa.comodoId,
    acertou: true, tentativa: 1, pontuacaoGanha: pontos[dificuldade], ...extras,
  });
}
for (const dificuldade of dificuldades) {
  test(`#107 conclusão ${dificuldade}: mesmas tarefas ativas; acertos de outra dificuldade/partida não substituem pendências`, async t => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const outra = j.novaPartida();
    const [primeira, segunda] = j.tarefas[0];
    j.inserir(Tarefa, { ...primeira.toObject(), _id: id(), ordem: 99, ativo: false });
    acerto(j, outra, segunda, dificuldade);
    acerto(j, jogo, segunda, dificuldades.find(d => d !== dificuldade));
    acerto(j, jogo, primeira, dificuldade);
    acerto(j, jogo, primeira, dificuldade);
    acerto(j, jogo, segunda, dificuldade, { acertou: false, pontuacaoGanha: 0 });
    assert.equal(await verificarDificuldadeConcluida(jogo._id, primeira.comodoId, dificuldade), false);
    acerto(j, jogo, segunda, dificuldade);
    assert.equal(await verificarDificuldadeConcluida(jogo._id, primeira.comodoId, dificuldade), true);
    assert.equal(await verificarDificuldadeConcluida(jogo._id, j.comodos[1]._id, dificuldade), false);
  });
  test(`#107 ordem ${dificuldade}: mesma sequência, acerto anterior precisa ser da dificuldade e partida atuais`, async t => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const outra = j.novaPartida();
    const [primeira, segunda] = j.tarefas[0];
    assert.equal(await verificarTarefaDesbloqueada(jogo._id, primeira, dificuldade), true);
    acerto(j, outra, primeira, dificuldade);
    acerto(j, jogo, primeira, dificuldades.find(d => d !== dificuldade));
    assert.equal(await verificarTarefaDesbloqueada(jogo._id, segunda, dificuldade), false);
    j.inserir(Tarefa, { ...primeira.toObject(), _id: id(), ordem: 0, ativo: false });
    acerto(j, jogo, primeira, dificuldade);
    assert.equal(await verificarTarefaDesbloqueada(jogo._id, segunda, dificuldade), true);
  });
  test(`#107 ${dificuldade}: cômodo sem tarefas ativas não é concluído, mesmo com histórico`, async t => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    for (const tarefa of j.tarefas[0]) {
      acerto(j, jogo, tarefa, dificuldade);
      j.dados.get(Tarefa).get(String(tarefa._id)).ativo = false;
    }
    assert.equal(await verificarDificuldadeConcluida(jogo._id, j.comodos[0]._id, dificuldade), false);
    assert.equal(await verificarDificuldadeConcluida(jogo._id, id(), dificuldade), false);
  });
}

test("#107 fixtures: duas tarefas únicas por cômodo, sem dificuldade, reutilizadas nos três níveis", async t => {
  const j = await preparar(t);
  assert.equal(new Set(j.tarefas.flat().map(t => String(t._id))).size, 4);
  assert.equal(Tarefa.schema.path("dificuldade"), undefined);
  for (const [indice, comodo] of j.comodos.entries()) {
    await comodo.validate();
    assert.deepEqual(comodo.dificuldadesDisponiveis, dificuldades);
    assert.equal(j.tarefas[indice].length, 2);
    assert.equal(new Set(j.tarefas[indice].map(t => t.ordem)).size, 2);
    for (const tarefa of j.tarefas[indice]) {
      await tarefa.validate();
      assert.equal(Object.hasOwn(tarefa.toObject(), "dificuldade"), false);
    }
  }
});
test("#107 schema aceita tarefa sem dificuldade e mantém ordem única por cômodo", async () => {
  const tarefa = new Tarefa(dadosTarefa());
  await tarefa.validate();
  assert.equal(Object.hasOwn(tarefa.toObject(), "dificuldade"), false);
  assert.ok(Tarefa.schema.indexes().some(([campos, opcoes]) =>
    campos.comodoId === 1 && campos.ordem === 1 && opcoes.unique));
});
test("#107 sequência fácil → médio → difícil exige todos os mesmos IDs na etapa anterior", async t => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  const liberada = d => verificarDificuldadeDesbloqueada(jogo._id, j.comodos[0]._id, d);
  assert.equal(await liberada("facil"), true);
  assert.equal(await liberada("medio"), false);
  assert.equal(await liberada("dificil"), false);
  for (const [anterior, seguinte] of [["facil", "medio"], ["medio", "dificil"]]) {
    const [primeira, segunda] = j.tarefas[0];
    acerto(j, jogo, primeira, anterior);
    assert.equal(await liberada(seguinte), false);
    acerto(j, jogo, segunda, anterior);
    assert.equal(await liberada(seguinte), true);
  }
  assert.equal(await liberada("invalida"), false);
});
test("#107 cômodo seguinte exige todas as tarefas nas três dificuldades da mesma partida", async t => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  const outra = j.novaPartida();
  const liberado = partida => verificarComodoDesbloqueado(partida._id, j.comodos[1]);
  assert.equal(await verificarComodoDesbloqueado(jogo._id, j.comodos[0]), true);
  for (const dificuldade of dificuldades) for (const tarefa of j.tarefas[0]) {
    assert.equal(await liberado(jogo), false);
    acerto(j, jogo, tarefa, dificuldade);
  }
  assert.equal(await liberado(jogo), true);
  assert.equal(await liberado(outra), false);
});
test("#107 HTTP: mesmos IDs, ordem reinicia por nível, erros, bloqueios e pontos por tentativa", async t => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  const outra = j.novaPartida();
  const [primeira, segunda] = j.tarefas[0];
  async function rejeitar(tarefa, dificuldade, codigo, partida = jogo) {
    const antes = estado(j);
    const resultado = await j.responder(partida, tarefa, true, dificuldade);
    assert.equal(resultado.status, 403);
    assert.equal(resultado.dados.codigo, codigo);
    assert.equal(estado(j), antes, "Rejeição não pode alterar histórico, pontuação nem posição");
  }
  let total = 0;
  for (const [indice, dificuldade] of dificuldades.entries()) {
    if (indice > 0) await rejeitar(primeira, dificuldade, "DIFICULDADE_BLOQUEADA", outra);
    await rejeitar(segunda, dificuldade, "TAREFA_FORA_DA_ORDEM");
    assert.deepEqual(await j.responder(jogo, primeira, false, dificuldade), {
      status: 201, dados: { acertou: false, tentativa: 1, pontuacaoGanha: 0, dificuldade },
    });
    await rejeitar(segunda, dificuldade, "TAREFA_FORA_DA_ORDEM");
    for (const [posicao, tarefa] of [primeira, segunda].entries()) {
      assert.deepEqual(await j.responder(jogo, tarefa, true, dificuldade), {
        status: 201, dados: { acertou: true, tentativa: posicao === 0 ? 2 : 1,
          pontuacaoGanha: pontos[dificuldade], dificuldade },
      });
      total += pontos[dificuldade];
      assert.equal(j.linhas(Jogo).find(d => String(d._id) === String(jogo._id)).estrelasTotal, total);
      if (posicao === 0 && indice < 2) await rejeitar(primeira, dificuldades[indice + 1], "DIFICULDADE_BLOQUEADA");
      if (indice < 2 || posicao === 0) await rejeitar(j.tarefas[1][0], "facil", "COMODO_BLOQUEADO");
    }
    assert.deepEqual(j.linhas(Historico).filter(h => h.dificuldade === dificuldade)
      .map(h => String(h.tarefaId)), [primeira, primeira, segunda].map(t => String(t._id)));
  }
  assert.equal(total, 12);
  assert.equal((await j.responder(jogo, j.tarefas[1][0], true, "facil")).status, 201);
  await rejeitar(j.tarefas[1][0], "facil", "COMODO_BLOQUEADO", outra);
  assert.equal(j.linhas(Historico).length, 10);
});
for (const dificuldade of ["impossivel", "", null, undefined]) {
  test(`#107 dificuldade inválida/ausente ${String(dificuldade)}: HTTP 400 sem efeitos`, async t => {
    const j = await preparar(t);
    const jogo = j.novaPartida({ estrelasTotal: 7 });
    acerto(j, jogo, j.tarefas[0][0], "facil");
    const antes = estado(j);
    const body = { ...j.bodyResposta(jogo), dificuldade };
    assert.equal((await j.chamar("POST", "/historico-jogo/responder", body)).status, 400);
    assert.equal(estado(j), antes);
    assert.equal(j.sessoes.length, 0);
  });
}
for (const [nome, metodo, status] of [["cadastro", "postTarefa", 201], ["PUT", "putTarefaById", 200], ["PATCH", "patchTarefaById", 200]]) {
  test(`#107 Controller/Service: ${nome} de tarefa sem dificuldade`, async t => {
    for (const m of ["connect", "createConnection"]) t.mock.method(mongoose, m, () => assert.fail("MongoDB proibido"));
    const base = dadosTarefa();
    const escrito = [];
    t.mock.method(Comodo, "findById", async () => ({ _id: base.comodoId }));
    t.mock.method(Tarefa, "create", async dados => {
      const doc = new Tarefa(dados); await doc.validate(); escrito.push(doc.toObject()); return doc;
    });
    t.mock.method(Tarefa, "findByIdAndUpdate", async (chave, dados, opcoes) => {
      assert.equal(String(chave), String(base._id)); assert.equal(opcoes.runValidators, true);
      const doc = new Tarefa({ ...base, ...dados }); await doc.validate(); escrito.push(doc.toObject()); return doc;
    });
    const body = nome === "PATCH" ? { titulo: "Alterada" } : { ...base, titulo: "Alterada" };
    assert.equal(Object.hasOwn(body, "dificuldade"), false);
    const res = { status(n) { this.codigo = n; return this; }, json(d) { this.dados = d; return this; } };
    await tarefaController[metodo]({ body, params: { id: String(base._id) } }, res);
    assert.equal(res.codigo, status);
    assert.equal(escrito.length, 1);
    assert.equal(escrito[0].titulo, "Alterada");
    assert.equal(Object.hasOwn(escrito[0], "dificuldade"), false);
  });
}
test("#107 tarefa legada com campo dificuldade continua jogável nos três níveis", async t => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  j.dados.get(Tarefa).get(String(j.tarefas[0][0]._id)).dificuldade = "dificil";
  const antes = JSON.stringify(j.linhas(Tarefa));
  for (const dificuldade of dificuldades) for (const tarefa of j.tarefas[0]) {
    assert.equal((await j.responder(jogo, tarefa, true, dificuldade)).status, 201);
  }
  assert.equal(JSON.stringify(j.linhas(Tarefa)), antes);
  assert.equal(j.linhas(Historico).length, 6);
});
