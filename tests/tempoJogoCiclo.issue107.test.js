import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import { renovarSessaoJogo, pausarSessaoJogo, encerrarSessaoJogo } from "../services/tempoJogoService.js";
import { baseCiclo, casosCiclo, conferirCiclo, erroCiclo, instante } from "./helpers/tempoJogoCicloIssue107.js";

const funcoes = { renovar: renovarSessaoJogo, pausar: pausarSessaoJogo, encerrar: encerrarSessaoJogo };
const bloqueios = ["connect", "createConnection", "startSession"].map(nome =>
  mock.method(mongoose, nome, () => assert.fail(`MongoDB proibido: ${nome}`)));
bloqueios.push(mock.method(Crianca.collection, "findOneAndUpdate", () => assert.fail("Driver real proibido")));
after(() => {
  try { for (const b of bloqueios) assert.equal(b.mock.callCount(), 0); }
  finally { mock.restoreAll(); }
});

function preparar(t, extras = {}, agora = instante(10000)) {
  t.mock.timers.enable({ apis: ["Date"], now: agora });
  const dados = { _id: new mongoose.Types.ObjectId(), usuarioId: new mongoose.Types.ObjectId(),
    responsavelId: new mongoose.Types.ObjectId(), sessaoJogoSalvoId: new mongoose.Types.ObjectId(),
    legadoIssue107: { preservar: true }, ...baseCiclo(extras) };
  for (const campo of Object.keys(dados)) if (dados[campo] === undefined) delete dados[campo];
  const leituras = [], escritas = [];
  const chamada = t.mock.method(mongoose.Query.prototype, "exec", async function () {
    assert.equal(this.model, Crianca);
    if (this.op === "findOne") {
      assert.deepEqual(this.getFilter(), { usuarioId: dados.usuarioId });
      const copia = Crianca.hydrate(dados);
      leituras.push({ copia, antes: JSON.stringify(copia.toObject()) });
      return copia;
    }
    assert.equal(this.op, "findOneAndUpdate");
    const filtro = this.getFilter(), update = this.getUpdate();
    assert.equal(String(filtro._id), String(dados._id));
    assert.equal(filtro.sessaoJogoId, "sessao-ciclo-107");
    assert.equal(filtro.sessaoJogoEstado, "ativa");
    assert.deepEqual(this.getOptions(), { new: true, runValidators: true });
    assert.deepEqual(update.$inc, { sessaoJogoVersao: 1 });
    if (filtro.$or) assert.deepEqual(filtro.$or, [{ sessaoJogoVersao: 0 }, { sessaoJogoVersao: { $exists: false } }]);
    const versaoFiltro = filtro.$or ? 0 : filtro.sessaoJogoVersao;
    if (versaoFiltro !== (dados.sessaoJogoVersao ?? 0) || filtro.sessaoJogoId !== dados.sessaoJogoId || dados.sessaoJogoEstado !== "ativa") return null;
    assert.ok(Object.keys(update.$set).every(campo => ["tempoUsadoHoje", "dataReferenciaTempo",
      "sessaoJogoContabilizadoEm", "sessaoJogoExpiraEm", "sessaoJogoEstado"].includes(campo)));
    // Simula somente I/O. Validação de atualização e atomicidade são cobertas
    // no arquivo MongoDB; não valida artificialmente todo documento legado.
    for (const [campo, valor] of Object.entries(update.$set)) if (valor !== undefined) dados[campo] = valor;
    dados.sessaoJogoVersao = (dados.sessaoJogoVersao ?? 0) + 1;
    escritas.push(update);
    return Crianca.hydrate(dados);
  });
  t.after(() => {
    for (const { copia, antes } of leituras) assert.equal(JSON.stringify(copia.toObject()), antes);
  });
  return { dados, leituras, escritas, chamada,
    executar: (op, sessaoId = "sessao-ciclo-107") => funcoes[op](dados.usuarioId, sessaoId) };
}

for (const caso of casosCiclo) {
  test(`#107 ciclo: ${caso.nome}`, async t => {
    const f = preparar(t, caso.entrada, caso.agora ?? instante(caso.ms));
    const antes = structuredClone(f.dados);
    let resultado;
    if (caso.erro) await assert.rejects(f.executar(caso.op, caso.sessaoId), erroCiclo(caso.erro));
    else resultado = await f.executar(caso.op, caso.sessaoId);
    // structuredClone mantém ObjectIds como objetos simples, nos dois lados.
    conferirCiclo(antes, structuredClone(f.dados), caso, resultado);
    assert.equal(f.escritas.length, caso.grava === false ? 0 : 1);
  });
}

