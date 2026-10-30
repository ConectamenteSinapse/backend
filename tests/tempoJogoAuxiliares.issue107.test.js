import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";

// Mesmo mecanismo nativo usado na #62: instrumenta SOMENTE o módulo alvo,
// em memória, neste processo de teste. Não reescreve funções nem imports.
// O arquivo de produção e sua API pública permanecem inalterados.
const nomes = ["obterDataSaoPaulo", "possuiTempoDisponivel", "obterFimIntervalo",
  "calcularSegundosIntervalo", "obterProximaMeiaNoite", "dividirIntervaloPorDia"];
const url = new URL("../services/tempoJogoService.js", import.meta.url);
const bloqueios = [
  mock.method(mongoose, "connect", () => assert.fail("MongoDB proibido nesta suíte")),
  mock.method(mongoose, "createConnection", () => assert.fail("MongoDB proibido nesta suíte")),
  mock.method(mongoose, "startSession", () => assert.fail("Sessão MongoDB proibida nesta suíte")),
  mock.method(mongoose.Query.prototype, "exec", () => assert.fail("Query MongoDB proibida nesta suíte")),
];
after(() => {
  try { for (const bloqueio of bloqueios) assert.equal(bloqueio.mock.callCount(), 0); }
  finally { mock.restoreAll(); }
});
const hooks = registerHooks({
  load(endereco, contexto, next) {
    const resultado = next(endereco, contexto);
    if (endereco !== url.href) return resultado;
    return { ...resultado, source: `${readFileSync(url, "utf8")}\nexport { ${nomes.join(", ")} };\n` };
  },
});
let auxiliares;
try { auxiliares = await import(url.href); }
finally { hooks.deregister(); }
const { obterDataSaoPaulo, possuiTempoDisponivel, obterFimIntervalo,
  calcularSegundosIntervalo, obterProximaMeiaNoite, dividirIntervaloPorDia } = auxiliares;
const data = texto => new Date(texto);
const inicio = () => data("2026-10-29T03:00:00.000Z");
const instante = ms => new Date(inicio().getTime() + ms);
const sessao = extras => ({ sessaoJogoEstado: "ativa", sessaoJogoContabilizadoEm: inicio(),
  sessaoJogoExpiraEm: instante(30000), ...extras });
const consumo = extras => ({ limiteTempoDiario: 1, tempoUsadoHoje: 0,
  dataReferenciaTempo: "2026-10-29", ...extras });

// Contrato defensivo para datas inválidas: rejeição explícita OU ausência de
// intervalo/consumo. Não impõe mensagem/classe de erro ainda não definida.
// Nunca aceita Date inválida, NaN ou um intervalo com origem desconhecida.
function semConsumoInvalido(fn, vazio) {
  let resultado;
  try { resultado = fn(); }
  catch (erro) { assert.ok(erro instanceof Error); return; }
  // O reporter TAP do Node 24 tenta chamar toISOString() em Date inválida.
  // Normaliza só o diagnóstico da asserção, sem adaptar o resultado do Service.
  const diagnostico = resultado instanceof Date
    ? (Number.isFinite(resultado.getTime()) ? resultado.toISOString() : "Invalid Date")
    : resultado;
  assert.deepEqual(diagnostico, vazio, "Data inválida não pode produzir intervalo nem consumo inválido");
}

test("#107 tempo: instrumentação não altera os exports públicos do Service", async () => {
  const publico = await import(`${url.href}?api-publica-sem-instrumentacao`);
  assert.deepEqual(Object.keys(publico), ["encerrarSessaoJogo", "iniciarSessaoJogo", "pausarSessaoJogo", "reconciliarSessaoParaResposta", "renovarSessaoJogo"]);
  assert.ok(nomes.every(nome => typeof auxiliares[nome] === "function"));
});

