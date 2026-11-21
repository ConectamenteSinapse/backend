import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Usuario from "../models/usuarioModel.js";
import usuarioRoutes from "../routes/usuarioRoutes.js";
import responsavelRoutes from "../routes/responsavelRoutes.js";
import criancaRoutes from "../routes/criancaRoutes.js";

// HTTP, routers, controllers, services, bcrypt e JWT reais; SOMENTE banco simulado.
// Não importa index.js, dotenv ou conexão MongoDB. Dados exclusivamente fictícios.
test("auditoria de cadastro/login HTTP com persistência simulada", async (t) => {
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "segredo-exclusivo-da-auditoria-local";
  t.after(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  const usuarios = [];
  t.mock.method(Usuario, "create", async (dados) => {
    const doc = new Usuario(dados);
    await doc.validate(); // validadores reais; índice único abaixo é simulado.
    if (usuarios.some((u) => u.email === dados.email)) {
      throw Object.assign(new Error("duplicado simulado"), { code: 11000 });
    }
    usuarios.push(doc);
    return doc;
  });
  t.mock.method(Usuario, "findOne", async (filtro) =>
    usuarios.find((u) => u.email === filtro.email) ?? null,
  );
  t.mock.method(Usuario, "findById", (id) => ({
    select: async (projecao) => {
      assert.equal(projecao, "-senha");
      const doc = usuarios.find((u) => String(u._id) === String(id));
      if (!doc) return null;
      const dados = doc.toObject();
      delete dados.senha;
      return dados;
    },
  }));
  const app = express();
  app.use(express.json());
  app.use("/usuarios", usuarioRoutes);
  app.use("/responsaveis", responsavelRoutes);
  app.use("/criancas", criancaRoutes);
  const servidor = app.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  async function chamar(url, body, token) {
    const res = await fetch(base + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token === undefined ? {} : { Authorization: token }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, dados: await res.json() };
  }
  const cadastro = {
    nome: "Conta fictícia", email: "auditoria@example.invalid",
    senha: "Senha apenas de teste", perfil: "responsavel",
  };
  let token;
  await t.test("cadastro válido: 201, hash bcrypt custo 12 e resposta sem senha", async () => {
    const r = await chamar("/usuarios", cadastro);
    assert.equal(r.status, 201);
    assert.equal(r.dados.senha, undefined);
    assert.equal(r.dados.perfil, cadastro.perfil);
    assert.equal(bcrypt.getRounds(usuarios[0].senha), 12);
    assert.equal(await bcrypt.compare(cadastro.senha, usuarios[0].senha), true);
  });
  for (const campo of ["nome", "email", "senha", "perfil"]) {
    for (const valor of [undefined, "", "   ", 123]) {
      await t.test(`cadastro rejeita ${campo} obrigatório: ${String(valor)}`, async () => {
        const r = await chamar("/usuarios", { ...cadastro, [campo]: valor });
        assert.equal(r.status, 400);
        assert.equal(r.dados.mensagem, "Campos obrigatórios inválidos ou não preenchidos");
      });
    }
  }
  await t.test("perfil fora do domínio retorna 400", async () => {
    const r = await chamar("/usuarios", { ...cadastro, perfil: "admin" });
    assert.equal(r.status, 400);
    assert.equal(r.dados.mensagem, "Perfil de usuário inválido");
  });
  await t.test("duplicidade simulada retorna 409", async () => {
    const r = await chamar("/usuarios", cadastro);
    assert.equal(r.status, 409);
    assert.equal(r.dados.mensagem, "Email já cadastrado");
  });
  await t.test("caracterização: backend aceita email sem formato e senha de um caractere", async () => {
    const r = await chamar("/usuarios", { ...cadastro, email: "sem-arroba", senha: "x", perfil: "crianca" });
    assert.equal(r.status, 201);
    assert.equal(r.dados.senha, undefined);
  });
  for (const perfil of ["responsavel", "crianca"]) {
    await t.test(`login ${perfil}: 200, JWT verificável de 5h, dados sem hash`, async () => {
      const r = await chamar("/usuarios/auth", perfil === "responsavel"
        ? { email: cadastro.email, senha: cadastro.senha }
        : { email: "sem-arroba", senha: "x" });
      assert.equal(r.status, 200);
      const claims = jwt.verify(r.dados.token, process.env.JWT_SECRET);
      assert.equal(claims.perfil, perfil);
      assert.equal(claims.id, r.dados.usuario.id);
      assert.equal(claims.exp - claims.iat, 5 * 3600);
      assert.deepEqual(Object.keys(r.dados.usuario).sort(), ["email", "id", "nome", "perfil"]);
      assert.equal(claims.senha, undefined);
      if (perfil === "responsavel") token = r.dados.token;
    });
  }
  for (const [nome, body, status] of [
    ["email inexistente", { email: "ausente@example.invalid", senha: "x" }, 401],
    ["senha incorreta", { email: cadastro.email, senha: "errada" }, 401],
    ["body vazio", {}, 400],
    ["email vazio", { email: "", senha: "x" }, 400],
    ["senha vazia", { email: cadastro.email, senha: "" }, 400],
    ["senha não string", { email: cadastro.email, senha: {} }, 400],
    ["email não string", { email: { $ne: null }, senha: "x" }, 400],
  ]) {
    await t.test(`login ${nome}: ${status}`, async () => {
      const r = await chamar("/usuarios/auth", body);
      assert.equal(r.status, status);
      assert.equal(r.dados.token, undefined);
      if (status === 401) assert.equal(r.dados.mensagem, "Email ou senha inválidos");
    });
  }
  await t.test("meu-perfil usa id do JWT e exclui senha", async () => {
    const r = await chamar("/usuarios/meu-perfil", undefined, `Bearer ${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.dados.email, cadastro.email);
    assert.equal(r.dados.senha, undefined);
  });
  for (const [nome, auth] of [
    ["ausente", undefined], ["inválido", "Bearer invalido"],
    ["formato errado", "Basic teste"],
    ["assinatura incorreta", `Bearer ${jwt.sign({ id: "teste" }, "outro-segredo")}`],
    ["expirado", `Bearer ${jwt.sign({ id: "teste" }, process.env.JWT_SECRET, { expiresIn: -1 })}`],
  ]) {
    await t.test(`JWT ${nome}: 401 em endpoint privado`, async () => {
      assert.equal((await chamar("/usuarios/meu-perfil", undefined, auth)).status, 401);
    });
  }
  for (const [url, perfil] of [["/responsaveis", "crianca"], ["/criancas", "responsavel"]]) {
    await t.test(`perfil ${perfil} impedido em POST ${url}: 403`, async () => {
      const auth = jwt.sign({ id: String(usuarios[0]._id), perfil }, process.env.JWT_SECRET);
      assert.equal((await chamar(url, {}, `Bearer ${auth}`)).status, 403);
    });
    await t.test(`POST ${url} sem autenticação: 401`, async () => {
      assert.equal((await chamar(url, {})).status, 401);
    });
  }
  await t.test("erro inesperado de persistência: 500 sem detalhes na resposta", async (s) => {
    s.mock.method(Usuario, "findOne", async () => { throw new Error("falha fictícia"); });
    s.mock.method(console, "error", () => {});
    const r = await chamar("/usuarios/auth", { email: cadastro.email, senha: cadastro.senha });
    assert.equal(r.status, 500);
    assert.equal(r.dados.mensagem, "Erro interno do servidor");
  });
  await t.test("JWT_SECRET ausente: login e validação retornam 500 genérico", async (s) => {
    s.mock.method(console, "error", () => {});
    const segredo = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.equal((await chamar("/usuarios/auth", { email: cadastro.email, senha: cadastro.senha })).status, 500);
      assert.equal((await chamar("/usuarios/meu-perfil", undefined, `Bearer ${token}`)).status, 500);
    } finally { process.env.JWT_SECRET = segredo; }
  });
});
