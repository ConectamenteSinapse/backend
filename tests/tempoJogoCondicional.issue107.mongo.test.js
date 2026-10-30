import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import { motivoIgnorarCommitReal, conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";
import { confirmarModels, limparRegistrosTeste } from "./helpers/atlasSeguro.js";

// Não altera API pública; importa funções originais instrumentadas em memória.
const url = new URL("../services/tempoJogoService.js", import.meta.url);
const hooks = registerHooks({
  load(endereco, contexto, next) {
    const resultado = next(endereco, contexto);
    if (endereco !== url.href) return resultado;
    return { ...resultado, source: `${readFileSync(url, "utf8")}\nexport { atualizarConsumoCondicional, calcularNovoConsumo };\n` };
  },
});
let atualizarConsumoCondicional, calcularNovoConsumo;
try { ({ atualizarConsumoCondicional, calcularNovoConsumo } = await import(url.href)); }
finally { hooks.deregister(); }

const id = () => new mongoose.Types.ObjectId();
const instante = ms => new Date(Date.parse("2026-10-29T15:00:00Z") + ms);
const consumo = extras => ({ dataReferenciaTempo: "2026-10-29", tempoUsadoHoje: 22,
  sessaoJogoContabilizadoEm: instante(10000), ...extras });

// Escritas reais fora de transação externa: a disputa precisa alcançar
// o MongoDB. Exige opt-in de commit e guarda exclusiva conectamente_testes.
test("#107 MongoDB: consumo condicional, legado, concorrência e limpeza independente", {
  skip: motivoIgnorarCommitReal(), concurrency: false, timeout: 60000,
}, async t => {
  let conexao, leitura;
  const ids = [];
  const registros = new Map([[Crianca, ids]]);
  t.after(async () => {
    const falhas = [];
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza das fixtures de consumo incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        assert.equal(await leitura.db.collection(Crianca.collection.name)
          .countDocuments({ _id: { $in: ids } }), 0);
        t.diagnostic("Ausência de resíduos confirmada por conexão independente");
      }
    } catch { falhas.push(new Error("Não foi possível confirmar ausência de resíduos")); }
    try { await leitura?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar leitura")); }
    try { await conexao?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar conexão")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown consumo #107 falhou");
  });
  conexao = await conectarBancoCommitReal();
  leitura = await conectarBancoCommitReal({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());

  async function inserir(extras = {}, ausentes = []) {
    confirmarModels(conexao, [Crianca]);
    const _id = id();
    ids.push(_id); // Antes da escrita, inclusive se ocorrer falha parcial.
    const documento = { _id, usuarioId: id(), responsavelId: id(), permissaoAtiva: true,
      dataNascimento: new Date("2018-05-10T00:00:00Z"), criadoEm: new Date("2026-01-01T00:00:00Z"),
      limiteTempoDiario: 1, tempoUsadoHoje: 12, dataReferenciaTempo: "2026-10-29",
      sessaoJogoVersao: 0, sessaoJogoEstado: "ativa", sessaoJogoId: String(id()),
      sessaoJogoSalvoId: id(), sessaoJogoContabilizadoEm: instante(0), sessaoJogoExpiraEm: instante(30000),
      legadoIssue107: { preservar: true }, ...extras };
    for (const campo of ausentes) delete documento[campo];
    // Driver nativo evita preencher defaults e representa documentos antigos reais.
    await Crianca.collection.insertOne(documento);
    return documento;
  }
  async function ler(_id) {
    assert.ok(ids.some(chave => chave.equals(_id)), "Leitura limitada às fixtures desta execução");
    confirmarModels(leitura);
    return leitura.db.collection(Crianca.collection.name).findOne({ _id });
  }
  async function gravar(entrada, novo) {
    assert.ok(ids.some(chave => chave.equals(entrada._id)), "Escrita limitada às fixtures");
    confirmarModels(conexao, [Crianca]);
    return atualizarConsumoCondicional(entrada, novo);
  }

  for (const versao of [undefined, 0, 7]) {
    await t.test(`versão ${versao ?? "fisicamente ausente"}: persiste consumo e incrementa versão`, async () => {
      const entrada = await inserir({ sessaoJogoVersao: versao ?? 0 }, versao === undefined ? ["sessaoJogoVersao"] : []);
      if (versao === undefined) assert.equal(Object.hasOwn(await ler(entrada._id), "sessaoJogoVersao"), false);
      const novo = consumo();
      const resultado = await gravar(entrada, novo);
      assert.ok(resultado);
      assert.equal(resultado.sessaoJogoVersao, (versao ?? 0) + 1);
      assert.equal(resultado.tempoUsadoHoje, 22);
      assert.deepEqual(await ler(entrada._id), { ...entrada, ...novo, sessaoJogoVersao: (versao ?? 0) + 1 });
    });
  }

  await t.test("legado hidratado: versão default zero atualiza documento sem versão física", async () => {
    const entrada = await inserir({}, ["sessaoJogoVersao"]);
    const hidratado = await Crianca.findById(entrada._id);
    assert.equal(hidratado.sessaoJogoVersao, 0);
    assert.equal(Object.hasOwn(await ler(entrada._id), "sessaoJogoVersao"), false);
    assert.equal((await gravar(hidratado, consumo())).sessaoJogoVersao, 1);
    assert.equal((await ler(entrada._id)).sessaoJogoVersao, 1);
  });

  await t.test("legado sem nenhum campo de sessão: não materializa campos alheios ao consumo", async () => {
    const campos = ["sessaoJogoVersao", "sessaoJogoEstado", "sessaoJogoId", "sessaoJogoSalvoId",
      "sessaoJogoContabilizadoEm", "sessaoJogoExpiraEm"];
    const entrada = await inserir({}, campos);
    const antes = await ler(entrada._id);
    for (const campo of campos) assert.equal(Object.hasOwn(antes, campo), false);
    const hidratado = await Crianca.findById(entrada._id);
    const novo = calcularNovoConsumo(hidratado, instante(10000));
    assert.equal(novo.tempoUsadoHoje, 12);
    assert.equal(novo.sessaoJogoContabilizadoEm, null);
    assert.equal((await gravar(hidratado, novo)).sessaoJogoVersao, 1);
    assert.deepEqual(await ler(entrada._id), { ...antes, ...novo, sessaoJogoVersao: 1 });
    for (const campo of ["sessaoJogoEstado", "sessaoJogoId", "sessaoJogoSalvoId", "sessaoJogoExpiraEm"])
      assert.equal(Object.hasOwn(await ler(entrada._id), campo), false);
  });

  for (const versao of [undefined, 0, 7]) {
    await t.test(`duas operações concorrentes com versão ${versao ?? "ausente"}: uma vence e outra retorna null`, async () => {
      const entrada = await inserir({ sessaoJogoVersao: versao ?? 0 }, versao === undefined ? ["sessaoJogoVersao"] : []);
      // Ambos os snapshots são obtidos antes de iniciar as escritas.
      const a = await ler(entrada._id), b = await ler(entrada._id);
      const propostas = [consumo({ tempoUsadoHoje: 22 }), consumo({ tempoUsadoHoje: 32, sessaoJogoContabilizadoEm: instante(20000) })];
      const resultados = await Promise.all([gravar(a, propostas[0]), gravar(b, propostas[1])]);
      assert.equal(resultados.filter(Boolean).length, 1);
      assert.equal(resultados.filter(resultado => resultado === null).length, 1);
      const vencedor = resultados.findIndex(Boolean);
      assert.deepEqual(await ler(entrada._id), { ...entrada, ...propostas[vencedor], sessaoJogoVersao: (versao ?? 0) + 1 });
      const antes = await ler(entrada._id);
      assert.equal(await gravar(vencedor === 0 ? b : a, propostas[1 - vencedor]), null);
      assert.deepEqual(await ler(entrada._id), antes, "Conflito não pode perder nem duplicar consumo ou avançar versão");
    });
  }

  await t.test("versão antiga zero não sobrescreve versão positiva nem demais campos", async () => {
    const entrada = await inserir({ sessaoJogoVersao: 3, tempoUsadoHoje: 25 });
    const antes = await ler(entrada._id);
    assert.equal(await gravar({ ...entrada, sessaoJogoVersao: 0 }, consumo({ tempoUsadoHoje: 999 })), null);
    assert.deepEqual(await ler(entrada._id), antes);
  });

  for (const valor of [-1, -0.001]) {
    await t.test(`consumo negativo ${valor}: ValidationError e documento integralmente preservado`, async () => {
      const entrada = await inserir();
      const antes = await ler(entrada._id);
      await assert.rejects(gravar(entrada, consumo({ tempoUsadoHoje: valor })), erro => {
        assert.equal(erro.name, "ValidationError");
        assert.equal(erro.errors.tempoUsadoHoje.kind, "min");
        return true;
      });
      assert.deepEqual(await ler(entrada._id), antes);
    });
  }

  await t.test("consumo zero é válido e preserva identidade, vínculos, permissão e sessão", async () => {
    const entrada = await inserir({ sessaoJogoVersao: 2 });
    const novo = consumo({ tempoUsadoHoje: 0 });
    const resultado = await gravar(entrada, { ...novo, permissaoAtiva: false, usuarioId: id(), limiteTempoDiario: null });
    assert.equal(resultado.tempoUsadoHoje, 0);
    assert.deepEqual(await ler(entrada._id), { ...entrada, ...novo, sessaoJogoVersao: 3 });
  });

  for (const limite of [1, null]) {
    await t.test(`limite ${limite}: persiste 69 segundos sem bloqueio ou truncamento`, async () => {
      const entrada = await inserir({ limiteTempoDiario: limite, tempoUsadoHoje: 59 });
      const novo = calcularNovoConsumo(entrada, instante(10000));
      assert.equal(novo.tempoUsadoHoje, 69);
      assert.equal((await gravar(entrada, novo)).tempoUsadoHoje, 69);
      assert.deepEqual(await ler(entrada._id), { ...entrada, ...novo, sessaoJogoVersao: 1 });
    });
  }

  await t.test("reler após conflito permite reconciliar só o intervalo ainda não contabilizado", async () => {
    const entrada = await inserir({ tempoUsadoHoje: 0 });
    const primeiro = calcularNovoConsumo(entrada, instante(10000));
    assert.ok(await gravar(entrada, primeiro));
    assert.equal(await gravar(entrada, primeiro), null);
    let atual = await ler(entrada._id);
    const segundo = calcularNovoConsumo(atual, instante(20000));
    assert.equal(segundo.tempoUsadoHoje, 20);
    assert.ok(await gravar(atual, segundo));
    atual = await ler(entrada._id);
    assert.equal(atual.sessaoJogoVersao, 2);
    assert.equal(atual.tempoUsadoHoje, 20);
    const repetido = calcularNovoConsumo(atual, instante(20000));
    assert.ok(await gravar(atual, repetido));
    const final = await ler(entrada._id);
    assert.equal(final.tempoUsadoHoje, 20);
    assert.equal(final.sessaoJogoVersao, 3, "Operação bem-sucedida incrementa versão mesmo sem novos segundos");
  });

  await t.test("outra criança não é alterada por atualização ou conflito", async () => {
    const entrada = await inserir();
    const outra = await inserir({ tempoUsadoHoje: 77, sessaoJogoVersao: 9 });
    const antes = await ler(outra._id);
    assert.ok(await gravar(entrada, consumo()));
    assert.equal(await gravar(entrada, consumo()), null);
    assert.deepEqual(await ler(outra._id), antes);
  });
});