for (const [entrada, esperado] of [
  ["2026-10-29T02:59:59.999Z", "2026-10-28"],
  ["2026-10-29T03:00:00.000Z", "2026-10-29"],
  ["2026-10-29T23:59:59.999Z", "2026-10-29"],
  ["2027-01-01T02:59:59.999Z", "2026-12-31"],
  ["2027-01-01T03:00:00.000Z", "2027-01-01"],
  ["2024-03-01T02:59:59.999Z", "2024-02-29"],
  ["2026-10-29T00:00:00-03:00", "2026-10-29"],
]) {
  test(`#107 tempo: data São Paulo ${entrada}`, () => assert.equal(obterDataSaoPaulo(data(entrada)), esperado));
}
test("#107 tempo: data omitida usa o relógio do servidor", t => {
  t.mock.timers.enable({ apis: ["Date"], now: data("2026-10-29T02:59:59.999Z") });
  assert.equal(obterDataSaoPaulo(), "2026-10-28");
});
test("#107 tempo: conversão de Date inválida falha explicitamente", () => {
  assert.throws(() => obterDataSaoPaulo(new Date(NaN)), RangeError);
});

for (const [nome, campos, esperado] of [
  ["um minuto equivale a 60 segundos", { tempoUsadoHoje: 59 }, true],
  ["fração imediatamente antes do limite", { tempoUsadoHoje: 59.999 }, true],
  ["limite exato está esgotado", { tempoUsadoHoje: 60 }, false],
  ["fração acima do limite", { tempoUsadoHoje: 60.001 }, false],
  ["zero segundos consumidos", {}, true],
  ["dois minutos equivalem a 120 segundos", { limiteTempoDiario: 2, tempoUsadoHoje: 119.999 }, true],
  ["dois minutos esgotados", { limiteTempoDiario: 2, tempoUsadoHoje: 120 }, false],
  ["null sem consumo", { limiteTempoDiario: null }, true],
  ["null com consumo elevado", { limiteTempoDiario: null, tempoUsadoHoje: 999999 }, true],
  ["dia anterior não consome hoje", { dataReferenciaTempo: "2026-10-28", tempoUsadoHoje: 999 }, true],
  ["referência ausente inicia saldo lógico do dia", { dataReferenciaTempo: null, tempoUsadoHoje: 999 }, true],
  ["zero legado bloqueia, não equivale a null", { limiteTempoDiario: 0 }, false],
]) {
  test(`#107 tempo: disponibilidade — ${nome}`, () => {
    assert.equal(possuiTempoDisponivel(consumo(campos), "2026-10-29"), esperado);
  });
}
test("#107 tempo: disponibilidade compartilhada por criança, independente da partida", () => {
  const crianca = consumo({ tempoUsadoHoje: 60 });
  for (const partida of [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]) {
    assert.equal(possuiTempoDisponivel({ ...crianca, sessaoJogoSalvoId: partida }, "2026-10-29"), false);
  }
});
test("#107 tempo: aceita documento Mongoose e preserva consumo ao consultar outro dia", () => {
  const crianca = new Crianca({ usuarioId: new mongoose.Types.ObjectId(), ...consumo({ tempoUsadoHoje: 60 }) });
  const antes = crianca.toObject();
  assert.equal(possuiTempoDisponivel(crianca, "2026-10-29"), false);
  assert.equal(possuiTempoDisponivel(crianca, "2026-10-30"), true);
  assert.deepEqual(crianca.toObject(), antes);
});

