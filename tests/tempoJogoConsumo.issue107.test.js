import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";

// Padrão da suíte auxiliar: expõe a função privada somente em memória,
// preservando o corpo original, os imports e a API pública de produção.
const url = new URL("../services/tempoJogoService.js", import.meta.url);
const bloqueios = [
  mock.method(mongoose, "connect", () => assert.fail("MongoDB proibido nesta suíte")),
  mock.method(mongoose, "createConnection", () => assert.fail("MongoDB proibido nesta suíte")),
  mock.method(mongoose, "startSession", () => assert.fail("Sessão MongoDB proibida nesta suíte")),
  mock.method(mongoose.Query.prototype, "exec", () => assert.fail("Query MongoDB proibida nesta suíte")),
];
after(() => {
  try {
    for (const bloqueio of bloqueios) assert.equal(bloqueio.mock.callCount(), 0);
  } finally {
    mock.restoreAll();
  }
});
const hooks = registerHooks({
  load(endereco, contexto, next) {
    const resultado = next(endereco, contexto);
    if (endereco !== url.href) return resultado;
    return { ...resultado, source: `${readFileSync(url, "utf8")}\nexport { calcularNovoConsumo };\n` };
  },
});
let calcularNovoConsumo;
try {
  ({ calcularNovoConsumo } = await import(url.href));
} finally {
  hooks.deregister();
}

const data = texto => new Date(texto);
const inicio = () => data("2026-10-29T15:00:00.000Z");
const instante = ms => new Date(inicio().getTime() + ms);
const crianca = extras => ({
  limiteTempoDiario: 1,
  tempoUsadoHoje: 12,
  dataReferenciaTempo: "2026-10-29",
  sessaoJogoEstado: "ativa",
  sessaoJogoContabilizadoEm: inicio(),
  sessaoJogoExpiraEm: instante(30000),
  ...extras,
});
const virada = extras => crianca({
  tempoUsadoHoje: 100,
  dataReferenciaTempo: "2026-10-28",
  sessaoJogoContabilizadoEm: data("2026-10-29T02:59:50Z"),
  sessaoJogoExpiraEm: data("2026-10-29T03:00:20Z"),
  ...extras,
});

// Evita o problema do reporter TAP do Node 24 ao serializar Date inválida.
// Só adapta o diagnóstico; nenhum resultado do Service é corrigido.
const marcador = valor => valor instanceof Date
  ? (Number.isFinite(valor.getTime()) ? valor.toISOString() : "Invalid Date")
  : valor;
function conferir(resultado, dia, segundos, contabilizado) {
  const { tempoUsadoHoje, ...demais } = resultado;
  assert.deepEqual({ ...demais, sessaoJogoContabilizadoEm: marcador(resultado.sessaoJogoContabilizadoEm) }, {
    dataReferenciaTempo: dia,
    sessaoJogoContabilizadoEm: marcador(contabilizado),
  });
  assert.ok(Number.isFinite(tempoUsadoHoje));
  // Mesma tolerância da suíte auxiliar: não exige igualdade binária de somas
  // decimais, mas detecta perda de 1 ms e qualquer erro de regra de negócio.
  assert.ok(Math.abs(tempoUsadoHoje - segundos) < 1e-12,
    `Esperado ${segundos} segundos; obtido ${tempoUsadoHoje}`);
}
// O próximo cálculo recebe o estado completo com os três campos retornados,
// como ocorrerá após uma atualização condicional bem-sucedida no banco.
const aplicar = (estado, resultado) => ({ ...estado, ...resultado });

test("#107 consumo: instrumentação preserva os exports públicos", async () => {
  const publico = await import(`${url.href}?api-publica-consumo`);
  assert.deepEqual(Object.keys(publico), ["encerrarSessaoJogo", "iniciarSessaoJogo", "pausarSessaoJogo", "reconciliarSessaoParaResposta", "renovarSessaoJogo"]);
  assert.equal(typeof calcularNovoConsumo, "function");
});

