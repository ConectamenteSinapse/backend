import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Jogo from "../models/jogoSalvoModel.js";

// Como nas suítes anteriores, somente acrescenta exports privados em memória.
// iniciarSessaoJogo e buscarJogoSalvoPorId executam sua lógica original.
const url = new URL("../services/tempoJogoService.js", import.meta.url);
const bloqueios = [
  mock.method(mongoose, "connect", () => assert.fail("Conexão MongoDB proibida")),
  mock.method(mongoose, "createConnection", () => assert.fail("Conexão MongoDB proibida")),
  mock.method(mongoose, "startSession", () => assert.fail("Transação não prevista na preparação")),
  mock.method(mongoose.Model.prototype, "save", () => assert.fail("save não previsto na preparação")),
  ...["create", "insertMany", "bulkWrite"].map(nome =>
    mock.method(mongoose.Model, nome, () => assert.fail(`Escrita ${nome} não prevista`))),
  ...["insertOne", "insertMany", "updateOne", "updateMany", "findOneAndUpdate",
    "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "bulkWrite"].map(nome =>
    mock.method(mongoose.Collection.prototype, nome, () => assert.fail(`Driver ${nome} proibido`))),
];
after(() => {
  try { for (const bloqueio of bloqueios) assert.equal(bloqueio.mock.callCount(), 0); }
  finally { mock.restoreAll(); }
});
const hooks = registerHooks({
  load(endereco, contexto, next) {
    const resultado = next(endereco, contexto);
    if (endereco !== url.href) return resultado;
    return { ...resultado, source: `${readFileSync(url, "utf8")}\nexport { possuiSessaoAtiva, calcularNovoConsumo };\n` };
  },
});
let iniciarSessaoJogo, possuiSessaoAtiva, calcularNovoConsumo;
try { ({ iniciarSessaoJogo, possuiSessaoAtiva, calcularNovoConsumo } = await import(url.href)); }
finally { hooks.deregister(); }

const id = () => new mongoose.Types.ObjectId();
const instante = ms => new Date(Date.parse("2026-10-29T15:00:00Z") + ms);
const sessao = extras => ({ sessaoJogoEstado: "ativa", sessaoJogoExpiraEm: instante(30000), ...extras });

