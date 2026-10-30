import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { preparar, Crianca, Perfil, Jogo, Historico, id } from "./helpers/jogoSalvoMock.js";
import { casosRespostaTempo, dadosTempoResposta, conferirRespostaTempo, instante } from "./helpers/respostaTempoIssue107.js";

async function fixture(t, caso = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: caso.agora ?? instante(10000) });
  const j = await preparar(t), jogo = j.novaPartida();
  const tarefa = caso.tarefa === "segunda" ? j.tarefas[0][1] : caso.tarefa === "outroComodo" ? j.tarefas[1][0] : j.tarefas[0][0];
  const body = j.bodyResposta(jogo, tarefa, caso.correta !== false, caso.dificuldade ?? "facil");
  const infantil = j.dados.get(Crianca).get(String(j.crianca._id));
  Object.assign(infantil, dadosTempoResposta(caso.entrada));
  if (caso.outraPartida) infantil.sessaoJogoSalvoId = id();
  if (caso.semSessao) delete body.sessaoId;
  if (caso.sessaoId) body.sessaoId = caso.sessaoId;
  return { j, jogo, body, infantil };
}
const h = {
  estado: async f => JSON.parse(JSON.stringify({ crianca: f.infantil,
    perfil: f.j.linhas(Perfil).find(p => String(p._id) === String(f.j.perfil._id)),
    jogo: f.j.linhas(Jogo).find(p => String(p._id) === String(f.jogo._id)),
    historicos: f.j.linhas(Historico).filter(p => String(p.jogoSalvoId) === String(f.jogo._id)) })),
  responder: f => f.j.chamar("POST", "/historico-jogo/responder", f.body),
};
for (const caso of casosRespostaTempo) {
  test(`#107 resposta/tempo: ${caso.nome}`, async t => {
    const f = await fixture(t, caso);
    await conferirRespostaTempo(h, f, caso);
    assert.equal(f.j.sessoes.length, caso.transacoes ?? 1);
    assert.ok(f.j.sessoes.every(s => s.encerrada));
    const dentro = f.j.eventos.filter(e => e.opcoes?.session);
    if (dentro.length) assert.ok(dentro.every(e => e.opcoes.session === f.j.sessoes[0]));
    if (caso.codigo && caso.grava !== false) assert.deepEqual(dentro.map(e => e.model), [Crianca, Crianca],
      "Bloqueio temporal deve confirmar somente leitura e consumo da criança");
  });
}
test("#107 resposta/tempo: falha inesperada propaga 500 e encerra a única transação", async t => {
  const f = await fixture(t);
  t.mock.method(Historico, "create", async (docs, opts) => {
    assert.equal(opts.session, f.j.sessoes[0]);
    throw new Error("Falha transacional fictícia");
  });
  assert.deepEqual(await h.responder(f), { status: 500, dados: { erro: true, mensagem: "Erro interno do servidor" } });
  assert.equal(f.j.sessoes.length, 1);
  assert.equal(f.j.sessoes[0].encerrada, true);
  // Não afirma rollback da simulação; a integração real compara todo o estado.
});
test("#107 resposta/tempo: atualização condicional sem correspondência bloqueia antes de estrelas", async t => {
  const f = await fixture(t), antes = await h.estado(f);
  const original = mongoose.Query.prototype.exec;
  t.mock.method(mongoose.Query.prototype, "exec", function () {
    if (this.model === Crianca && this.op === "findOneAndUpdate") return Promise.resolve(null);
    return original.call(this);
  });
  assert.deepEqual(await h.responder(f), { status: 409, dados: { erro: true,
    mensagem: "A sessão de jogo não está disponível", codigo: "CONFLITO_SESSAO" } });
  assert.deepEqual(await h.estado(f), antes);
  assert.equal(f.j.sessoes.length, 1);
});
