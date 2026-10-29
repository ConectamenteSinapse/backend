import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import mongoose from "mongoose";
import Usuario from "../models/usuarioModel.js";
import Responsavel from "../models/responsavelModel.js";
import Crianca from "../models/criancaModel.js";
import Historico from "../models/historicoJogoModel.js";
import {
  motivoIgnorarAtlas, abrirConexaoTeste, prepararColecoesTeste,
  confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";
import { id, iniciarHttp, historicos, cenarios } from "./helpers/evolucaoDiariaIssue105.js";

test("#105 MongoDB: evolução diária, preservação e limpeza por IDs próprios", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async t => {
  let conexao, leitura, original;
  const registros = new Map([[Historico, []], [Crianca, []], [Responsavel, []], [Usuario, []]]);
  const comandos = [];
  const monitorar = evento => comandos.push(evento.commandName);
  // Hash de BSON por coleção: compara documentos completos sem expor dados nos logs.
  async function estado() {
    confirmarModels(leitura);
    const resultado = {};
    const colecoes = await leitura.db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of colecoes.sort((a, b) => a.name.localeCompare(b.name))) {
      const hash = createHash("sha256");
      for await (const doc of leitura.db.collection(name).find({}).sort({ _id: 1 })) {
        hash.update(mongoose.mongo.BSON.serialize(doc));
      }
      resultado[name] = hash.digest("hex");
    }
    return resultado;
  }
  t.after(async () => {
    const falhas = [];
    conexao?.getClient().off("commandStarted", monitorar);
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza #105 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) {
          assert.equal(await leitura.db.collection(Model.collection.name)
            .countDocuments({ _id: { $in: ids } }), 0);
        }
        if (original) assert.deepEqual(await estado(), original);
        t.diagnostic("#105: zero resíduos e dados preexistentes preservados, confirmados por conexão independente");
      }
    } catch { falhas.push(new Error("Preservação/ausência de resíduos #105 não confirmada")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura #105")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão #105")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown #105 falhou");
  });
  conexao = await abrirConexaoTeste({ monitorCommands: true });
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  original = await estado();
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const chave = dados._id ?? id();
    registros.get(Model).push(chave); // Registrar antes da escrita, inclusive se falhar.
    return Model.create({ ...dados, _id: chave });
  }
  const execucao = randomUUID();
  const conta = perfil => inserir(Usuario, {
    nome: "Fixture #105", email: `issue105-${execucao}-${id()}@example.invalid`,
    senha: "hash-ficticio-sem-login", perfil,
  });
  const responsavel = await inserir(Responsavel, { usuarioId: (await conta("responsavel"))._id });
  const outroResponsavel = await inserir(Responsavel, { usuarioId: (await conta("responsavel"))._id });
  const criar = async dono => inserir(Crianca, {
    usuarioId: (await conta("crianca"))._id, responsavelId: dono._id,
  });
  const crianca = await criar(responsavel);
  const vazia = await criar(responsavel);
  const outra = await criar(outroResponsavel);
  // Referências de catálogo/personagem são ObjectIds sintéticos: a consulta não faz populate.
  // Históricos são fixtures diretas; não exercitam o fluxo de registrar respostas.
  for (const doc of historicos(crianca, outra)) await inserir(Historico, doc);
  const antes = await estado();
  const get = await iniciarHttp(t, responsavel);
  conexao.getClient().on("commandStarted", monitorar);
  await cenarios(t, { crianca, vazia, outra, outroResponsavel, get });
  conexao.getClient().off("commandStarted", monitorar);
  await t.test("consultas e rejeições não emitem comandos de escrita", () => {
    assert.ok(comandos.includes("find"));
    assert.deepEqual(comandos.filter(c => [
      "insert", "update", "delete", "findAndModify", "bulkWrite", "drop", "dropDatabase",
    ].includes(c)), []);
  });
  await t.test("todos os documentos MongoDB permanecem idênticos após as requisições", async () => {
    assert.deepEqual(await estado(), antes);
  });
});