for (const [nome, agoraMs, extras, fimMs] of [
  ["primeiro heartbeat de dez segundos", 10000, {}, 10000],
  ["um milissegundo antes da expiração", 29999, {}, 29999],
  ["exatamente na expiração", 30000, {}, 30000],
  ["um milissegundo depois da expiração", 30001, {}, 30000],
  ["muito depois da expiração", 86400000, {}, 30000],
  ["agora igual ao início", 0, {}, null],
  ["relógio anterior ao início", -1, {}, null],
  ["expiração igual ao início", 10000, { sessaoJogoExpiraEm: instante(0) }, null],
  ["expiração anterior ao início", 10000, { sessaoJogoExpiraEm: instante(-1) }, null],
  ["sem instante contabilizado", 10000, { sessaoJogoContabilizadoEm: null }, null],
  ["sem expiração", 10000, { sessaoJogoExpiraEm: null }, null],
]) {
  test(`#107 tempo: fim do intervalo — ${nome}`, () => {
    const resultado = obterFimIntervalo(sessao(extras), instante(agoraMs));
    assert.deepEqual(resultado, fimMs === null ? null : instante(fimMs));
  });
}
test("#107 tempo: fim omitido usa o relógio do servidor e respeita validade", t => {
  t.mock.timers.enable({ apis: ["Date"], now: instante(45000) });
  assert.deepEqual(obterFimIntervalo(sessao()), instante(30000));
});
for (const estado of ["pausada", "encerrada"]) {
  test(`#107 tempo: sessão ${estado} não fornece intervalo contabilizável`, () => {
    assert.equal(obterFimIntervalo(sessao({ sessaoJogoEstado: estado }), instante(10000)), null);
  });
}
for (const campo of ["sessaoJogoContabilizadoEm", "sessaoJogoExpiraEm"]) {
  test(`#107 tempo robustez: ${campo} inválido não gera intervalo`, () => {
    semConsumoInvalido(() => obterFimIntervalo(sessao({ [campo]: new Date(NaN) }), instante(10000)), null);
  });
}
test("#107 tempo robustez: agora inválido não gera intervalo", () => {
  semConsumoInvalido(() => obterFimIntervalo(sessao(), new Date(NaN)), null);
});

for (const [nome, duracaoMs, segundos] of [
  ["dez segundos", 10000, 10], ["trinta segundos", 30000, 30],
  ["duração zero", 0, 0], ["duração negativa", -1000, 0],
  ["um milissegundo", 1, 0.001], ["fração de segundo", 1234, 1.234],
  ["intervalo maior que um dia", 86400500, 86400.5],
]) {
  test(`#107 tempo: calcular segundos — ${nome}`, () => {
    assert.equal(calcularSegundosIntervalo(inicio(), instante(duracaoMs)), segundos);
  });
}
for (const [nome, ini, fim] of [["início ausente", null, inicio()], ["fim ausente", inicio(), undefined]]) {
  test(`#107 tempo: ${nome} resulta em zero`, () => assert.equal(calcularSegundosIntervalo(ini, fim), 0));
}
for (const [nome, ini, fim] of [["início", new Date(NaN), inicio()], ["fim", inicio(), new Date(NaN)]]) {
  test(`#107 tempo robustez: ${nome} inválido não retorna NaN como consumo`, () => {
    semConsumoInvalido(() => calcularSegundosIntervalo(ini, fim), 0);
  });
}

for (const [entrada, esperado] of [
  ["2026-10-29T02:59:59.999Z", "2026-10-29T03:00:00.000Z"],
  ["2026-10-29T03:00:00.000Z", "2026-10-30T03:00:00.000Z"],
  ["2026-10-31T16:00:00.000Z", "2026-11-01T03:00:00.000Z"],
  ["2026-12-31T16:00:00.000Z", "2027-01-01T03:00:00.000Z"],
  ["2024-02-28T16:00:00.000Z", "2024-02-29T03:00:00.000Z"],
  ["2018-11-04T03:00:00.000Z", "2018-11-05T02:00:00.000Z"],
  ["2019-02-16T02:00:00.000Z", "2019-02-17T03:00:00.000Z"],
]) {
  test(`#107 tempo: próxima mudança de dia de São Paulo a partir de ${entrada}`, () => {
    const atual = data(entrada);
    const resultado = obterProximaMeiaNoite(atual);
    assert.equal(resultado.toISOString(), esperado);
    assert.equal(obterDataSaoPaulo(new Date(resultado.getTime() - 1)), obterDataSaoPaulo(atual));
    assert.notEqual(obterDataSaoPaulo(resultado), obterDataSaoPaulo(atual));
  });
}
test("#107 tempo: próxima meia-noite rejeita Date inválida", () => {
  assert.throws(() => obterProximaMeiaNoite(new Date(NaN)), RangeError);
});