for (const [nome, ms, extras, segundos, fim] of [
  ["dez segundos somados ao consumo anterior", 10000, {}, 22, 10000],
  ["primeiro consumo do dia", 10000, { tempoUsadoHoje: 0 }, 10, 10000],
  ["intervalo de duração zero", 0, {}, 12, 0],
  ["relógio anterior ao último instante", -1, {}, 12, 0],
  ["um milissegundo", 1, {}, 12.001, 1],
  ["fração de segundo", 1234, {}, 13.234, 1234],
  ["um milissegundo antes da expiração", 29999, {}, 41.999, 29999],
  ["exatamente na expiração", 30000, {}, 42, 30000],
  ["um milissegundo após a expiração", 30001, {}, 42, 30000],
  ["sessão expirada há horas no mesmo dia", 3600000, {}, 42, 30000],
  ["limite null continua acumulando", 10000, { limiteTempoDiario: null, tempoUsadoHoje: 9000 }, 9010, 10000],
  // Caracterização: reconciliar consumo não equivale a autorizar jogar.
  ["ultrapassa um minuto sem truncar ou bloquear", 10000, { tempoUsadoHoje: 59 }, 69, 10000],
  ["consumo já acima do limite continua reconciliado", 10000, { tempoUsadoHoje: 70 }, 80, 10000],
  ["referência anterior difere do dia da sessão", 10000, { dataReferenciaTempo: "2026-10-28", tempoUsadoHoje: 999 }, 10, 10000],
  ["referência futura difere do dia da sessão", 10000, { dataReferenciaTempo: "2026-10-30", tempoUsadoHoje: 999 }, 10, 10000],
  ["referência null renova consumo", 10000, { dataReferenciaTempo: null }, 10, 10000],
  ["referência ausente renova consumo", 10000, { dataReferenciaTempo: undefined }, 10, 10000],
]) {
  test(`#107 consumo: ${nome}`, () => {
    conferir(calcularNovoConsumo(crianca(extras), instante(ms)), "2026-10-29", segundos, instante(fim));
  });
}

for (const estado of ["pausada", "encerrada", undefined]) {
  test(`#107 consumo: estado ${estado ?? "ausente"} preserva consumo e instante no mesmo dia`, () => {
    conferir(calcularNovoConsumo(crianca({ sessaoJogoEstado: estado }), instante(10000)), "2026-10-29", 12, inicio());
  });
  test(`#107 consumo: estado ${estado ?? "ausente"} renova consumo no dia seguinte sem acrescentar segundos`, () => {
    conferir(calcularNovoConsumo(crianca({ sessaoJogoEstado: estado }), data("2026-10-30T03:00:00Z")), "2026-10-30", 0, inicio());
  });
}

for (const [nome, agora, extras, dia, segundos, fim] of [
  ["antes da meia-noite conserva consumo antigo", "2026-10-29T02:59:55Z", {}, "2026-10-28", 105, "2026-10-29T02:59:55Z"],
  ["exatamente à meia-noite renova consumo", "2026-10-29T03:00:00Z", {}, "2026-10-29", 0, "2026-10-29T03:00:00Z"],
  ["primeira operação após a meia-noite", "2026-10-29T03:00:10Z", {}, "2026-10-29", 10, "2026-10-29T03:00:10Z"],
  ["primeira operação exatamente na expiração", "2026-10-29T03:00:20Z", {}, "2026-10-29", 20, "2026-10-29T03:00:20Z"],
  ["primeira operação após a expiração não perde vinte segundos do novo dia", "2026-10-29T04:00:00Z", {}, "2026-10-29", 20, "2026-10-29T03:00:20Z"],
  ["referência já é do novo dia e conserva consumo existente", "2026-10-29T04:00:00Z", { dataReferenciaTempo: "2026-10-29", tempoUsadoHoje: 7 }, "2026-10-29", 27, "2026-10-29T03:00:20Z"],
  ["referência muito antiga renova e conserva trecho de hoje", "2026-10-29T04:00:00Z", { dataReferenciaTempo: "2020-01-01", tempoUsadoHoje: 999 }, "2026-10-29", 20, "2026-10-29T03:00:20Z"],
  ["expiração exatamente à meia-noite não consome no novo dia", "2026-10-29T04:00:00Z", { sessaoJogoExpiraEm: data("2026-10-29T03:00:00Z") }, "2026-10-29", 0, "2026-10-29T03:00:00Z"],
  ["expiração antes da meia-noite não consome no novo dia", "2026-10-29T04:00:00Z", { sessaoJogoExpiraEm: data("2026-10-29T02:59:59Z") }, "2026-10-29", 0, "2026-10-29T02:59:59Z"],
  ["vinte e quatro horas depois não transporta consumo de ontem", "2026-10-30T03:00:10Z", {}, "2026-10-30", 0, "2026-10-29T03:00:20Z"],
  ["meses de inatividade não geram consumo além da validade", "2027-02-01T15:00:00Z", {}, "2027-02-01", 0, "2026-10-29T03:00:20Z"],
  ["frações nos dois lados da meia-noite", "2026-10-29T03:00:00.001Z", { sessaoJogoContabilizadoEm: data("2026-10-29T02:59:59.999Z") }, "2026-10-29", 0.001, "2026-10-29T03:00:00.001Z"],
]) {
  test(`#107 consumo virada: ${nome}`, () => {
    conferir(calcularNovoConsumo(virada(extras), data(agora)), dia, segundos, data(fim));
  });
}

