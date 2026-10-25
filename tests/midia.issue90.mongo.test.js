import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import tarefaService from "../services/tarefaService.js";
import {
  validarAtivacao, obterUriTeste, motivoIgnorarAtlas, abrirConexaoTeste,
  prepararColecoesTeste, confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";
import { id, serializar, dadosTarefa, especificacoes } from "./helpers/midiaIssue90.js";

// Integração real opt-in. Somente MONGO_TEST_URI, sem dotenv/index.js ou fallback.
// Cada escrita possui ID registrado antes da chamada; nunca limpa coleções inteiras.
test("#90 MongoDB: referências persistidas e lidas por conexão independente", {
  skip: motivoIgnorarAtlas(),
}, async (t) => {
  validarAtivacao();
  obterUriTeste();
  let conexao;
  let leitura;
  const registros = new Map([[Comodo, []], [Tarefa, []], [Resposta, []]]);
  t.after(async () => {
    const falhas = [];
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza das fixtures #90 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) {
          assert.equal(await leitura.db.collection(Model.collection.name).countDocuments({ _id: { $in: ids } }), 0);
        }
        t.diagnostic("#90: ausência de resíduos confirmada por conexão independente");
      }
    } catch { falhas.push(new Error("Resíduos #90 não puderam ser descartados pela segunda conexão")); }
    try { await leitura?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar leitura #90")); }
    try { await conexao?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar conexão #90")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown da issue90 falhou");
  });
  conexao = await abrirConexaoTeste();
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  confirmarModels(conexao);
  confirmarModels(leitura);
  assert.notEqual(conexao.getClient(), leitura.getClient());
  t.diagnostic("#90: banco conectamente_testes confirmado nas duas conexões");

  const comodo = new Comodo({ _id: id(), nome: `Fixture #90 ${randomUUID()}`, descricao: "Somente teste", imagemCenario: "cenario.png", ordem: -100, dificuldadesDisponiveis: ["facil", "medio", "dificil"] });
  registros.get(Comodo).push(comodo._id);
  await comodo.save();
  let ordemTarefa = 0;
  let ordemResposta = 0;
  async function cadastrar(spec, midia = {}) {
    confirmarModels(conexao, [spec.Model]);
    const dados = spec.dados({
      [spec.referencia]: spec.Model === Tarefa ? comodo._id : tarefaBase._id,
      ordem: spec.Model === Tarefa ? ++ordemTarefa : ++ordemResposta,
      ...midia,
    });
    registros.get(spec.Model).push(dados._id);
    return spec.service[spec.post](dados);
  }
  const dadosBase = dadosTarefa({ comodoId: comodo._id, ordem: ++ordemTarefa });
  registros.get(Tarefa).push(dadosBase._id);
  const tarefaBase = await tarefaService.postTarefa(dadosBase);
  async function ler(Model, chave) {
    confirmarModels(leitura);
    const doc = await leitura.db.collection(Model.collection.name).findOne({ _id: chave });
    assert.ok(doc, "Documento deve existir na leitura independente");
    return serializar(doc);
  }
  const sentinelas = [];
  for (const spec of especificacoes) {
    const doc = await cadastrar(spec);
    sentinelas.push({ Model: spec.Model, chave: doc._id, antes: await ler(spec.Model, doc._id) });
  }

  for (const spec of especificacoes) {
    for (const estado of ["string", "omitido", "null"]) {
      await t.test(`${spec.nome}: cadastro com mídia ${estado} preserva campos e tipos`, async () => {
        const valores = estado === "omitido" ? {} : Object.fromEntries(spec.campos.map(c => [c, estado === "null" ? null : `referência livre ${c}`]));
        const doc = await cadastrar(spec, valores);
        const salvo = await ler(spec.Model, doc._id);
        assert.deepEqual(salvo, serializar(doc));
        for (const campo of spec.campos) {
          if (estado === "omitido") assert.equal(Object.hasOwn(salvo, campo), false);
          else assert.equal(salvo[campo], valores[campo]);
          if (estado === "string") assert.equal(typeof salvo[campo], "string");
        }
        assert.equal(salvo[spec.referencia], String(spec.Model === Tarefa ? comodo._id : tarefaBase._id));
        if (spec.Model === Tarefa) assert.equal(salvo.imagemObjeto, "objeto.png");
        else assert.equal(salvo.correta, false);
      });
    }
    for (const operacao of ["put", "patch"]) {
      await t.test(`${spec.nome}: ${operacao} adiciona, substitui, preserva omitidos e grava null`, async () => {
        const doc = await cadastrar(spec);
        const base = operacao === "put" ? doc.toObject() : {};
        let esperado = await ler(spec.Model, doc._id);
        async function atualizar(dados) {
          confirmarModels(conexao, [spec.Model]);
          const atualizado = await spec.service[spec[operacao]](doc._id, dados);
          assert.ok(atualizado);
          esperado = { ...esperado, ...serializar(dados) };
          const salvo = await ler(spec.Model, doc._id);
          assert.deepEqual(salvo, esperado, "Atualização não pode perder campos omitidos");
          assert.deepEqual(salvo, serializar(atualizado));
          return salvo;
        }
        await atualizar({ ...base, ...Object.fromEntries(spec.campos.map(c => [c, `primeira-${c}`])) });
        await atualizar({ ...base, [spec.campos[0]]: "mídia substituída" });
        await atualizar({ ...base, [spec.Model === Tarefa ? "titulo" : "texto"]: "Texto alterado sem mídia" });
        await atualizar({ ...base, ...Object.fromEntries(spec.campos.map(c => [c, null])) });
      });
    }
    await t.test(`${spec.nome}: mídia inválida rejeitada não altera documento persistido`, async () => {
      const doc = await cadastrar(spec, Object.fromEntries(spec.campos.map(c => [c, "original"])));
      const antes = await ler(spec.Model, doc._id);
      for (const campo of spec.campos) {
        for (const operacao of ["put", "patch"]) {
          const dados = operacao === "put" ? { ...doc.toObject(), [campo]: 42 } : { [campo]: 42 };
          await assert.rejects(spec.service[spec[operacao]](doc._id, dados), erro => erro.status === 400);
          assert.deepEqual(await ler(spec.Model, doc._id), antes);
        }
      }
    });
  }
  await t.test("fixtures anteriores à manutenção permanecem integralmente inalteradas", async () => {
    for (const s of sentinelas) assert.deepEqual(await ler(s.Model, s.chave), s.antes);
  });
});
