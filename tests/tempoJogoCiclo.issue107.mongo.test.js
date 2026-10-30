import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Jogo from "../models/jogoSalvoModel.js";
import { iniciarSessaoJogo, renovarSessaoJogo, pausarSessaoJogo, encerrarSessaoJogo } from "../services/tempoJogoService.js";
import { baseCiclo, casosCiclo, conferirCiclo, erroCiclo, instante } from "./helpers/tempoJogoCicloIssue107.js";
import { motivoIgnorarCommitReal, conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";
import { confirmarModels, limparRegistrosTeste } from "./helpers/atlasSeguro.js";

const funcoes = { renovar: renovarSessaoJogo, pausar: pausarSessaoJogo, encerrar: encerrarSessaoJogo };
const id = () => new mongoose.Types.ObjectId();
function sinal() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function esperar(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Barreira não alcançada")), 5000); })]); }
  finally { clearTimeout(timer); }
}

test("#107 MongoDB: heartbeat, pausa, encerramento e concorrência", {
  skip: motivoIgnorarCommitReal(), concurrency: false, timeout: 90000,
}, async t => {
  let conexao, leitura;
  const registros = new Map([[Jogo, []], [Perfil, []], [Crianca, []]]);
  t.after(async () => {
    const falhas = [];
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza do ciclo #107 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: ids } }), 0);
        t.diagnostic("Zero resíduos do ciclo confirmados por conexão independente");
      }
    } catch { falhas.push(new Error("Resíduos não puderam ser descartados")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown ciclo #107 falhou");
  });
  conexao = await conectarBancoCommitReal();
  leitura = await conectarBancoCommitReal({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const _id = id();
    registros.get(Model).push(_id);
    const doc = { ...dados, _id };
    for (const campo of Object.keys(doc)) if (doc[campo] === undefined) delete doc[campo];
    await Model.collection.insertOne(doc); // Preserva ausências físicas e legado.
    return doc;
  }
  const fixture = extras => inserir(Crianca, { usuarioId: id(), responsavelId: id(),
    sessaoJogoSalvoId: id(), legadoIssue107: { preservar: true }, ...baseCiclo(extras) });
  async function ler(f) {
    confirmarModels(leitura);
    assert.ok(registros.get(Crianca).some(chave => chave.equals(f._id)));
    return leitura.db.collection(Crianca.collection.name).findOne({ _id: f._id });
  }
  async function concorrente(f, update) {
    confirmarModels(leitura);
    assert.ok(registros.get(Crianca).some(chave => chave.equals(f._id)));
    assert.equal((await leitura.db.collection(Crianca.collection.name).updateOne({ _id: f._id }, update)).matchedCount, 1);
  }
  const executar = (f, op, sessaoId = f.sessaoJogoId) => funcoes[op](f.usuarioId, sessaoId);
  const relogio = (s, agora = instante(10000)) => s.mock.timers.enable({ apis: ["Date"], now: agora });
  function interceptar(s, f, antes) {
    const original = Crianca.collection.findOneAndUpdate;
    let numero = 0;
    s.mock.method(Crianca.collection, "findOneAndUpdate", async function (...args) {
      if (String(args[0]._id) === String(f._id)) await antes(++numero, ...args);
      return original.apply(this, args);
    });
    return () => numero;
  }

  for (const caso of casosCiclo) {
    await t.test(caso.nome, async s => {
      relogio(s, caso.agora ?? instante(caso.ms));
      const f = await fixture(caso.entrada), antes = await ler(f);
      let resultado;
      if (caso.erro) await assert.rejects(executar(f, caso.op, caso.sessaoId), erroCiclo(caso.erro));
      else resultado = await executar(f, caso.op, caso.sessaoId);
      conferirCiclo(antes, await ler(f), caso, resultado);
    });
  }
  for (const op of ["renovar", "pausar"]) {
    await t.test(`${op} com versão fisicamente ausente`, async s => {
      relogio(s); const f = await fixture({ sessaoJogoVersao: undefined });
      assert.equal(Object.hasOwn(await ler(f), "sessaoJogoVersao"), false);
      assert.equal((await executar(f, op)).tempoUsadoHoje, 22);
      assert.equal((await ler(f)).sessaoJogoVersao, 1);
    });
  }
  await t.test("heartbeats consecutivos e repetidos não duplicam segundos", async s => {
    relogio(s); const f = await fixture();
    for (const [avanco, total] of [[0, 22], [0, 22], [10000, 32], [1250, 33.25]]) {
      s.mock.timers.tick(avanco);
      assert.equal((await executar(f, "renovar")).tempoUsadoHoje, total);
    }
    assert.equal((await ler(f)).sessaoJogoVersao, 4);
  });
  for (const op of ["pausar", "encerrar"]) {
    await t.test(`repetir ${op} e renovar depois não muda documento`, async s => {
      relogio(s); const f = await fixture();
      await executar(f, op);
      const antes = await ler(f);
      s.mock.timers.tick(50000);
      await assert.rejects(executar(f, op), erroCiclo("SESSAO_INATIVA"));
      await assert.rejects(executar(f, "renovar"), erroCiclo("SESSAO_INATIVA"));
      assert.deepEqual(await ler(f), antes);
    });
  }
  for (const valor of [undefined, null, "data-invalida"]) {
    await t.test(`robustez: heartbeat não pode renovar sem origem válida (${String(valor)})`, async s => {
      relogio(s); const f = await fixture({ sessaoJogoContabilizadoEm: valor });
      let resultado;
      try { resultado = await executar(f, "renovar"); }
      catch (erro) { assert.ok(erro instanceof Error); return; }
      const persistido = await ler(f);
      s.diagnostic(JSON.stringify({ marcadorEntrada: String(valor), consumo: persistido.tempoUsadoHoje,
        marcadorPersistido: persistido.sessaoJogoContabilizadoEm, expiraEm: persistido.sessaoJogoExpiraEm }));
      if (resultado.estado === "ativa") {
        s.mock.timers.tick(10000);
        const segundo = await executar(f, "renovar");
        s.diagnostic(JSON.stringify({ segundoHeartbeat: true, consumo: segundo.tempoUsadoHoje, expiraEm: segundo.expiraEm }));
      }
      assert.notEqual(resultado.estado, "ativa", "Origem desconhecida não pode ganhar nova validade no MongoDB");
      assert.ok(Number.isFinite((await ler(f)).tempoUsadoHoje));
    });
  }
  for (const op of Object.keys(funcoes)) {
    await t.test(`${op} sessão de outra criança é rejeitado sem alterar nenhuma das duas`, async s => {
      relogio(s); const a = await fixture(), b = await fixture({ sessaoJogoId: "sessao-outra-crianca" });
      const antes = [await ler(a), await ler(b)];
      await assert.rejects(funcoes[op](a.usuarioId, b.sessaoJogoId), erroCiclo("SESSAO_INVALIDA"));
      assert.deepEqual([await ler(a), await ler(b)], antes);
    });
    await t.test(`${op} atrasado não altera sessão substituída entre leitura e escrita`, async s => {
      relogio(s); const f = await fixture();
      let novo;
      const numero = interceptar(s, f, async n => {
        if (n === 1) {
          await concorrente(f, { $set: { sessaoJogoId: "sessao-nova", sessaoJogoContabilizadoEm: instante(10000), sessaoJogoExpiraEm: instante(40000) }, $inc: { sessaoJogoVersao: 1 } });
          novo = await ler(f);
        }
      });
      await assert.rejects(executar(f, op), erroCiclo("SESSAO_INVALIDA"));
      assert.equal(numero(), 1);
      assert.deepEqual(await ler(f), novo);
    });
    await t.test(`${op} relê e recalcula após conflito real`, async s => {
      relogio(s); const f = await fixture();
      const numero = interceptar(s, f, async n => {
        if (n === 1) await concorrente(f, { $set: { tempoUsadoHoje: 18, sessaoJogoContabilizadoEm: instante(5000) }, $inc: { sessaoJogoVersao: 1 } });
      });
      const resultado = await executar(f, op);
      assert.equal(resultado.tempoUsadoHoje, 23); // 18 + (10 - 5), não 22.
      assert.equal((await ler(f)).tempoUsadoHoje, 23);
      assert.equal((await ler(f)).sessaoJogoVersao, 2);
      assert.equal(numero(), 2);
    });
    await t.test(`${op} esgota três conflitos reais sem sobrescrever consumo`, async s => {
      relogio(s); const f = await fixture();
      const numero = interceptar(s, f, async () => { await concorrente(f, { $inc: { sessaoJogoVersao: 1 } }); });
      await assert.rejects(executar(f, op), erroCiclo("CONFLITO_SESSAO"));
      assert.equal(numero(), 3);
      assert.deepEqual(await ler(f), { ...f, sessaoJogoVersao: 3 });
    });
  }

  await t.test("dois heartbeats simultâneos contabilizam somente dez segundos", async s => {
    relogio(s); const f = await fixture(), barreira = sinal();
    const numero = interceptar(s, f, async n => {
      if (n <= 2) { if (n === 2) barreira.resolve(); await esperar(barreira.promise); }
    });
    const resultados = await Promise.allSettled([executar(f, "renovar"), executar(f, "renovar")]);
    assert.ok(resultados.every(r => r.status === "fulfilled"));
    assert.ok(resultados.every(r => r.value.tempoUsadoHoje === 22));
    assert.equal(numero(), 3); // Uma perde e a terceira escrita usa o snapshot novo.
    assert.deepEqual(await ler(f), { ...f, tempoUsadoHoje: 22, sessaoJogoVersao: 2,
      sessaoJogoContabilizadoEm: instante(10000), sessaoJogoExpiraEm: instante(40000) });
  });
  for (const [op, estado] of [["pausar", "pausada"], ["encerrar", "encerrada"]]) {
    for (const vencedor of ["renovar", op]) {
      await t.test(`heartbeat e ${op} simultâneos: ${vencedor} grava primeiro`, async s => {
        relogio(s); const f = await fixture(), barreira = sinal(), primeiroTerminou = sinal();
        const original = Crianca.collection.findOneAndUpdate;
        let numero = 0;
        s.mock.method(Crianca.collection, "findOneAndUpdate", async function (...args) {
          if (String(args[0]._id) !== String(f._id)) return original.apply(this, args);
          const n = ++numero;
          const tipo = args[1].$set.sessaoJogoEstado === estado ? op : "renovar";
          if (n <= 2) {
            if (n === 2) barreira.resolve();
            await esperar(barreira.promise);
            if (tipo !== vencedor) await esperar(primeiroTerminou.promise);
          }
          try { return await original.apply(this, args); }
          finally { if (n <= 2 && tipo === vencedor) primeiroTerminou.resolve(); }
        });
        const [heartbeat, finalizacao] = await Promise.allSettled([executar(f, "renovar"), executar(f, op)]);
        assert.equal(finalizacao.status, "fulfilled");
        if (vencedor === "renovar") assert.equal(heartbeat.status, "fulfilled");
        else { assert.equal(heartbeat.status, "rejected"); assert.equal(heartbeat.reason.message, "SESSAO_INATIVA"); }
        assert.deepEqual(await ler(f), { ...f, tempoUsadoHoje: 22, sessaoJogoVersao: vencedor === "renovar" ? 2 : 1,
          sessaoJogoContabilizadoEm: instante(10000), sessaoJogoEstado: estado, sessaoJogoExpiraEm: null });
      });
    }
  }
  await t.test("pausa seguida de início usa novo UUID e não contabiliza intervalo pausado", async s => {
    relogio(s); const f = await fixture();
    const perfil = await inserir(Perfil, { criancaId: f._id, nomeAvatar: "Fixture ciclo", imagemAvatar: "avatar.png", status: "ativo" });
    const jogo = await inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "Fixture ciclo" });
    await executar(f, "pausar");
    s.mock.timers.tick(20000);
    const nova = await iniciarSessaoJogo(f.usuarioId, jogo._id);
    assert.notEqual(nova.sessaoId, f.sessaoJogoId);
    assert.equal(nova.tempoUsadoHoje, 22);
    assert.deepEqual((await ler(f)).sessaoJogoContabilizadoEm, instante(30000));
    const antes = await ler(f);
    await assert.rejects(executar(f, "renovar"), erroCiclo("SESSAO_INVALIDA"));
    assert.deepEqual(await ler(f), antes);
    s.mock.timers.tick(10000);
    assert.equal((await renovarSessaoJogo(f.usuarioId, nova.sessaoId)).tempoUsadoHoje, 32);
  });
});