test("#107 consumo: várias reconciliações somam somente intervalos novos", () => {
  let estado = crianca();
  for (const [ms, total, fim] of [[10000, 22, 10000], [20000, 32, 20000], [30000, 42, 30000], [60000, 42, 30000]]) {
    const resultado = calcularNovoConsumo(estado, instante(ms));
    conferir(resultado, "2026-10-29", total, instante(fim));
    estado = aplicar(estado, resultado);
  }
});

test("#107 consumo: reaplicar estado retornado no mesmo instante não duplica consumo", () => {
  const estado = crianca();
  const primeiro = calcularNovoConsumo(estado, instante(10000));
  const segundo = calcularNovoConsumo(aplicar(estado, primeiro), instante(10000));
  assert.deepEqual(segundo, primeiro);
});

test("#107 consumo: reconciliar novamente após expiração e virada não duplica segundos", () => {
  const estado = virada();
  const primeiro = calcularNovoConsumo(estado, data("2026-10-29T04:00:00Z"));
  conferir(primeiro, "2026-10-29", 20, data("2026-10-29T03:00:20Z"));
  const segundo = calcularNovoConsumo(aplicar(estado, primeiro), data("2026-10-29T15:00:00Z"));
  assert.deepEqual(segundo, primeiro);
});

test("#107 consumo: reconciliação antes e depois da meia-noite mantém dez segundos no novo dia", () => {
  let estado = virada();
  const antes = calcularNovoConsumo(estado, data("2026-10-29T02:59:55Z"));
  conferir(antes, "2026-10-28", 105, data("2026-10-29T02:59:55Z"));
  estado = aplicar(estado, antes);
  const depois = calcularNovoConsumo(estado, data("2026-10-29T03:00:10Z"));
  conferir(depois, "2026-10-29", 10, data("2026-10-29T03:00:10Z"));
  const expirado = calcularNovoConsumo(aplicar(estado, depois), data("2026-10-29T04:00:00Z"));
  conferir(expirado, "2026-10-29", 20, data("2026-10-29T03:00:20Z"));
});

test("#107 consumo: acumulado fracionário conserva precisão até a expiração", () => {
  let estado = crianca({ tempoUsadoHoje: 0 });
  for (const ms of [1, 1234, 10000, 29999, 30001]) {
    estado = aplicar(estado, calcularNovoConsumo(estado, instante(ms)));
    assert.ok(Math.abs(estado.tempoUsadoHoje - Math.min(ms, 30000) / 1000) < 1e-12);
  }
  assert.equal(estado.sessaoJogoContabilizadoEm.getTime(), instante(30000).getTime());
});

test("#107 consumo: trocar de partida mantém o consumo acumulado da criança", () => {
  let estado = crianca({ sessaoJogoSalvoId: new mongoose.Types.ObjectId() });
  estado = aplicar(estado, calcularNovoConsumo(estado, instante(10000)));
  estado.sessaoJogoSalvoId = new mongoose.Types.ObjectId();
  conferir(calcularNovoConsumo(estado, instante(20000)), "2026-10-29", 32, instante(20000));
});

