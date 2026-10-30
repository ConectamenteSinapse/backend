import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";

// Instrumentação apenas em memória, como nas duas suítes de tempo existentes.
const url = new URL("../services/tempoJogoService.js", import.meta.url);
const bloqueios = [
  mock.method(mongoose, "connect", () => assert.fail("MongoDB proibido nesta suíte")),
  mock.method(mongoose, "createConnection", () => assert.fail("MongoDB proibido nesta suíte")),
  mock.method(mongoose, "startSession", () => assert.fail("MongoDB proibido nesta suíte")),
  mock.method(Crianca.collection, "findOneAndUpdate", () => assert.fail("Driver não simulado")),
];
after(() => {
  try { for (const bloqueio of bloqueios) assert.equal(bloqueio.mock.callCount(), 0); }
  finally { mock.restoreAll(); }
});
const hooks = registerHooks({
  load(endereco, contexto, next) {
    const resultado = next(endereco, contexto);
    if (endereco !== url.href) return resultado;
    return { ...resultado, source: `${readFileSync(url, "utf8")}\nexport { atualizarConsumoCondicional };\n` };
  },
});
let atualizarConsumoCondicional;
try { ({ atualizarConsumoCondicional } = await import(url.href)); }
finally { hooks.deregister(); }

const id = () => new mongoose.Types.ObjectId();
const crianca = extras => ({ _id: id(), usuarioId: id(), sessaoJogoVersao: 0,
  limiteTempoDiario: 1, tempoUsadoHoje: 12, ...extras });
const consumo = extras => ({ dataReferenciaTempo: "2026-10-29", tempoUsadoHoje: 22,
  sessaoJogoContabilizadoEm: new Date("2026-10-29T15:00:10Z"), ...extras });

test("#107 condicional: exports públicos permanecem intactos", async () => {
  const publico = await import(`${url.href}?api-publica-condicional`);
  assert.deepEqual(Object.keys(publico), ["encerrarSessaoJogo", "iniciarSessaoJogo", "pausarSessaoJogo", "reconciliarSessaoParaResposta", "renovarSessaoJogo"]);
});

for (const versao of [undefined, 0, 7]) {
  test(`#107 condicional: filtro e incremento para versão ${versao ?? "ausente"}`, async t => {
    const entrada = crianca();
    if (versao === undefined) delete entrada.sessaoJogoVersao;
    else entrada.sessaoJogoVersao = versao;
    const novo = consumo();
    const retorno = { ...entrada, ...novo, sessaoJogoVersao: (versao ?? 0) + 1 };
    const chamada = t.mock.method(Crianca, "findOneAndUpdate", async (filtro, atualizacao, opcoes) => {
      assert.deepEqual(filtro, versao === undefined || versao === 0
        ? { _id: entrada._id, $or: [{ sessaoJogoVersao: 0 }, { sessaoJogoVersao: { $exists: false } }] }
        : { _id: entrada._id, sessaoJogoVersao: versao });
      assert.deepEqual(atualizacao, { $set: novo, $inc: { sessaoJogoVersao: 1 } });
      assert.deepEqual(opcoes, { new: true, runValidators: true });
      return retorno;
    });
    assert.strictEqual(await atualizarConsumoCondicional(entrada, novo), retorno);
    assert.equal(chamada.mock.callCount(), 1);
  });
}

test("#107 condicional: só os campos de consumo são enviados ao $set", async t => {
  const novo = consumo();
  const chamada = t.mock.method(Crianca, "findOneAndUpdate", async () => null);
  await atualizarConsumoCondicional(crianca(), { ...novo, usuarioId: id(), permissaoAtiva: false,
    limiteTempoDiario: null, sessaoJogoVersao: 999, sessaoJogoEstado: "encerrada" });
  assert.deepEqual(chamada.mock.calls[0].arguments[1], { $set: novo, $inc: { sessaoJogoVersao: 1 } });
});

test("#107 condicional: conflito retorna null sem repetição automática", async t => {
  const chamada = t.mock.method(Crianca, "findOneAndUpdate", async () => null);
  assert.equal(await atualizarConsumoCondicional(crianca({ sessaoJogoVersao: 3 }), consumo()), null);
  assert.equal(chamada.mock.callCount(), 1);
});

test("#107 condicional: erro do Model é propagado sem repetir a escrita", async t => {
  const erro = new Error("falha simulada do driver");
  const chamada = t.mock.method(Crianca, "findOneAndUpdate", async () => { throw erro; });
  await assert.rejects(atualizarConsumoCondicional(crianca(), consumo()), e => e === erro);
  assert.equal(chamada.mock.callCount(), 1);
});

test("#107 condicional: não modifica snapshot nem novo consumo recebidos", async t => {
  const entrada = crianca();
  const novo = consumo();
  const antes = structuredClone({ entrada, novo });
  t.mock.method(Crianca, "findOneAndUpdate", async () => null);
  await atualizarConsumoCondicional(entrada, novo);
  assert.deepEqual(structuredClone({ entrada, novo }), antes);
});

// Nestes casos não simulamos o Model nem Query.exec: casting e validadores
// de atualização do Mongoose são reais. O driver só é simulado após validar.
for (const valor of [-1, -0.001]) {
  test(`#107 condicional: consumo ${valor} é rejeitado antes do driver`, async () => {
    await assert.rejects(atualizarConsumoCondicional(crianca(), consumo({ tempoUsadoHoje: valor })), erro => {
      assert.equal(erro.name, "ValidationError");
      assert.equal(erro.errors.tempoUsadoHoje.kind, "min");
      return true;
    });
  });
}
for (const valor of [0, 10.25, 69]) {
  test(`#107 condicional: consumo ${valor} passa pelo Mongoose sem truncar no limite`, async t => {
    const entrada = crianca();
    const novo = consumo({ tempoUsadoHoje: valor });
    const chamada = t.mock.method(Crianca.collection, "findOneAndUpdate", async (filtro, update) => {
      assert.equal(update.$set.tempoUsadoHoje, valor);
      assert.equal(update.$inc.sessaoJogoVersao, 1);
      return { ...entrada, ...novo, sessaoJogoVersao: 1 };
    });
    const resultado = await atualizarConsumoCondicional(entrada, novo);
    assert.equal(resultado.tempoUsadoHoje, valor);
    assert.equal(resultado.limiteTempoDiario, 1);
    assert.equal(resultado.sessaoJogoVersao, 1);
    assert.equal(chamada.mock.callCount(), 1);
  });
}

test("#107 condicional: documento legado hidratado usa filtro compatível com ausência física", async t => {
  const legado = Crianca.hydrate({ _id: id(), usuarioId: id() });
  assert.equal(legado.sessaoJogoVersao, 0);
  const chamada = t.mock.method(Crianca, "findOneAndUpdate", async () => null);
  await atualizarConsumoCondicional(legado, consumo());
  assert.deepEqual(chamada.mock.calls[0].arguments[0].$or,
    [{ sessaoJogoVersao: 0 }, { sessaoJogoVersao: { $exists: false } }]);
});
