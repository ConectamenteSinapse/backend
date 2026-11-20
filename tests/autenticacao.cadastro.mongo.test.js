import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Usuario from "../models/usuarioModel.js";
import Responsavel from "../models/responsavelModel.js";
import Crianca from "../models/criancaModel.js";
import usuarioRoutes from "../routes/usuarioRoutes.js";
import responsavelRoutes from "../routes/responsavelRoutes.js";
import criancaRoutes from "../routes/criancaRoutes.js";
import {
  motivoIgnorarCommitReal,
  conectarBancoCommitReal,
} from "./helpers/bancoCommitReal.js";
import {
  obterUriTeste, confirmarModels, abrirConexaoTeste, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";

// Sem mocks, dotenv, index.js, transação externa descartada ou catálogo compartilhado.
// A URI e as duas flags devem ser fornecidas explicitamente pelo executor.
test("cadastro/login e falhas parciais: HTTP e MongoDB reais", {
  skip: motivoIgnorarCommitReal(), concurrency: false,
}, async (t) => {
  obterUriTeste(); // Valida nome da URI ANTES de conectar ou preparar coleções.
  const chave = `auditoria-auth-${randomUUID()}`;
  const emails = new Set();
  const registros = new Map([[Crianca, []], [Responsavel, []], [Usuario, []]]);
  const modelos = [...registros.keys()];
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  let conexao, leitura, servidor, base;
  const contabilizados = { Usuario: 0, Responsavel: 0, Crianca: 0 };
  function registrar(Model, id) {
    const lista = registros.get(Model);
    if (!lista.some((v) => String(v) === String(id))) lista.push(new mongoose.Types.ObjectId(id));
  }
  async function descobrir() {
    confirmarModels(leitura);
    const contas = await leitura.db.collection(Usuario.collection.name)
      .find({ email: { $in: [...emails] } }).toArray();
    for (const doc of contas) registrar(Usuario, doc._id);
    for (const Model of [Responsavel, Crianca]) {
      const docs = await leitura.db.collection(Model.collection.name)
        .find({ usuarioId: { $in: registros.get(Usuario) } }).toArray();
      for (const doc of docs) registrar(Model, doc._id);
    }
    for (const Model of modelos) contabilizados[Model.modelName] = await leitura.db.collection(Model.collection.name)
      .countDocuments({ _id: { $in: registros.get(Model) } });
  }
  t.after(async () => {
    const falhas = [];
    if (servidor) {
      try { await new Promise((resolve, reject) => servidor.close((e) => e ? reject(e) : resolve())); }
      catch { falhas.push("encerramento HTTP"); }
    }
    // Recupera documentos de requisições cuja resposta possa ter falhado.
    if (leitura) {
      try { await descobrir(); } catch { falhas.push("descoberta das fixtures"); }
    }
    if (conexao) {
      try { await limparRegistrosTeste(conexao, registros); }
      catch { falhas.push("limpeza dos IDs próprios"); }
    }
    if (leitura) {
      try {
        confirmarModels(leitura);
        for (const Model of modelos) {
          const colecao = leitura.db.collection(Model.collection.name);
          assert.equal(await colecao.countDocuments({ _id: { $in: registros.get(Model) } }), 0);
          if (Model !== Usuario) assert.equal(await colecao.countDocuments({ usuarioId: { $in: registros.get(Usuario) } }), 0);
        }
        assert.equal(await leitura.db.collection(Usuario.collection.name)
          .countDocuments({ email: { $in: [...emails] } }), 0);
        t.diagnostic(`Documentos criados e removidos: ${JSON.stringify(contabilizados)}; zero resíduos por conexão independente.`);
      } catch { falhas.push("verificação independente de resíduos"); }
    }
    try { await leitura?.close(); } catch { falhas.push("fechamento leitura"); }
    try { await conexao?.close(); } catch { falhas.push("fechamento principal"); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    assert.equal(falhas.length, 0, `Teardown incompleto: ${falhas.join(", ")}`);
  });
  conexao = await conectarBancoCommitReal();
  confirmarModels(conexao, modelos);
  // Padrão existente de criação aditiva, limitado às três coleções desta suíte.
  for (const Model of modelos) {
    confirmarModels(conexao, [Model]);
    await Model.createCollection();
    await Model.createIndexes();
  }
  leitura = await abrirConexaoTeste({ leitura: true });
  confirmarModels(leitura);
  assert.notEqual(leitura.getClient(), conexao.getClient());
  const indices = await leitura.db.collection(Usuario.collection.name).listIndexes().toArray();
  assert.ok(indices.some((i) => i.unique === true && i.key.email === 1 && Object.keys(i.key).length === 1), "Índice único de email não confirmado");
  const app = express(); app.use(express.json());
  app.use("/usuarios", usuarioRoutes); app.use("/responsaveis", responsavelRoutes); app.use("/criancas", criancaRoutes);
  servidor = app.listen(0, "127.0.0.1"); await once(servidor, "listening");
  base = `http://127.0.0.1:${servidor.address().port}`;
  t.diagnostic("Banco confirmado: conectamente_testes; duas conexões independentes; sem mocks.");
  async function conta(perfil) {
    const email = `${chave}-${emails.size}@example.invalid`;
    confirmarModels(leitura);
    assert.equal(await leitura.db.collection(Usuario.collection.name).countDocuments({ email }), 0);
    emails.add(email); // Registra chave própria ANTES do POST.
    return { nome: chave, email, senha: randomUUID(), perfil };
  }
  async function chamar(method, url, dados, ator) {
    confirmarModels(conexao, modelos);
    const res = await fetch(base + url, {
      method, signal: AbortSignal.timeout(15000),
      headers: { ...(dados === undefined ? {} : { "Content-Type": "application/json" }), ...(ator ? { Authorization: `Bearer ${ator.token}` } : {}) },
      ...(dados === undefined ? {} : { body: JSON.stringify(dados) }),
    });
    const body = await res.json();
    assert.ok(!Object.hasOwn(body, "senha"), "Senha/hash exposto na resposta");
    if (body.usuario) assert.ok(!Object.hasOwn(body.usuario, "senha"));
    return { status: res.status, body };
  }
  async function cadastrar(c) {
    const r = await chamar("POST", "/usuarios", { nome: c.nome, email: c.email, senha: c.senha, perfil: c.perfil });
    assert.equal(r.status, 201);
    c.id = r.body._id; registrar(Usuario, c.id);
    const salvo = await leitura.db.collection(Usuario.collection.name).findOne({ email: c.email });
    assert.ok(salvo && String(salvo._id) === c.id, "Conta não persistiu em leitura independente");
    assert.ok(salvo.senha !== c.senha && await bcrypt.compare(c.senha, salvo.senha), "Hash persistido incorreto");
    assert.equal(bcrypt.getRounds(salvo.senha), 12);
  }
  async function login(c) {
    const r = await chamar("POST", "/usuarios/auth", { email: c.email, senha: c.senha });
    assert.equal(r.status, 200);
    const claims = jwt.verify(r.body.token, process.env.JWT_SECRET);
    assert.ok(claims.id === c.id && claims.perfil === c.perfil);
    assert.equal(claims.exp - claims.iat, 18000);
    c.token = r.body.token;
  }
  async function perfil(c) {
    const Model = c.perfil === "crianca" ? Crianca : Responsavel;
    const r = await chamar("POST", c.perfil === "crianca" ? "/criancas" : "/responsaveis", {}, c);
    assert.equal(r.status, 201);
    c.perfilId = r.body._id; registrar(Model, c.perfilId);
    const salvo = await leitura.db.collection(Model.collection.name).findOne({ usuarioId: new mongoose.Types.ObjectId(c.id) });
    assert.ok(salvo && String(salvo._id) === c.perfilId);
  }
  const resp = await conta("responsavel"), filho = await conta("crianca");
  await t.test("01 cadastro responsável persiste e bcrypt verifica senha", () => cadastrar(resp));
  await t.test("02 login de responsável persistido emite JWT", () => login(resp));
  await t.test("03 cria perfil responsável e verifica por outra conexão", () => perfil(resp));
  await t.test("04 cadastro criança persiste e bcrypt verifica senha", () => cadastrar(filho));
  await t.test("05 login infantil persistido emite JWT", () => login(filho));
  await t.test("06 cria perfil infantil com ID distinto de Usuario", async () => {
    await perfil(filho); assert.notEqual(filho.id, filho.perfilId);
  });
  await t.test("07 vínculo HTTP persiste entre perfis e mantém permissão false", async () => {
    const r = await chamar("POST", "/responsaveis/vincular-crianca", { email: filho.email, senha: filho.senha }, resp);
    assert.equal(r.status, 200);
    const salvo = await leitura.db.collection(Crianca.collection.name).findOne({ _id: new mongoose.Types.ObjectId(filho.perfilId) });
    assert.ok(String(salvo.responsavelId) === resp.perfilId);
    assert.equal(salvo.permissaoAtiva, false);
  });
  await t.test("08 JWT consulta conta e perfil infantil sem senha", async () => {
    for (const c of [resp, filho]) {
      const r = await chamar("GET", "/usuarios/meu-perfil", undefined, c);
      assert.equal(r.status, 200); assert.equal(r.body._id, c.id);
    }
    const r = await chamar("GET", "/criancas/meu-perfil", undefined, filho);
    assert.equal(r.status, 200); assert.equal(r.body._id, filho.perfilId);
  });
  await t.test("09 índice único real rejeita duplicado HTTP e gravação direta", async () => {
    const r = await chamar("POST", "/usuarios", { nome: filho.nome, email: filho.email, senha: filho.senha, perfil: filho.perfil });
    assert.equal(r.status, 409);
    const idTentativa = new mongoose.Types.ObjectId(); registrar(Usuario, idTentativa);
    let codigo;
    try { await Usuario.collection.insertOne({ _id: idTentativa, email: filho.email }); }
    catch (e) { codigo = e.code; }
    assert.equal(codigo, 11000, "Índice não rejeitou duplicação no driver");
    assert.equal(await leitura.db.collection(Usuario.collection.name).countDocuments({ email: filho.email }), 1);
  });
  await t.test("10 senha incorreta e email inexistente retornam 401", async () => {
    for (const email of [filho.email, `${chave}-ausente@example.invalid`]) {
      const r = await chamar("POST", "/usuarios/auth", { email, senha: "incorreta-ficticia" });
      assert.equal(r.status, 401); assert.equal(r.body.token, undefined);
    }
  });
  await t.test("11 listagem confirma vínculo, nomes e IDs persistidos", async () => {
    const r = await chamar("GET", "/responsaveis/minhas-criancas", undefined, resp);
    assert.equal(r.status, 200); assert.equal(r.body.length, 1);
    assert.ok(r.body[0]._id === filho.perfilId && r.body[0].usuarioId === filho.id);
  });
  let parcial;
  await t.test("12 falha no cadastro infantil por email duplicado mantém responsável e perfil", async () => {
    parcial = await conta("responsavel"); await cadastrar(parcial); await login(parcial); await perfil(parcial);
    const r = await chamar("POST", "/usuarios", { nome: chave, email: parcial.email, senha: randomUUID(), perfil: "crianca" });
    assert.equal(r.status, 409);
    assert.equal(await leitura.db.collection(Usuario.collection.name).countDocuments({ email: parcial.email }), 1);
    assert.equal(await leitura.db.collection(Responsavel.collection.name).countDocuments({ usuarioId: new mongoose.Types.ObjectId(parcial.id) }), 1);
    assert.equal(await leitura.db.collection(Crianca.collection.name).countDocuments({ usuarioId: new mongoose.Types.ObjectId(parcial.id) }), 0);
  });
  await t.test("13 repetir cadastro parcial retorna 409, mas conta anterior ainda faz login", async () => {
    const r = await chamar("POST", "/usuarios", { nome: parcial.nome, email: parcial.email, senha: parcial.senha, perfil: parcial.perfil });
    assert.equal(r.status, 409); await login(parcial);
  });
  await t.test("14 falha de perfil infantil mantém conta sem perfil; login funciona", async () => {
    const c = await conta("crianca"); await cadastrar(c); await login(c);
    // dataNascimento é campo real do backend; não inventa regra de senha/email.
    const r = await chamar("POST", "/criancas", { dataNascimento: "data-invalida" }, c);
    assert.equal(r.status, 400);
    assert.equal(await leitura.db.collection(Crianca.collection.name).countDocuments({ usuarioId: new mongoose.Types.ObjectId(c.id) }), 0);
    await login(c);
    assert.equal((await chamar("GET", "/criancas/meu-perfil", undefined, c)).status, 404);
    assert.equal((await chamar("POST", "/responsaveis/vincular-crianca", { email: c.email, senha: c.senha }, resp)).status, 404);
  });
  await t.test("15 vínculo com senha incorreta mantém conta/perfil sem responsável", async () => {
    const c = await conta("crianca"); await cadastrar(c); await login(c); await perfil(c);
    assert.equal((await chamar("POST", "/responsaveis/vincular-crianca", { email: c.email, senha: "incorreta-ficticia" }, resp)).status, 401);
    const salvo = await leitura.db.collection(Crianca.collection.name).findOne({ usuarioId: new mongoose.Types.ObjectId(c.id) });
    assert.equal(salvo.responsavelId, null); assert.equal(salvo.permissaoAtiva, false);
    await login(c);
  });
  await descobrir();
  // Corrige contagem de IDs de tentativas rejeitadas: somente documentos reais.
  for (const Model of modelos) contabilizados[Model.modelName] = await leitura.db.collection(Model.collection.name)
    .countDocuments({ _id: { $in: registros.get(Model) } });
  t.diagnostic(`Persistidos antes da limpeza: ${JSON.stringify(contabilizados)}.`);
});