for (const op of Object.keys(funcoes)) {
  for (const valor of [undefined, null, "", "   ", 42]) {
    test(`#107 ciclo: ${op} com identificador inválido ${String(valor)} não consulta nem escreve`, async t => {
      const f = preparar(t);
      // Chama diretamente para não aplicar o argumento padrão da fixture.
      await assert.rejects(funcoes[op](f.dados.usuarioId, valor), erroCiclo("SESSAO_INVALIDA"));
      assert.equal(f.chamada.mock.callCount(), 0);
    });
  }
  test(`#107 ciclo: ${op} criança inexistente`, async t => {
    const f = preparar(t);
    const leitura = t.mock.method(Crianca, "findOne", async () => null);
    await assert.rejects(f.executar(op), erroCiclo("CRIANCA_NAO_ENCONTRADA"));
    assert.equal(leitura.mock.callCount(), 1);
    assert.equal(f.escritas.length, 0);
  });
  test(`#107 ciclo: ${op} relê e recalcula após conflito`, async t => {
    const f = preparar(t);
    const original = Crianca.findOneAndUpdate;
    let numero = 0;
    t.mock.method(Crianca, "findOneAndUpdate", function (...args) {
      if (++numero === 1) {
        Object.assign(f.dados, { tempoUsadoHoje: 18, sessaoJogoContabilizadoEm: instante(5000), sessaoJogoVersao: 1 });
        t.mock.timers.tick(1000);
        return Promise.resolve(null);
      }
      assert.equal(args[0].sessaoJogoVersao, 1);
      return original.apply(this, args);
    });
    const resultado = await f.executar(op);
    assert.equal(resultado.tempoUsadoHoje, 24); // 18 + (11 - 5), não o total inicial 22.
    assert.deepEqual(f.dados.sessaoJogoContabilizadoEm, instante(11000));
    assert.equal(f.dados.sessaoJogoVersao, 2);
    assert.equal(f.leituras.length, 2);
    assert.equal(numero, 2);
  });
  test(`#107 ciclo: ${op} esgota três conflitos sem quarta escrita`, async t => {
    const f = preparar(t), antes = structuredClone(f.dados);
    const chamada = t.mock.method(Crianca, "findOneAndUpdate", async () => null);
    await assert.rejects(f.executar(op), erroCiclo("CONFLITO_SESSAO"));
    assert.equal(chamada.mock.callCount(), 3);
    assert.equal(f.leituras.length, 3);
    assert.deepEqual(structuredClone(f.dados), antes);
  });
  test(`#107 ciclo: ${op} atrasado não altera sessão nova criada antes da escrita`, async t => {
    const f = preparar(t), original = Crianca.findOneAndUpdate;
    t.mock.method(Crianca, "findOneAndUpdate", function (...args) {
      Object.assign(f.dados, { sessaoJogoId: "sessao-nova", sessaoJogoVersao: 1,
        sessaoJogoContabilizadoEm: instante(10000), sessaoJogoExpiraEm: instante(40000) });
      return original.apply(this, args); // filtro antigo não encontra a sessão nova.
    });
    await assert.rejects(f.executar(op), erroCiclo("SESSAO_INVALIDA"));
    assert.equal(f.dados.sessaoJogoId, "sessao-nova");
    assert.equal(f.dados.tempoUsadoHoje, 12);
    assert.equal(f.dados.sessaoJogoVersao, 1);
    assert.equal(f.escritas.length, 0);
  });
}

test("#107 ciclo: heartbeats sucessivos e repetidos conservam segundos e frações", async t => {
  const f = preparar(t);
  for (const [avanco, total] of [[0, 22], [0, 22], [10000, 32], [1250, 33.25]]) {
    t.mock.timers.tick(avanco);
    assert.equal((await f.executar("renovar")).tempoUsadoHoje, total);
  }
  assert.equal(f.dados.sessaoJogoVersao, 4);
});
for (const op of ["pausar", "encerrar"]) {
  test(`#107 ciclo: repetir ${op} não duplica e não permite novos heartbeats`, async t => {
    const f = preparar(t);
    await f.executar(op);
    const antes = structuredClone(f.dados);
    t.mock.timers.tick(50000);
    await assert.rejects(f.executar(op), erroCiclo("SESSAO_INATIVA"));
    await assert.rejects(f.executar("renovar"), erroCiclo("SESSAO_INATIVA"));
    assert.deepEqual(structuredClone(f.dados), antes);
  });
}
for (const valor of [undefined, null, "data-invalida"]) {
  test(`#107 ciclo robustez: heartbeat não deve renovar com último instante ${String(valor)}`, async t => {
    const f = preparar(t, { sessaoJogoContabilizadoEm: valor });
    let resultado;
    try { resultado = await f.executar("renovar"); }
    catch (erro) { assert.ok(erro instanceof Error); return; }
    t.diagnostic(JSON.stringify({ marcadorEntrada: String(valor), consumo: f.dados.tempoUsadoHoje,
      marcadorPersistido: f.dados.sessaoJogoContabilizadoEm, expiraEm: f.dados.sessaoJogoExpiraEm }));
    if (resultado.estado === "ativa") {
      t.mock.timers.tick(10000);
      const segundo = await f.executar("renovar");
      t.diagnostic(JSON.stringify({ segundoHeartbeat: true, consumo: segundo.tempoUsadoHoje, expiraEm: segundo.expiraEm }));
    }
    assert.notEqual(resultado.estado, "ativa", "Origem desconhecida do consumo não pode ganhar nova validade");
    assert.ok(Number.isFinite(resultado.tempoUsadoHoje));
  });
}
