import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Usuario from "../models/usuarioModel.js";
import Responsavel from "../models/responsavelModel.js";
import Crianca from "../models/criancaModel.js";
import {
  motivoIgnorarAtlas, abrirConexaoTeste, prepararColecoesTeste,
  confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";
import {
  id, serializar, invalidos, idsInvalidos, erroLimite, iniciarHttp,
} from "./helpers/limiteTempoIssue101.js";

// Opt-in, somente conectamente_testes. Services/Models/queries reais.
// JWTs temporários: autenticação de login já tem suíte própria.
test("#101 MongoDB: limite diário por HTTP e leitura independente", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async (t) => {
  let conexao;
  let leitura;
  const registros = new Map([[Crianca, []], [Responsavel, []], [Usuario, []]]);
  t.after(async () => {
    const falhas = [];
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza das fixtures #101 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) {
          assert.equal(await leitura.db.collection(Model.collection.name)
            .countDocuments({ _id: { $in: ids } }), 0);
        }
        t.diagnostic("#101: ausência de resíduos confirmada por conexão independente");
      }
    } catch { falhas.push(new Error("Resíduos #101 não puderam ser descartados")); }
    try { await leitura?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar leitura #101")); }
    try { await conexao?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar conexão #101")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown #101 falhou");
  });
  conexao = await abrirConexaoTeste();
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  const execucao = randomUUID();
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const chave = id();
    registros.get(Model).push(chave); // Antes da escrita, mesmo se ela falhar.
    return Model.create({ ...dados, _id: chave });
  }
  async function conta(perfil) {
    return inserir(Usuario, {
      nome: "Fixture #101", email: `issue101-${execucao}-${id()}@example.com`,
      senha: "hash-ficticio-sem-login", perfil,
    });
  }
  const usuario = await conta("responsavel");
  const outroUsuario = await conta("responsavel");
  const semPerfil = await conta("responsavel");
  const responsavel = await inserir(Responsavel, { usuarioId: usuario._id });
  const outroResponsavel = await inserir(Responsavel, { usuarioId: outroUsuario._id });
  async function cadastrarCrianca(responsavelId) {
    const usuarioCrianca = await conta("crianca");
    return inserir(Crianca, {
      usuarioId: usuarioCrianca._id, responsavelId,
      dataNascimento: new Date("2018-05-10T00:00:00Z"), permissaoAtiva: true,
      limiteTempoDiario: 45, tempoUsadoHoje: 12,
      criadoEm: new Date("2026-01-01T00:00:00Z"),
    });
  }
  const crianca = await cadastrarCrianca(responsavel._id);
  const outraCrianca = await cadastrarCrianca(outroResponsavel._id);
  const semVinculo = await cadastrarCrianca(null);
  const patch = await iniciarHttp(t, usuario._id, crianca._id);

  async function estado() {
    confirmarModels(leitura);
    const resultado = {};
    for (const [Model, ids] of registros) {
      resultado[Model.modelName] = serializar(await leitura.db.collection(Model.collection.name)
        .find({ _id: { $in: ids } }).sort({ _id: 1 }).toArray());
    }
    return resultado;
  }
  async function atualizarSomenteLimite(limiteTempoDiario, extras = {}) {
    const esperado = await estado();
    const alvo = esperado.Crianca.find(doc => doc._id === String(crianca._id));
    assert.ok(alvo);
    alvo.limiteTempoDiario = limiteTempoDiario;
    alvo.sessaoJogoVersao = (alvo.sessaoJogoVersao ?? 0) + 1;
    assert.deepEqual(await patch({ ...extras, limiteTempoDiario }), {
      status: 200,
      dados: { mensagem: "Limite diário atualizado com sucesso", limiteTempoDiario },
    });
    assert.deepEqual(await estado(), esperado,
      "Somente limite e versão da criança vinculada podem mudar, preservando consumo e demais campos");
  }
  async function rejeitar(body, opcoes, status, dados) {
    const antes = await estado();
    const resposta = await patch(body, opcoes);
    assert.equal(resposta.status, status);
    assert.equal(resposta.dados.erro, true);
    if (dados) assert.deepEqual(resposta.dados, dados);
    assert.deepEqual(await estado(), antes, "Rejeição não pode alterar documentos persistidos");
  }

  for (const limite of [1, 30, 120]) {
    await t.test(`inteiro positivo ${limite}: persistência e preservação integral`, async () => {
      await atualizarSomenteLimite(limite);
    });
  }
  await t.test("null remove limite existente no MongoDB e preserva demais campos", async () => {
    await atualizarSomenteLimite(null);
  });
  await t.test("campos extras não alteram identidade, vínculo, permissão ou uso diário", async () => {
    await atualizarSomenteLimite(60, {
      _id: String(id()), usuarioId: String(id()), responsavelId: String(outroResponsavel._id),
      permissaoAtiva: false, tempoUsadoHoje: 0, dataNascimento: "2020-01-01",
      criadoEm: "2020-01-01", __v: 99,
    });
  });
  for (const [nome, body] of invalidos) {
    await t.test(`${nome}: 400 e banco preservado`, async () => {
      await rejeitar(body, {}, 400, erroLimite);
    });
  }
  await t.test("body ausente: 400 e banco preservado", async () => {
    await rejeitar(undefined, {}, 400, { erro: true, mensagem: "Body da requisição obrigatório" });
  });
  for (const alvo of idsInvalidos) {
    await t.test(`ID inválido ${alvo}: 400 e banco preservado`, async () => {
      await rejeitar({ limiteTempoDiario: 30 }, { alvo }, 400, { erro: true, mensagem: "ID inválido" });
    });
  }
  await t.test("ID do usuário inválido no JWT: 400 e banco preservado", async () => {
    await rejeitar({ limiteTempoDiario: 30 }, {
      usuario: { id: "invalido", perfil: "responsavel" },
    }, 400, { erro: true, mensagem: "ID inválido" });
  });
  await t.test("sem JWT: 401 e banco preservado", async () => {
    await rejeitar({ limiteTempoDiario: 30 }, { usuario: null }, 401,
      { erro: true, mensagem: "Token nao informado" });
  });
  await t.test("perfil criança: 403 e banco preservado", async () => {
    await rejeitar({ limiteTempoDiario: 30 }, {
      usuario: { id: String(crianca.usuarioId), perfil: "crianca" },
    }, 403, { erro: true, mensagem: "Acesso negado para esse perfil" });
  });
  await t.test("responsável sem perfil cadastrado: 404 e banco preservado", async () => {
    await rejeitar({ limiteTempoDiario: 30 }, {
      usuario: { id: String(semPerfil._id), perfil: "responsavel" },
    }, 404, { erro: true, mensagem: "Responsavel nao encontrado" });
  });
  for (const [nome, alvo] of [
    ["outro responsável", outraCrianca._id], ["sem vínculo", semVinculo._id],
    ["inexistente", id()], ["ID de Usuario", crianca.usuarioId],
  ]) {
    await t.test(`criança ${nome}: 404 e banco preservado`, async () => {
      await rejeitar({ limiteTempoDiario: 30 }, { alvo }, 404,
        { erro: true, mensagem: "Criança não encontrada entre as contas vinculadas" });
    });
  }
});
