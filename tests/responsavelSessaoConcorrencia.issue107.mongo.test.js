import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Responsavel from "../models/responsavelModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Jogo from "../models/jogoSalvoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import responsavelService from "../services/responsavelService.js";
import historicoService from "../services/historicoJogoService.js";
import { iniciarSessaoJogo, renovarSessaoJogo } from "../services/tempoJogoService.js";
import { criarCatalogo } from "./helpers/catalogo.js";
import { motivoIgnorarCommitReal, conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";
import { confirmarModels, limparRegistrosTeste } from "./helpers/atlasSeguro.js";

const id = () => new mongoose.Types.ObjectId();
const instante = ms => new Date(Date.parse("2026-10-29T15:00:00Z") + ms);
function sinal() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function esperar(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Barreira de política não alcançada")), 10000);
  })]); } finally { clearTimeout(timer); }
}

test("#107 MongoDB: concorrência real entre responsável e sessões", {
  skip: motivoIgnorarCommitReal(process.env, "RUN_CONCORRENCIA_REAL_TESTS"),
  concurrency: false, timeout: 120000,
}, async t => {
  let conexao, leitura;
  const ids = { comodos: [], tarefas: [], respostas: [] };
  const registros = new Map([[Jogo, []], [Perfil, []], [Crianca, []], [Responsavel, []],
    [Resposta, ids.respostas], [Tarefa, ids.tarefas], [Comodo, ids.comodos]]);
  t.after(async () => {
    const falhas = [];
    try { if (conexao) await limparRegistrosTeste(conexao, registros, Historico, registros.get(Perfil)); }
    catch { falhas.push(new Error("Limpeza das fixtures de política incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, chaves] of registros) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: chaves } }), 0);
        assert.equal(await leitura.db.collection(Historico.collection.name)
          .countDocuments({ perfilJogoId: { $in: registros.get(Perfil) } }), 0);
        t.diagnostic("Responsável/sessões: zero resíduos confirmado por conexão independente");
      }
    } catch { falhas.push(new Error("Não foi possível descartar resíduos de política")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown da concorrência de política falhou");
  });
  conexao = await conectarBancoCommitReal({ permissao: "RUN_CONCORRENCIA_REAL_TESTS", monitorCommands: true });
  leitura = await conectarBancoCommitReal({ leitura: true, permissao: "RUN_CONCORRENCIA_REAL_TESTS" });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  const catalogo = await criarCatalogo(null, ids, `politica-107-${randomUUID()}`);
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const _id = id(); registros.get(Model).push(_id);
    return Model.create({ ...dados, _id });
  }
  async function fixture(op = "heartbeat", politica = "permissao") {
    const responsavel = await inserir(Responsavel, { usuarioId: id() });
    const crianca = await inserir(Crianca, { usuarioId: id(), responsavelId: responsavel._id,
      dataNascimento: new Date("2020-01-01T00:00:00Z"), permissaoAtiva: true,
      limiteTempoDiario: 2, tempoUsadoHoje: politica === "limite" ? 70 : 12,
      dataReferenciaTempo: "2026-10-29", sessaoJogoVersao: 7,
      sessaoJogoId: randomUUID(), sessaoJogoEstado: op === "inicio" ? "encerrada" : "ativa",
      sessaoJogoContabilizadoEm: instante(0), sessaoJogoExpiraEm: op === "inicio" ? null : instante(30000) });
    const perfil = await inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "Política #107",
      imagemAvatar: "teste.png", status: "ativo", estrelasTotal: 7 });
    const jogo = await inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "Política #107", estrelasTotal: 7 });
    confirmarModels(conexao, [Crianca]);
    await Crianca.updateOne({ _id: crianca._id }, { $set: { sessaoJogoSalvoId: jogo._id } });
    return { responsavel, crianca, perfil, jogo };
  }
  async function ler(Model, chave) {
    confirmarModels(leitura);
    assert.ok(registros.get(Model).some(permitida => permitida.equals(chave)));
    return leitura.db.collection(Model.collection.name).findOne({ _id: chave });
  }
  async function estado(f) {
    return { crianca: await ler(Crianca, f.crianca._id), perfil: await ler(Perfil, f.perfil._id),
      jogo: await ler(Jogo, f.jogo._id), historicos: await leitura.db.collection(Historico.collection.name)
        .find({ jogoSalvoId: f.jogo._id }).sort({ tentativa: 1 }).toArray() };
  }
  const alterar = (f, politica) => politica === "permissao"
    ? responsavelService.alterarPermissaoCrianca(f.responsavel.usuarioId, f.crianca._id, false)
    : politica === "desvinculacao" ? responsavelService.desvincularCrianca(f.responsavel.usuarioId, f.crianca._id)
    : responsavelService.alterarLimiteTempoCrianca(f.responsavel.usuarioId, f.crianca._id, 1);
  const executar = (f, op) => op === "inicio" ? iniciarSessaoJogo(f.crianca.usuarioId, f.jogo._id)
    : op === "heartbeat" ? renovarSessaoJogo(f.crianca.usuarioId, f.crianca.sessaoJogoId)
    : historicoService.registrarResposta(f.crianca.usuarioId, f.perfil._id, f.jogo._id,
      catalogo.quarto.tarefas[0]._id, catalogo.quarto.tarefas[0].correta._id, "facil", f.crianca.sessaoJogoId);
  const relogio = s => s.mock.timers.enable({ apis: ["Date"], now: instante(10000) });
  function conferirPreservacao(antes, depois, politica) {
    const campo = politica === "limite" ? "limiteTempoDiario" : "permissaoAtiva";
    assert.equal(depois[campo], politica === "limite" ? 1 : false);
    assert.equal(depois.sessaoJogoVersao, (antes.sessaoJogoVersao ?? 0) + 1,
      "A política e sua invalidação devem ser confirmadas na mesma atualização");
    if (politica === "desvinculacao") assert.equal(depois.responsavelId, null);
    const retirarPolitica = doc => {
      const copia = { ...doc }; delete copia[campo]; delete copia.sessaoJogoVersao;
      if (politica === "desvinculacao") delete copia.responsavelId;
      return copia;
    };
    assert.deepEqual(retirarPolitica(depois), retirarPolitica(antes),
      "Alteração de política deve preservar consumo, marcadores, sessão e outros campos");
  }
  // Só controla o instante da execução; não substitui resultados MongoDB,
  // filtros, versões, withTransaction, commit, abort ou erros do driver.
  async function disputar(s, f, op, politica) {
    const chegou = sinal(), liberar = sinal(), sequencia = [], conflitos = [];
    const original = Crianca.collection.findOneAndUpdate;
    let escritasSessao = 0, leiturasSessao = 0;
    const lerOriginal = Crianca.collection.findOne;
    s.mock.method(Crianca.collection, "findOne", function (...args) {
      if (String(args[0].usuarioId) === String(f.crianca.usuarioId)) leiturasSessao++;
      return lerOriginal.apply(this, args);
    });
    s.mock.method(Crianca.collection, "findOneAndUpdate", async function (...args) {
      const cas = Object.hasOwn(args[0], "sessaoJogoVersao")
        || args[0].$or?.some(parte => Object.hasOwn(parte, "sessaoJogoVersao"));
      if (String(args[0]._id) !== String(f.crianca._id) || !cas || args[1].$inc?.sessaoJogoVersao !== 1)
        return original.apply(this, args);
      const n = ++escritasSessao;
      if (n === 1) {
        sequencia.push("sessão leu o documento e preparou a atualização"); chegou.resolve();
        await esperar(liberar.promise);
      } else sequencia.push("sessão releu e recalculou");
      try {
        const resultado = await original.apply(this, args);
        sequencia.push(resultado ? `escrita de sessão ${n} executada` : `escrita de sessão ${n} perdeu CAS`);
        return resultado;
      } catch (erro) {
        conflitos.push({ codigo: erro.code, transitorio: erro.hasErrorLabel?.("TransientTransactionError") === true });
        sequencia.push(`escrita de sessão ${n}: conflito MongoDB ${erro.code}`); throw erro;
      }
    });
    const fim = executar(f, op).then(valor => ({ status: "fulfilled", valor }), erro => ({ status: "rejected", erro }));
    let politicaPersistida;
    try {
      await esperar(chegou.promise);
      const antes = await ler(Crianca, f.crianca._id);
      await alterar(f, politica);
      politicaPersistida = await ler(Crianca, f.crianca._id);
      conferirPreservacao(antes, politicaPersistida, politica);
      sequencia.push("responsável confirmou a política nova sem alterar o consumo");
    } finally { liberar.resolve(); await fim; }
    const resultado = await fim, depois = await estado(f);
    s.diagnostic(JSON.stringify({ op, politica, sequencia, escritasSessao, leiturasSessao, conflitos,
      resultado: resultado.status === "fulfilled" ? "sucesso" : resultado.erro.message,
      antesDeLiberar: { permissao: politicaPersistida.permissaoAtiva, limite: politicaPersistida.limiteTempoDiario,
        consumo: politicaPersistida.tempoUsadoHoje, versao: politicaPersistida.sessaoJogoVersao },
      persistido: { permissao: depois.crianca.permissaoAtiva, limite: depois.crianca.limiteTempoDiario,
        consumo: depois.crianca.tempoUsadoHoje, versao: depois.crianca.sessaoJogoVersao,
        estado: depois.crianca.sessaoJogoEstado, expiraEm: depois.crianca.sessaoJogoExpiraEm },
      historicos: depois.historicos.length, estrelas: depois.jogo.estrelasTotal }));
    return { resultado, depois, conflitos, escritasSessao, politicaPersistida, leiturasSessao, sequencia };
  }
  for (const op of ["heartbeat", "inicio"]) {
    for (const politica of ["permissao", "limite", "desvinculacao"]) {
      await t.test(`${op}: ${politica} alterada depois da leitura deve impedir confirmação desatualizada`, async s => {
        relogio(s); const f = await fixture(op, politica), antes = await estado(f);
        const { resultado, depois, escritasSessao, politicaPersistida, leiturasSessao, sequencia } = await disputar(s, f, op, politica);
        assert.deepEqual(depois.historicos, antes.historicos);
        assert.deepEqual(depois.jogo, antes.jogo); assert.deepEqual(depois.perfil, antes.perfil);
        assert.equal(depois.crianca.tempoUsadoHoje, f.crianca.tempoUsadoHoje + (op === "heartbeat" ? 10 : 0));
        assert.equal(resultado.status, "rejected", "Política nova já confirmada deve ser relida antes de autorizar a sessão");
        assert.equal(resultado.erro.message, politica === "limite" ? "LIMITE_TEMPO_ATINGIDO" : "PERMISSAO_INATIVA");
        assert.equal(depois.crianca.sessaoJogoEstado, "encerrada");
        assert.ok(sequencia.includes("escrita de sessão 1 perdeu CAS"));
        assert.equal(leiturasSessao, op === "heartbeat" ? 2 : 3,
          "Inclui a leitura de propriedade da partida no início e a nova leitura após conflito");
        const confirmaConsumo = op === "heartbeat" || politica === "limite";
        assert.equal(escritasSessao, confirmaConsumo ? 2 : 1);
        assert.equal(depois.crianca.sessaoJogoVersao, politicaPersistida.sessaoJogoVersao + (confirmaConsumo ? 1 : 0));
        if (politica === "desvinculacao") assert.equal(depois.crianca.responsavelId, null);
      });
    }
  }
  for (const bloqueia of [true, false]) {
    await t.test(`resposta transacional: redução do limite ${bloqueia ? "esgota" : "preserva"} saldo`, async s => {
      relogio(s); const f = await fixture("resposta", bloqueia ? "limite" : "permissao"), antes = await estado(f);
      const { resultado, depois, conflitos, escritasSessao, politicaPersistida } = await disputar(s, f, "resposta", "limite");
      assert.ok(conflitos.some(c => c.transitorio), "MongoDB deve detectar a alteração posterior ao snapshot transacional");
      assert.equal(escritasSessao, 2, "Driver deve repetir com uma nova leitura");
      assert.equal(depois.crianca.tempoUsadoHoje, bloqueia ? 80 : 22);
      assert.equal(depois.crianca.limiteTempoDiario, 1);
      assert.equal(depois.crianca.sessaoJogoVersao, politicaPersistida.sessaoJogoVersao + 1);
      if (bloqueia) {
        assert.equal(resultado.status, "rejected"); assert.equal(resultado.erro.message, "LIMITE_TEMPO_ATINGIDO");
        assert.equal(depois.crianca.sessaoJogoEstado, "encerrada");
        assert.deepEqual(depois.historicos, antes.historicos);
        assert.deepEqual(depois.jogo, antes.jogo); assert.deepEqual(depois.perfil, antes.perfil);
      } else {
        assert.equal(resultado.status, "fulfilled"); assert.equal(resultado.valor.tentativa, 1);
        assert.equal(depois.historicos.length, 1); assert.equal(depois.historicos[0].tentativa, 1);
        assert.equal(depois.jogo.estrelasTotal, 8);
      }
    });
  }
  await t.test("resposta grava primeiro: responsável aguarda o commit e preserva consumo confirmado", async s => {
    relogio(s); const f = await fixture("resposta", "limite");
    const reservou = sinal(), liberar = sinal(), politicaEnviada = sinal();
    const originalHistorico = Historico.create;
    let pausou = false;
    s.mock.method(Historico, "create", async function (...args) {
      if (!pausou && String(args[0][0].jogoSalvoId) === String(f.jogo._id)) {
        pausou = true; assert.ok(args[1].session.inTransaction());
        reservou.resolve(); await esperar(liberar.promise);
      }
      return originalHistorico.apply(this, args);
    });
    const monitorarPolitica = evento => {
      if (evento.commandName === "findAndModify" && evento.command.findAndModify === Crianca.collection.name
        && String(evento.command.query?._id) === String(f.crianca._id)
        && String(evento.command.query?.responsavelId) === String(f.responsavel._id)) politicaEnviada.resolve();
    };
    conexao.getClient().on("commandStarted", monitorarPolitica);
    s.after(() => conexao.getClient().off("commandStarted", monitorarPolitica));
    const fimResposta = executar(f, "resposta").then(valor => ({ valor }), erro => ({ erro }));
    let fimPolitica, politicaConcluiu = false;
    try {
      await esperar(reservou.promise);
      fimPolitica = alterar(f, "limite").then(valor => { politicaConcluiu = true; return { valor }; }, erro => ({ erro }));
      await esperar(politicaEnviada.promise);
      assert.equal(politicaConcluiu, false, "A atualização real não pode concluir com a criança reservada pela transação");
      const durante = await ler(Crianca, f.crianca._id);
      assert.equal(durante.tempoUsadoHoje, 70); assert.equal(durante.limiteTempoDiario, 2);
    } finally { liberar.resolve(); await Promise.all([fimResposta, ...(fimPolitica ? [fimPolitica] : [])]); }
    const resposta = await fimResposta, politica = await fimPolitica;
    assert.equal(resposta.erro, undefined); assert.equal(politica.erro, undefined);
    assert.equal(resposta.valor.tentativa, 1);
    const depois = await estado(f);
    assert.equal(depois.crianca.tempoUsadoHoje, 80); assert.equal(depois.crianca.limiteTempoDiario, 1);
    assert.equal(depois.historicos.length, 1); assert.equal(depois.jogo.estrelasTotal, 8);
    s.diagnostic("Ordem inversa: resposta confirmou 80 s e uma tentativa; só depois o responsável reduziu para 1 min, sem apagar consumo");
  });
  for (const politica of ["permissao", "limite", "desvinculacao"]) {
    await t.test(`responsável altera ${politica} preservando todo consumo já contabilizado`, async s => {
      relogio(s); const f = await fixture(), antes = await estado(f);
      await alterar(f, politica); const depois = await estado(f);
      conferirPreservacao(antes.crianca, depois.crianca, politica);
      for (const campo of ["perfil", "jogo", "historicos"]) assert.deepEqual(depois[campo], antes[campo]);
    });
    for (const op of ["heartbeat", "inicio"]) {
      await t.test(`controle sequencial: ${politica} confirmada antes de ${op} é respeitada`, async s => {
        relogio(s); const f = await fixture(op, politica);
        await alterar(f, politica);
        await assert.rejects(executar(f, op), erro => {
          assert.equal(erro.message, politica === "limite" ? "LIMITE_TEMPO_ATINGIDO" : "PERMISSAO_INATIVA"); return true;
        });
        const depois = await estado(f);
        assert.equal(depois.crianca.tempoUsadoHoje, f.crianca.tempoUsadoHoje + (op === "heartbeat" ? 10 : 0));
        assert.equal(depois.crianca.sessaoJogoEstado, "encerrada");
        assert.equal(depois.historicos.length, 0); assert.equal(depois.jogo.estrelasTotal, 7);
      });
    }
    await t.test(`legado sem versão: ${politica} cria versão 1 sem reiniciar consumo`, async s => {
      relogio(s); const f = await fixture();
      confirmarModels(conexao, [Crianca]);
      await Crianca.collection.updateOne({ _id: f.crianca._id }, { $unset: { sessaoJogoVersao: "" } });
      const antes = await estado(f);
      assert.equal(Object.hasOwn(antes.crianca, "sessaoJogoVersao"), false);
      await alterar(f, politica); const depois = await estado(f);
      conferirPreservacao(antes.crianca, depois.crianca, politica);
      for (const campo of ["perfil", "jogo", "historicos"]) assert.deepEqual(depois[campo], antes[campo]);
    });
  }
});