for (const [nome, ini, fim, esperado] of [
  ["mesmo dia com fração", "2026-10-29T03:00:00.000Z", "2026-10-29T03:00:10.125Z", [{ data: "2026-10-29", segundos: 10.125 }]],
  ["duração zero", "2026-10-29T03:00:00Z", "2026-10-29T03:00:00Z", []],
  ["duração negativa", "2026-10-29T03:00:01Z", "2026-10-29T03:00:00Z", []],
  ["dois dias locais", "2026-10-29T02:59:50Z", "2026-10-29T03:00:10Z", [{ data: "2026-10-28", segundos: 10 }, { data: "2026-10-29", segundos: 10 }]],
  ["um milissegundo em cada dia", "2026-10-29T02:59:59.999Z", "2026-10-29T03:00:00.001Z", [{ data: "2026-10-28", segundos: 0.001 }, { data: "2026-10-29", segundos: 0.001 }]],
  ["fim exatamente à meia-noite", "2026-10-29T02:59:50Z", "2026-10-29T03:00:00Z", [{ data: "2026-10-28", segundos: 10 }]],
  ["três dias e virada do ano", "2026-12-31T02:59:50Z", "2027-01-01T03:00:10Z", [{ data: "2026-12-30", segundos: 10 }, { data: "2026-12-31", segundos: 86400 }, { data: "2027-01-01", segundos: 10 }]],
  ["dia bissexto inteiro", "2024-02-29T03:00:00Z", "2024-03-01T03:00:00Z", [{ data: "2024-02-29", segundos: 86400 }]],
  ["dia histórico de 23 horas", "2018-11-04T03:00:00Z", "2018-11-05T02:00:00Z", [{ data: "2018-11-04", segundos: 82800 }]],
  ["dia histórico de 25 horas", "2019-02-16T02:00:00Z", "2019-02-17T03:00:00Z", [{ data: "2019-02-16", segundos: 90000 }]],
]) {
  test(`#107 tempo: divisão — ${nome}`, () => {
    const resultado = dividirIntervaloPorDia(data(ini), data(fim));
    assert.deepEqual(resultado, esperado);
    assert.ok(resultado.every(trecho => Number.isFinite(trecho.segundos) && trecho.segundos > 0));
    assert.ok(Math.abs(resultado.reduce((n, trecho) => n + trecho.segundos, 0) - calcularSegundosIntervalo(data(ini), data(fim))) < 1e-9);
  });
}
test("#107 tempo: composição limita validade antes de dividir na meia-noite", () => {
  const crianca = sessao({ sessaoJogoContabilizadoEm: data("2026-10-29T02:59:50Z"),
    sessaoJogoExpiraEm: data("2026-10-29T03:00:20Z") });
  const fim = obterFimIntervalo(crianca, data("2026-10-29T04:00:00Z"));
  assert.deepEqual(dividirIntervaloPorDia(crianca.sessaoJogoContabilizadoEm, fim), [
    { data: "2026-10-28", segundos: 10 }, { data: "2026-10-29", segundos: 20 },
  ]);
});
test("#107 tempo: sequência de heartbeats não perde frações nem ultrapassa 30 segundos", () => {
  let contabilizado = inicio();
  let total = 0;
  for (const ms of [10000, 20000, 29999, 30001, 60000]) {
    const fim = obterFimIntervalo(sessao({ sessaoJogoContabilizadoEm: contabilizado }), instante(ms));
    total += calcularSegundosIntervalo(contabilizado, fim);
    if (fim) contabilizado = fim;
  }
  // A soma em ponto flutuante admite somente erro muito menor que 1 ms.
  assert.ok(Math.abs(total - 30) < 1e-12);
  assert.equal(contabilizado.getTime(), instante(30000).getTime());
});
test("#107 tempo: auxiliares não modificam datas nem documento de entrada", () => {
  const crianca = sessao();
  const agora = instante(10000);
  const antes = JSON.stringify({ crianca, agora });
  const fim = obterFimIntervalo(crianca, agora);
  obterDataSaoPaulo(agora); obterProximaMeiaNoite(agora);
  calcularSegundosIntervalo(crianca.sessaoJogoContabilizadoEm, fim);
  dividirIntervaloPorDia(crianca.sessaoJogoContabilizadoEm, fim);
  assert.equal(JSON.stringify({ crianca, agora }), antes);
});