// Leitura simulada seguindo o padrão de jogoSalvoMock: queries e Services
// reais, documentos hidratados e populate representado só na fronteira de I/O.
function preparar(t, opcoes = {}) {
  const agora = opcoes.agora ?? instante(40000);
  t.mock.timers.enable({ apis: ["Date"], now: agora });
  const documento = new Crianca({ usuarioId: id(), permissaoAtiva: true,
    limiteTempoDiario: 1, tempoUsadoHoje: 12, dataReferenciaTempo: "2026-10-29",
    sessaoJogoEstado: "encerrada", sessaoJogoContabilizadoEm: instante(0),
    sessaoJogoExpiraEm: instante(30000), ...opcoes.crianca });
  const perfil = new Perfil({ criancaId: opcoes.outroDono ? id() : documento._id,
    nomeAvatar: "Fixture #107", imagemAvatar: "avatar.png",
    status: opcoes.arquivado ? "arquivado" : "ativo" });
  const partida = new Jogo({ perfilJogoId: perfil._id, nomeJogo: "Fixture início #107" });
  if (opcoes.vinculoSessao) documento.sessaoJogoSalvoId = opcoes.vinculoSessao === "mesma" ? partida._id : id();
  const snapshot = documento.toObject();
  const consultas = [];
  const lidos = [];
  const antes = JSON.stringify({ snapshot, perfil, partida });
  t.mock.method(mongoose.Query.prototype, "exec", async function () {
    consultas.push({ model: this.model.modelName, op: this.op, filtro: this.getFilter() });
    if (this.model === Crianca && this.op === "findOneAndUpdate") {
      const filtro = this.getFilter();
      const update = this.getUpdate();
      assert.equal(String(filtro._id), String(snapshot._id));
      assert.deepEqual(this.getOptions(), { new: true, runValidators: true });
      const versao = snapshot.sessaoJogoVersao ?? 0;
      if (filtro.$or) {
        assert.deepEqual(filtro.$or, [{ sessaoJogoVersao: 0 }, { sessaoJogoVersao: { $exists: false } }]);
        if (versao !== 0) return null;
      } else if (filtro.sessaoJogoVersao !== versao) return null;
      assert.deepEqual(update.$inc, { sessaoJogoVersao: 1 });
      const permitidos = ["dataReferenciaTempo", "tempoUsadoHoje", "sessaoJogoContabilizadoEm",
        "sessaoJogoExpiraEm", "sessaoJogoEstado", "sessaoJogoId", "sessaoJogoSalvoId"];
      assert.ok(Object.keys(update.$set).every(campo => permitidos.includes(campo)));
      const validado = Crianca.hydrate({ ...snapshot, ...update.$set, sessaoJogoVersao: versao + 1 });
      await validado.validate();
      Object.assign(snapshot, update.$set, { sessaoJogoVersao: versao + 1 });
      return Crianca.hydrate(snapshot);
    }
    assert.equal(this.op, "findOne", "Somente leituras ou atualização condicional da criança são permitidas");
    if (this.model === Crianca) {
      assert.deepEqual(this.getFilter(), { usuarioId: documento.usuarioId });
      if (opcoes.semCrianca) return null;
      const copia = Crianca.hydrate(snapshot);
      lidos.push({ copia, antes: JSON.stringify(copia.toObject()) });
      return copia;
    }
    if (this.model === Jogo) {
      assert.equal(String(this.getFilter()._id), String(partida._id));
      assert.ok(this.mongooseOptions().populate?.perfilJogoId,
        "A consulta original precisa pedir os dados do personagem");
      if (opcoes.semPartida) return null;
      const copia = Jogo.hydrate(partida.toObject());
      copia.perfilJogoId = opcoes.semPersonagem ? null : Perfil.hydrate(perfil.toObject());
      return copia;
    }
    assert.fail(`Leitura inesperada: ${this.model.modelName}`);
  });
  t.after(() => {
    const original = JSON.parse(antes);
    assert.equal(JSON.stringify({ perfil, partida }), JSON.stringify({ perfil: original.perfil, partida: original.partida }));
    for (const { copia, antes: leituraAntes } of lidos) assert.equal(JSON.stringify(copia.toObject()), leituraAntes,
      "O Service deve escrever condicionalmente sem mutar o documento lido");
  });
  return { usuarioId: documento.usuarioId, jogoSalvoId: partida._id,
    snapshot, partida, consultas, agora };
}