test("#107 consumo: sessão retomada não inclui intervalo pausado", () => {
  let estado = crianca();
  estado = aplicar(estado, calcularNovoConsumo(estado, instante(10000)));
  estado.sessaoJogoEstado = "pausada";
  estado = aplicar(estado, calcularNovoConsumo(estado, instante(20000)));
  conferir(estadoResultado(estado), "2026-10-29", 22, instante(10000));
  // O futuro fluxo de retomada precisa inicializar os instantes no servidor.
  estado = { ...estado, sessaoJogoEstado: "ativa", sessaoJogoContabilizadoEm: instante(20000), sessaoJogoExpiraEm: instante(50000) };
  conferir(calcularNovoConsumo(estado, instante(30000)), "2026-10-29", 32, instante(30000));
});

function estadoResultado(estado) {
  const { dataReferenciaTempo, tempoUsadoHoje, sessaoJogoContabilizadoEm } = estado;
  return { dataReferenciaTempo, tempoUsadoHoje, sessaoJogoContabilizadoEm };
}

for (const campo of ["sessaoJogoContabilizadoEm", "sessaoJogoExpiraEm"]) {
  for (const [nome, valor] of [["ausente", undefined], ["null", null], ["inválida", new Date(NaN)]]) {
    test(`#107 consumo robustez: ${campo} ${nome} não acrescenta consumo nem gera NaN`, () => {
      const estado = crianca({ [campo]: valor });
      conferir(calcularNovoConsumo(estado, instante(10000)), "2026-10-29", 12, estado.sessaoJogoContabilizadoEm);
    });
  }
}

test("#107 consumo robustez: agora inválido é rejeitado explicitamente", () => {
  assert.throws(() => calcularNovoConsumo(crianca(), new Date(NaN)), RangeError);
});
test("#107 consumo robustez: criança ausente é rejeitada explicitamente", () => {
  assert.throws(() => calcularNovoConsumo(undefined, instante(10000)), Error);
});
for (const estado of ["ativa", "pausada"]) {
  test(`#107 consumo robustez: tempoUsadoHoje ausente na sessão ${estado} não produz consumo inválido`, () => {
    const entrada = crianca({ sessaoJogoEstado: estado });
    delete entrada.tempoUsadoHoje;
    // Como na suíte auxiliar, aceita rejeição explícita OU valor seguro.
    // Se aceitar o objeto incompleto, a base ausente deve equivaler a zero.
    let resultado;
    try { resultado = calcularNovoConsumo(entrada, instante(10000)); }
    catch (erro) { assert.ok(erro instanceof Error); return; }
    assert.equal(resultado.tempoUsadoHoje, estado === "ativa" ? 10 : 0,
      "Consumo ausente deve ser rejeitado ou tratado como zero, nunca undefined/NaN");
  });
}

test("#107 consumo: dados legados hidratados pelo Model recebem consumo padrão sem banco", () => {
  const documento = Crianca.hydrate({ _id: new mongoose.Types.ObjectId(), ...crianca({ tempoUsadoHoje: undefined }) });
  assert.equal(documento.tempoUsadoHoje, 0);
  conferir(calcularNovoConsumo(documento, instante(10000)), "2026-10-29", 10, instante(10000));
});

test("#107 consumo: agora omitido utiliza o relógio do servidor", t => {
  const entrada = crianca();
  t.mock.timers.enable({ apis: ["Date"], now: instante(10000) });
  conferir(calcularNovoConsumo(entrada), "2026-10-29", 22, instante(10000));
});

for (const documentoMongoose of [false, true]) {
  test(`#107 consumo: preserva entrada e datas (${documentoMongoose ? "documento Mongoose" : "objeto simples"})`, () => {
    const entrada = documentoMongoose ? new Crianca(crianca()) : crianca();
    const agora = instante(10000);
    const antes = JSON.stringify({ entrada, agora });
    conferir(calcularNovoConsumo(entrada, agora), "2026-10-29", 22, instante(10000));
    assert.equal(JSON.stringify({ entrada, agora }), antes);
  });
}
