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
  id, serializar, dadosCrianca, erroVinculo, idsInvalidos, iniciarHttp,
} from "./helpers/desvinculacaoIssue103.js";

// Services, Models, queries e populate reais. JWT temporário; sem index.js.
test("#103 MongoDB: desvinculação, listagem e preservação por conexão independente", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async t => {
  let conexao;
  let leitura;
  const registros = new Map([[Crianca, []], [Responsavel, []], [Usuario, []]]);
  t.after(async () => {
    const falhas = [];
    try { if (conexao) await limparRegistrosTeste(conexao, registros); }
    catch { falhas.push(new Error("Limpeza das fixtures #103 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, ids] of registros) {
          assert.equal(await leitura.db.collection(Model.collection.name)
            .countDocuments({ _id: { $in: ids } }), 0);
        }
        t.diagnostic("#103: zero resíduos confirmado por conexão independente");
      }
    } catch { falhas.push(new Error("Resíduos #103 não puderam ser descartados")); }
    try { await leitura?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar leitura #103")); }
    try { await conexao?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar conexão #103")); }
    if (falhas.length) throw new AggregateError(falhas, "Teardown #103 falhou");
  });
  conexao = await abrirConexaoTeste();
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  const execucao = randomUUID();
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const chave = id();
    registros.get(Model).push(chave); // Registrado mesmo se a escrita falhar.
    return Model.create({ ...dados, _id: chave });
  }
  async function conta(perfil) {
    return inserir(Usuario, {
      nome: "Fixture #103", email: `issue103-${execucao}-${id()}@example.com`,
      senha: "hash-ficticio-sem-login", perfil,
    });
  }
  const usuario = await conta("responsavel");
  const outroUsuario = await conta("responsavel");
  const semPerfil = await conta("responsavel");
  const responsavel = await inserir(Responsavel, { usuarioId: usuario._id });
  const outroResponsavel = await inserir(Responsavel, { usuarioId: outroUsuario._id });
  async function cadastrarCrianca(responsavelId, extras = {}) {
    const usuarioCrianca = await conta("crianca");
    return inserir(Crianca, dadosCrianca(usuarioCrianca._id, responsavelId, extras));
  }
  const crianca = await cadastrarCrianca(responsavel._id);
  const irma = await cadastrarCrianca(responsavel._id, {
    permissaoAtiva: false, limiteTempoDiario: null,
  });
  const outraCrianca = await cadastrarCrianca(outroResponsavel._id);
  const semVinculo = await cadastrarCrianca(null, { permissaoAtiva: false });
  const { desvincular, listar } = await iniciarHttp(t, usuario._id);
  async function estado() {
    confirmarModels(leitura);
    const resultado = {};
    for (const [Model, ids] of registros) {
      resultado[Model.modelName] = serializar(await leitura.db.collection(Model.collection.name)
        .find({ _id: { $in: ids } }).sort({ _id: 1 }).toArray());
    }
    return resultado;
  }
  async function listarIds(opcoes) {
    const resposta = await listar(opcoes);
    assert.equal(resposta.status, 200);
    return resposta.dados.map(c => c._id).sort();
  }
  async function rejeitar(alvo, opcoes, status, dados) {
    const antes = await estado();
    assert.deepEqual(await desvincular(alvo, opcoes), { status, dados });
    assert.deepEqual(await estado(), antes, "Rejeição não pode alterar nenhum documento das fixtures");
  }

  for (const [nome, alvo] of [
    ["outro responsável", outraCrianca._id], ["já desvinculada", semVinculo._id],
    ["inexistente", id()], ["ID de Usuario", crianca.usuarioId],
  ]) {
    await t.test(`criança ${nome}: 404 e banco preservado`, async () => {
      await rejeitar(alvo, {}, 404, erroVinculo);
    });
  }
  for (const alvo of idsInvalidos) {
    await t.test(`ID inválido ${alvo}: 400 e banco preservado`, async () => {
      await rejeitar(alvo, {}, 400, { erro: true, mensagem: "ID inválido" });
    });
  }
  for (const [nome, identidade, status, mensagem] of [
    ["ID inválido no JWT", { id: "invalido", perfil: "responsavel" }, 400, "ID inválido"],
    ["responsável sem perfil", { id: String(semPerfil._id), perfil: "responsavel" }, 404, "Responsavel nao encontrado"],
    ["sem JWT", null, 401, "Token nao informado"],
    ["perfil criança", { id: String(crianca.usuarioId), perfil: "crianca" }, 403, "Acesso negado para esse perfil"],
    ["perfil admin", { id: String(usuario._id), perfil: "admin" }, 403, "Acesso negado para esse perfil"],
  ]) {
    await t.test(`${nome}: ${status} e banco preservado`, async () => {
      await rejeitar(crianca._id, { usuario: identidade }, status, { erro: true, mensagem });
    });
  }

  await t.test("desvincula: responsavelId null, permissão false, usuário e demais campos preservados", async () => {
    assert.deepEqual(await listarIds(), [String(crianca._id), String(irma._id)].sort());
    const esperado = await estado();
    const alvo = esperado.Crianca.find(c => c._id === String(crianca._id));
    assert.ok(alvo);
    assert.equal(alvo.permissaoAtiva, true);
    assert.equal(alvo.limiteTempoDiario, 45);
    alvo.responsavelId = null;
    alvo.permissaoAtiva = false;
    assert.deepEqual(await desvincular(crianca._id), {
      status: 200, dados: { mensagem: "Criança desvinculada com sucesso" },
    });
    assert.deepEqual(await estado(), esperado,
      "Todos os usuários, responsáveis e crianças devem permanecer; só dois campos podem mudar");
    assert.deepEqual(await listarIds(), [String(irma._id)], "Outra criança deve continuar vinculada");
    assert.deepEqual(await listarIds({
      usuario: { id: String(outroUsuario._id), perfil: "responsavel" },
    }), [String(outraCrianca._id)]);
  });
  await t.test("nova tentativa após desvinculação: 404 sem alterações persistidas", async () => {
    await rejeitar(crianca._id, {}, 404, erroVinculo);
  });
  await t.test("permissão já inativa e limite null preservados; body não altera outros dados", async () => {
    const esperado = await estado();
    const alvo = esperado.Crianca.find(c => c._id === String(irma._id));
    assert.ok(alvo);
    assert.equal(alvo.limiteTempoDiario, null);
    assert.equal(alvo.permissaoAtiva, false);
    alvo.responsavelId = null;
    assert.deepEqual(await desvincular(irma._id, { body: {
      usuarioId: String(id()), responsavelId: String(outroResponsavel._id),
      permissaoAtiva: true, limiteTempoDiario: 0, tempoUsadoHoje: 0,
      dataNascimento: "2020-01-01",
    } }), { status: 200, dados: { mensagem: "Criança desvinculada com sucesso" } });
    assert.deepEqual(await estado(), esperado);
    assert.deepEqual(await listarIds(), [], "Sem crianças vinculadas, listagem deve ficar vazia");
  });
});