const chamar = fixture => iniciarSessaoJogo(fixture.usuarioId, fixture.jogoSalvoId);
async function rejeitar(fixture, mensagem) {
  await assert.rejects(chamar(fixture), erro => {
    assert.equal(erro.message, mensagem);
    return true;
  });
}
function conferirInicio(resultado, fixture, segundos, dia = "2026-10-29") {
  assert.deepEqual(Object.keys(resultado).sort(), ["estado", "expiraEm", "jogoSalvo", "limiteTempoDiario", "sessaoId", "tempoUsadoHoje"]);
  assert.equal(String(resultado.jogoSalvo._id), String(fixture.jogoSalvoId));
  assert.equal(resultado.estado, "ativa");
  assert.match(resultado.sessaoId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(resultado.tempoUsadoHoje, segundos);
  assert.equal(resultado.limiteTempoDiario, fixture.snapshot.limiteTempoDiario);
  const restante = fixture.snapshot.limiteTempoDiario === null ? Infinity : fixture.snapshot.limiteTempoDiario * 60 - segundos;
  assert.deepEqual(resultado.expiraEm, new Date(fixture.agora.getTime() + Math.min(30, restante) * 1000));
  assert.equal(fixture.snapshot.dataReferenciaTempo, dia);
  assert.equal(fixture.snapshot.tempoUsadoHoje, segundos);
  assert.equal(fixture.snapshot.sessaoJogoId, resultado.sessaoId);
  assert.equal(String(fixture.snapshot.sessaoJogoSalvoId), String(fixture.jogoSalvoId));
  assert.deepEqual(fixture.snapshot.sessaoJogoContabilizadoEm, fixture.agora);
  assert.deepEqual(fixture.snapshot.sessaoJogoExpiraEm, resultado.expiraEm);
}

test("#107 início: instrumentação preserva exports públicos", async () => {
  assert.deepEqual(Object.keys(await import(`${url.href}?api-publica-inicio`)), ["encerrarSessaoJogo", "iniciarSessaoJogo", "pausarSessaoJogo", "reconciliarSessaoParaResposta", "renovarSessaoJogo"]);
});

for (const [nome, extras, agora, esperado] of [
  ["ativa um milissegundo antes da expiração", {}, 29999, true],
  ["ativa exatamente na expiração", {}, 30000, false],
  ["ativa um milissegundo após expiração", {}, 30001, false],
  ["pausada com validade futura", { sessaoJogoEstado: "pausada" }, 10000, false],
  ["encerrada com validade futura", { sessaoJogoEstado: "encerrada" }, 10000, false],
  ["estado ausente", { sessaoJogoEstado: undefined }, 10000, false],
  ["expiração ausente", { sessaoJogoExpiraEm: undefined }, 10000, false],
  ["expiração null", { sessaoJogoExpiraEm: null }, 10000, false],
  ["expiração Date inválida", { sessaoJogoExpiraEm: new Date(NaN) }, 10000, false],
  ["expiração como string não é Date", { sessaoJogoExpiraEm: "2026-10-29T15:00:30Z" }, 10000, false],
]) {
  test(`#107 possuiSessaoAtiva: ${nome}`, () => {
    assert.equal(possuiSessaoAtiva(sessao(extras), instante(agora)), esperado);
  });
}
test("#107 possuiSessaoAtiva: agora omitido usa relógio do servidor", t => {
  t.mock.timers.enable({ apis: ["Date"], now: instante(10000) });
  assert.equal(possuiSessaoAtiva(sessao()), true);
});

test("#107 início: permissão ativa e saldo disponível persistem sessão e retornam seus dados", async t => {
  const f = preparar(t);
  conferirInicio(await chamar(f), f, 12);
  assert.deepEqual(f.consultas.map(c => [c.model, c.op]), [["Crianca", "findOne"],
    ["JogoSalvo", "findOne"], ["Crianca", "findOne"], ["Crianca", "findOneAndUpdate"]]);
  assert.equal(f.snapshot.sessaoJogoVersao, 1);
});
for (const valor of [false, null]) {
  test(`#107 início: permissão ${valor} rejeita sem atualizar após validar a partida`, async t => {
    const f = preparar(t, { crianca: { permissaoAtiva: valor } });
    await rejeitar(f, "PERMISSAO_INATIVA");
    assert.equal(f.consultas.length, 3);
    assert.ok(f.consultas.every(c => c.op === "findOne"));
  });
}
test("#107 início: criança inexistente é rejeitada", async t => {
  const f = preparar(t, { semCrianca: true });
  await rejeitar(f, "CRIANCA_NAO_ENCONTRADA");
  assert.equal(f.consultas.length, 1);
});
for (const invalido of ["invalido", undefined]) {
  test(`#107 início: partida com ID ${invalido} rejeita antes de consultar`, async t => {
    const f = preparar(t);
    f.jogoSalvoId = invalido;
    await rejeitar(f, "ID_INVALIDO");
    assert.equal(f.consultas.length, 0);
  });
}
for (const [nome, opcoes] of [["inexistente", { semPartida: true }],
  ["de outro usuário", { outroDono: true }], ["personagem arquivado", { arquivado: true }],
  ["personagem ausente", { semPersonagem: true }]]) {
  test(`#107 início: partida ${nome} é rejeitada pelo Service real de partidas`, async t => {
    await rejeitar(preparar(t, opcoes), "JOGO_SALVO_NAO_ENCONTRADO");
  });
}

for (const mesmaPartida of [true, false]) {
  test(`#107 início: sessão válida impede nova sessão na ${mesmaPartida ? "mesma" : "outra"} partida`, async t => {
    const f = preparar(t, { agora: instante(10000), vinculoSessao: mesmaPartida ? "mesma" : "outra",
      crianca: { sessaoJogoEstado: "ativa" } });
    await rejeitar(f, "SESSAO_JA_ATIVA");
  });
}

for (const ms of [30000, 30001, 40000]) {
  test(`#107 início: sessão expirada permite preparar nova sessão em ${ms} ms`, async t => {
    const f = preparar(t, { agora: instante(ms), crianca: { sessaoJogoEstado: "ativa" } });
    conferirInicio(await chamar(f), f, 42, "2026-10-29");
  });
}
for (const estado of ["pausada", "encerrada"]) {
  test(`#107 início: sessão ${estado} com expiração futura não bloqueia nem acrescenta consumo`, async t => {
    const f = preparar(t, { agora: instante(10000), crianca: { sessaoJogoEstado: estado } });
    conferirInicio(await chamar(f), f, 12);
  });
}

for (const [nome, campos] of [
  ["saldo já esgotado", { tempoUsadoHoje: 60 }],
  ["consumo pendente completa exatamente o limite", { tempoUsadoHoje: 30, sessaoJogoEstado: "ativa" }],
  ["consumo pendente ultrapassa o limite", { tempoUsadoHoje: 40, sessaoJogoEstado: "ativa" }],
]) {
  test(`#107 início: ${nome} retorna LIMITE_TEMPO_ATINGIDO`, async t => {
    await rejeitar(preparar(t, { crianca: campos }), "LIMITE_TEMPO_ATINGIDO");
  });
}
test("#107 início: reconcilia pendência abaixo do limite e a devolve ao chamador", async t => {
  const f = preparar(t, { crianca: { sessaoJogoEstado: "ativa", tempoUsadoHoje: 29 } });
  conferirInicio(await chamar(f), f, 59, "2026-10-29");
});
test("#107 início: limite null permite iniciar mesmo com consumo elevado e pendente", async t => {
  const f = preparar(t, { crianca: { limiteTempoDiario: null, tempoUsadoHoje: 9000, sessaoJogoEstado: "ativa" } });
  conferirInicio(await chamar(f), f, 9030, "2026-10-29");
});
test("#107 início: limite null não contorna sessão ativa válida", async t => {
  await rejeitar(preparar(t, { agora: instante(10000), crianca: {
    limiteTempoDiario: null, sessaoJogoEstado: "ativa",
  } }), "SESSAO_JA_ATIVA");
});
test("#107 início: meia-noite renova saldo esgotado sem sessão ativa", async t => {
  const f = preparar(t, { agora: new Date("2026-10-30T03:00:00Z"), crianca: { tempoUsadoHoje: 60 } });
  conferirInicio(await chamar(f), f, 0, "2026-10-30");
});
test("#107 início: após meia-noite e expiração preserva vinte segundos do novo dia", async t => {
  const f = preparar(t, { agora: new Date("2026-10-30T04:00:00Z"), crianca: {
    tempoUsadoHoje: 600, sessaoJogoEstado: "ativa",
    sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"),
    sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z"),
  } });
  conferirInicio(await chamar(f), f, 20, "2026-10-30");
});
test("#107 início: consumo já registrado para o novo dia soma pendência antes de liberar", async t => {
  const f = preparar(t, { agora: new Date("2026-10-30T04:00:00Z"), crianca: {
    limiteTempoDiario: 1, dataReferenciaTempo: "2026-10-30", tempoUsadoHoje: 45, sessaoJogoEstado: "ativa",
    sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"),
    sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z"),
  } });
  await rejeitar(f, "LIMITE_TEMPO_ATINGIDO");
});

test("#107 início: limite rejeita após persistir consumo pendente e encerrar a sessão", async t => {
  const f = preparar(t, { crianca: { tempoUsadoHoje: 30, sessaoJogoEstado: "ativa" } });
  const reconciliado = calcularNovoConsumo(Crianca.hydrate(f.snapshot), f.agora);
  assert.equal(reconciliado.tempoUsadoHoje, 60);
  assert.deepEqual(reconciliado.sessaoJogoContabilizadoEm, instante(30000));
  let resultado, erro;
  try { resultado = await chamar(f); }
  catch (capturado) { erro = capturado; }
  assert.equal(erro?.message, "LIMITE_TEMPO_ATINGIDO");
  assert.equal(resultado, undefined);
  assert.equal(f.snapshot.tempoUsadoHoje, 60);
  assert.deepEqual(f.snapshot.sessaoJogoContabilizadoEm, instante(30000));
  assert.equal(f.snapshot.sessaoJogoEstado, "encerrada");
  assert.equal(f.snapshot.sessaoJogoExpiraEm, null);
  assert.equal(f.snapshot.sessaoJogoVersao, 1);
  await rejeitar(f, "LIMITE_TEMPO_ATINGIDO");
  assert.deepEqual(calcularNovoConsumo(Crianca.hydrate(f.snapshot), f.agora), reconciliado,
    "Nova tentativa não pode duplicar o intervalo já contabilizado");
  assert.equal(f.snapshot.sessaoJogoVersao, 2);
});

for (const segundos of [5, 10]) {
  test(`#107 início: apenas ${segundos} segundos restantes limitam a validade da sessão`, async t => {
    const f = preparar(t, { crianca: { tempoUsadoHoje: 60 - segundos } });
    conferirInicio(await chamar(f), f, 60 - segundos);
  });
}

test("#107 início: conflito obriga nova consulta, novo relógio e recálculo", async t => {
  const f = preparar(t, { crianca: { sessaoJogoEstado: "ativa" } });
  const original = Crianca.findOneAndUpdate;
  let tentativas = 0;
  t.mock.method(Crianca, "findOneAndUpdate", function (...args) {
    if (++tentativas === 1) {
      Object.assign(f.snapshot, { sessaoJogoVersao: 1, tempoUsadoHoje: 20, sessaoJogoContabilizadoEm: instante(10000) });
      t.mock.timers.tick(1000);
      return Promise.resolve(null);
    }
    assert.equal(args[0].sessaoJogoVersao, 1);
    return original.apply(this, args);
  });
  f.agora = instante(41000);
  conferirInicio(await chamar(f), f, 40);
  assert.equal(tentativas, 2);
  assert.equal(f.snapshot.sessaoJogoVersao, 2);
  assert.equal(f.consultas.filter(c => c.model === "Crianca" && c.op === "findOne").length, 3);
});

test("#107 início: limite alcançado após conflito também persiste antes de rejeitar", async t => {
  const f = preparar(t, { crianca: { sessaoJogoEstado: "ativa" } });
  const original = Crianca.findOneAndUpdate;
  let tentativas = 0;
  t.mock.method(Crianca, "findOneAndUpdate", function (...args) {
    if (++tentativas === 1) {
      Object.assign(f.snapshot, { sessaoJogoVersao: 1, tempoUsadoHoje: 40, sessaoJogoContabilizadoEm: instante(10000) });
      return Promise.resolve(null);
    }
    return original.apply(this, args);
  });
  await rejeitar(f, "LIMITE_TEMPO_ATINGIDO");
  assert.equal(tentativas, 2);
  assert.equal(f.snapshot.tempoUsadoHoje, 60);
  assert.equal(f.snapshot.sessaoJogoVersao, 2);
  assert.equal(f.snapshot.sessaoJogoEstado, "encerrada");
});

test("#107 início: sessão válida criada por outra requisição interrompe retry", async t => {
  const f = preparar(t);
  const chamada = t.mock.method(Crianca, "findOneAndUpdate", async () => {
    Object.assign(f.snapshot, { sessaoJogoVersao: 1, sessaoJogoEstado: "ativa", sessaoJogoExpiraEm: instante(60000) });
    return null;
  });
  await rejeitar(f, "SESSAO_JA_ATIVA");
  assert.equal(chamada.mock.callCount(), 1);
});

test("#107 início: três conflitos consecutivos retornam CONFLITO_SESSAO sem quarto envio", async t => {
  const f = preparar(t);
  const antes = JSON.stringify(f.snapshot);
  const chamada = t.mock.method(Crianca, "findOneAndUpdate", async () => null);
  await rejeitar(f, "CONFLITO_SESSAO");
  assert.equal(chamada.mock.callCount(), 3);
  assert.equal(f.consultas.filter(c => c.model === "Crianca").length, 4);
  assert.equal(JSON.stringify(f.snapshot), antes);
});
