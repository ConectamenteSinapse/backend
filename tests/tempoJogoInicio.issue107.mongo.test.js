import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Jogo from "../models/jogoSalvoModel.js";
import { iniciarSessaoJogo } from "../services/tempoJogoService.js";
import { motivoIgnorarCommitReal, conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";
import { confirmarModels, limparRegistrosTeste } from "./helpers/atlasSeguro.js";

const id = () => new mongoose.Types.ObjectId();
const instante = ms => new Date(Date.parse("2026-10-29T15:00:00Z") + ms);
const chamar = f => iniciarSessaoJogo(f.usuarioId, f.jogo._id);
const erroEsperado = mensagem => erro => { assert.equal(erro.message, mensagem); return true; };

async function esperar(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Barreira de concorrência não alcançada")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

test("#107 MongoDB: início efetivo, consumo, concorrência e retries", {
  skip: motivoIgnorarCommitReal(), concurrency: false, timeout: 60000,
}, async t => {
  let conexao, leitura;
  const registros = new Map([[Jogo, []], [Perfil, []], [Crianca, []]]);
  t.after(async () => {
    const falhas = [];
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza do início #107 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: ids } }), 0);
        t.diagnostic("Ausência de resíduos de crianças, personagens e partidas confirmada por conexão independente");
      }
    } catch { falhas.push(new Error("Não foi possível confirmar ausência de resíduos")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown início #107 falhou");
  });
  conexao = await conectarBancoCommitReal();
  leitura = await conectarBancoCommitReal({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());

  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const _id = id();
    registros.get(Model).push(_id);
    const documento = { ...dados, _id };
    await Model.collection.insertOne(documento);
    return documento;
  }
  async function fixture(extras = {}, ausentes = []) {
    const usuarioId = id(); // IDs fictícios; autenticação JWT tem suíte própria.
    const dados = { usuarioId, responsavelId: id(), permissaoAtiva: true,
      limiteTempoDiario: 1, tempoUsadoHoje: 12, dataReferenciaTempo: "2026-10-29",
      sessaoJogoVersao: 0, sessaoJogoEstado: "encerrada", sessaoJogoId: "sessao-antiga",
      sessaoJogoSalvoId: null, sessaoJogoContabilizadoEm: instante(0), sessaoJogoExpiraEm: instante(30000),
      criadoEm: new Date("2026-01-01T00:00:00Z"), legadoIssue107: { preservar: true }, ...extras };
    for (const campo of ausentes) delete dados[campo];
    const crianca = await inserir(Crianca, dados);
    const perfil = await inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "Fixture início",
      imagemAvatar: "avatar.png", status: "ativo", estrelasTotal: 7 });
    const jogo = await inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "Fixture início", estrelasTotal: 7 });
    return { usuarioId, crianca, perfil, jogo };
  }
  async function ler(Model, _id) {
    assert.ok(registros.get(Model).some(chave => chave.equals(_id)), "Leitura restrita às fixtures");
    confirmarModels(leitura);
    return leitura.db.collection(Model.collection.name).findOne({ _id });
  }
  async function estado(f) {
    return { crianca: await ler(Crianca, f.crianca._id), perfil: await ler(Perfil, f.perfil._id), jogo: await ler(Jogo, f.jogo._id) };
  }
  function relogio(teste, agora = instante(40000)) {
    teste.mock.timers.enable({ apis: ["Date"], now: agora });
    return agora;
  }
  async function conferirInicio(f, resultado, agora, segundos, versao = 1, dia = "2026-10-29") {
    const persistido = await ler(Crianca, f.crianca._id);
    const restante = f.crianca.limiteTempoDiario === null ? Infinity : f.crianca.limiteTempoDiario * 60 - segundos;
    const expiracao = new Date(agora.getTime() + Math.min(30, restante) * 1000);
    assert.equal(resultado.estado, "ativa");
    assert.match(resultado.sessaoId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.deepEqual(resultado.expiraEm, expiracao);
    assert.equal(resultado.tempoUsadoHoje, segundos);
    assert.equal(resultado.limiteTempoDiario, f.crianca.limiteTempoDiario);
    assert.equal(String(resultado.jogoSalvo._id), String(f.jogo._id));
    assert.deepEqual(persistido, { ...f.crianca, dataReferenciaTempo: dia, tempoUsadoHoje: segundos,
      sessaoJogoVersao: versao, sessaoJogoEstado: "ativa", sessaoJogoId: resultado.sessaoId,
      sessaoJogoSalvoId: f.jogo._id, sessaoJogoContabilizadoEm: agora, sessaoJogoExpiraEm: expiracao });
    assert.deepEqual(await ler(Perfil, f.perfil._id), f.perfil);
    assert.deepEqual(await ler(Jogo, f.jogo._id), f.jogo);
  }
  // Barreira/interferência somente antes do driver: toda leitura, escrita,
  // correspondência do filtro e resultado continuam sendo do MongoDB real.
  function antesDaEscrita(teste, f, callback) {
    const original = Crianca.collection.findOneAndUpdate;
    let chamadas = 0;
    teste.mock.method(Crianca.collection, "findOneAndUpdate", async function (...args) {
      if (String(args[0]._id) === String(f.crianca._id)) await callback(++chamadas, ...args);
      return original.apply(this, args);
    });
    return () => chamadas;
  }
  async function concorrente(f, update) {
    confirmarModels(leitura);
    assert.ok(registros.get(Crianca).some(chave => chave.equals(f.crianca._id)));
    const resultado = await leitura.db.collection(Crianca.collection.name).updateOne({ _id: f.crianca._id }, update);
    assert.equal(resultado.matchedCount, 1);
  }

  await t.test("inicia, persiste UUID, partida, validade e versão, preservando demais dados", async s => {
    const agora = relogio(s), f = await fixture();
    await conferirInicio(f, await chamar(f), agora, 12);
  });
  for (const [nome, extras] of [["sem permissão", { permissaoAtiva: false }], ["permissão null", { permissaoAtiva: null }]]) {
    await t.test(`${nome}: rejeita e não altera nenhum documento`, async s => {
      relogio(s); const f = await fixture(extras), antes = await estado(f);
      await assert.rejects(chamar(f), erroEsperado("PERMISSAO_INATIVA"));
      assert.deepEqual(await estado(f), antes);
    });
  }
  await t.test("criança inexistente: rejeita sem inserir documentos", async s => {
    relogio(s); const f = await fixture(), antes = await estado(f);
    await assert.rejects(iniciarSessaoJogo(id(), f.jogo._id), erroEsperado("CRIANCA_NAO_ENCONTRADA"));
    assert.deepEqual(await estado(f), antes);
  });
  for (const invalido of ["invalido", undefined]) {
    await t.test(`ID inválido ${invalido}: banco preservado`, async s => {
      relogio(s); const f = await fixture(), antes = await estado(f);
      await assert.rejects(iniciarSessaoJogo(f.usuarioId, invalido), erroEsperado("ID_INVALIDO"));
      assert.deepEqual(await estado(f), antes);
    });
  }
  await t.test("partida inexistente: banco preservado", async s => {
    relogio(s); const f = await fixture(), antes = await estado(f);
    await assert.rejects(iniciarSessaoJogo(f.usuarioId, id()), erroEsperado("JOGO_SALVO_NAO_ENCONTRADO"));
    assert.deepEqual(await estado(f), antes);
  });
  await t.test("partida de outra criança: nenhum dos dois perfis é alterado", async s => {
    relogio(s); const a = await fixture(), b = await fixture();
    const antes = [await estado(a), await estado(b)];
    await assert.rejects(iniciarSessaoJogo(a.usuarioId, b.jogo._id), erroEsperado("JOGO_SALVO_NAO_ENCONTRADO"));
    assert.deepEqual([await estado(a), await estado(b)], antes);
  });
  await t.test("sessão ativa válida não pode ser substituída", async s => {
    relogio(s, instante(10000)); const f = await fixture({ sessaoJogoEstado: "ativa" }), antes = await estado(f);
    await assert.rejects(chamar(f), erroEsperado("SESSAO_JA_ATIVA"));
    assert.deepEqual(await estado(f), antes);
  });
  await t.test("sessão expirada reconcilia antes de iniciar", async s => {
    const agora = relogio(s), f = await fixture({ sessaoJogoEstado: "ativa" });
    await conferirInicio(f, await chamar(f), agora, 42);
  });
  await t.test("limite null mantém validade de trinta segundos e consumo elevado", async s => {
    const agora = relogio(s), f = await fixture({ limiteTempoDiario: null, tempoUsadoHoje: 9000 });
    await conferirInicio(f, await chamar(f), agora, 9000);
  });
  for (const [nome, usado, pendente, total] of [["limite já atingido", 60, false, 60],
    ["pendência atinge limite", 30, true, 60], ["pendência ultrapassa limite", 40, true, 70]]) {
    await t.test(`${nome}: consumo salvo antes do erro, sem nova sessão`, async s => {
      relogio(s); const f = await fixture({ tempoUsadoHoje: usado, sessaoJogoEstado: pendente ? "ativa" : "encerrada" });
      await assert.rejects(chamar(f), erroEsperado("LIMITE_TEMPO_ATINGIDO"));
      const esperado = { ...f.crianca, tempoUsadoHoje: total, sessaoJogoVersao: 1,
        sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null,
        sessaoJogoContabilizadoEm: instante(pendente ? 30000 : 0) };
      assert.deepEqual(await ler(Crianca, f.crianca._id), esperado);
      await assert.rejects(chamar(f), erroEsperado("LIMITE_TEMPO_ATINGIDO"));
      assert.deepEqual(await ler(Crianca, f.crianca._id), { ...esperado, sessaoJogoVersao: 2 });
      assert.deepEqual(await ler(Jogo, f.jogo._id), f.jogo);
    });
  }
  for (const restante of [5, 10]) {
    await t.test(`restam ${restante} segundos: validade limitada ao saldo`, async s => {
      const agora = relogio(s), f = await fixture({ tempoUsadoHoje: 60 - restante });
      await conferirInicio(f, await chamar(f), agora, 60 - restante);
    });
  }
  await t.test("meia-noite de São Paulo renova consumo esgotado", async s => {
    const agora = relogio(s, new Date("2026-10-30T03:00:00Z")), f = await fixture({ tempoUsadoHoje: 60 });
    await conferirInicio(f, await chamar(f), agora, 0, 1, "2026-10-30");
  });
  await t.test("primeira operação após expiração e meia-noite conserva vinte segundos", async s => {
    const agora = relogio(s, new Date("2026-10-30T04:00:00Z"));
    const f = await fixture({ tempoUsadoHoje: 600, sessaoJogoEstado: "ativa",
      sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"), sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z") });
    await conferirInicio(f, await chamar(f), agora, 20, 1, "2026-10-30");
  });
  await t.test("documento sem versão física e sem campos de sessão inicia com versão um", async s => {
    const agora = relogio(s), f = await fixture({}, ["sessaoJogoVersao", "sessaoJogoEstado", "sessaoJogoId",
      "sessaoJogoSalvoId", "sessaoJogoContabilizadoEm", "sessaoJogoExpiraEm"]);
    assert.equal(Object.hasOwn(await ler(Crianca, f.crianca._id), "sessaoJogoVersao"), false);
    await conferirInicio(f, await chamar(f), agora, 12);
  });

  for (const legado of [false, true]) {
    await t.test(`duas inicializações concorrentes (${legado ? "sem versão física" : "versão zero"}): só uma inicia`, async s => {
      relogio(s); const f = await fixture({}, legado ? ["sessaoJogoVersao"] : []);
      let liberar;
      const barreira = new Promise(resolve => { liberar = resolve; });
      const contar = antesDaEscrita(s, f, async numero => {
        if (numero <= 2) {
          if (numero === 2) liberar();
          await esperar(barreira);
        }
      });
      const resultados = await Promise.allSettled([chamar(f), chamar(f)]);
      const sucessos = resultados.filter(r => r.status === "fulfilled");
      const falhas = resultados.filter(r => r.status === "rejected");
      assert.equal(sucessos.length, 1);
      assert.equal(falhas.length, 1);
      assert.equal(falhas[0].reason.message, "SESSAO_JA_ATIVA");
      assert.equal(contar(), 2);
      await conferirInicio(f, sucessos[0].value, instante(40000), 12);
    });
  }
  for (const bloquear of [false, true]) {
    await t.test(`conflito real obriga releitura e recálculo ${bloquear ? "com bloqueio" : "com sucesso"}`, async s => {
      const agora = relogio(s), f = await fixture({ sessaoJogoEstado: "ativa" });
      const base = bloquear ? 40 : 20;
      const contar = antesDaEscrita(s, f, async numero => {
        if (numero === 1) await concorrente(f, { $set: { tempoUsadoHoje: base, sessaoJogoContabilizadoEm: instante(10000) }, $inc: { sessaoJogoVersao: 1 } });
      });
      if (bloquear) {
        await assert.rejects(chamar(f), erroEsperado("LIMITE_TEMPO_ATINGIDO"));
        assert.deepEqual(await ler(Crianca, f.crianca._id), { ...f.crianca, tempoUsadoHoje: 60,
          sessaoJogoVersao: 2, sessaoJogoEstado: "encerrada", sessaoJogoContabilizadoEm: instante(30000), sessaoJogoExpiraEm: null });
      } else await conferirInicio(f, await chamar(f), agora, 40, 2);
      assert.equal(contar(), 2);
    });
  }
  await t.test("três conflitos reais esgotam retries sem iniciar nem perder consumo", async s => {
    relogio(s); const f = await fixture();
    const contar = antesDaEscrita(s, f, async () => { await concorrente(f, { $inc: { sessaoJogoVersao: 1 } }); });
    await assert.rejects(chamar(f), erroEsperado("CONFLITO_SESSAO"));
    assert.equal(contar(), 3);
    assert.deepEqual(await ler(Crianca, f.crianca._id), { ...f.crianca, sessaoJogoVersao: 3 });
  });
});
