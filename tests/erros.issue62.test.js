import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

// Isolamento por processo do node:test. Só os Services são substituídos;
// Controllers, Routers, JWT, bcrypt e respostas Express são os reais.
// Nenhum Service/Model real é carregado e nenhuma conexão MongoDB é aberta.
const estado = { erro: null, valor: {}, chamadas: [] };
globalThis.__issue62Service = (...args) => {
  estado.chamadas.push(args);
  if (estado.erro) throw estado.erro;
  return Promise.resolve(estado.valor);
};
const hooks = registerHooks({
  load(url, context, next) {
    if (url.startsWith(new URL("../services/", import.meta.url).href)) {
      const source = readFileSync(new URL(url), "utf8");
      const nomes = new Set([
        ...[...source.matchAll(/(?:const|function)\s+(\w+)/g)].map((m) => m[1]),
      ]);
      const exports = [...nomes].map((nome) =>
        `export const ${nome} = (...args) => globalThis.__issue62Service(...args);`,
      ).join("\n");
      return { format: "module", shortCircuit: true, source:
        `${exports}\nexport default {${[...nomes].join(",")}};` };
    }
    return next(url, context);
  },
});
const grupos = [];
for (const arquivo of readdirSync(new URL("../controllers/", import.meta.url))) {
  const modulo = await import(`../controllers/${arquivo}`);
  grupos.push({ arquivo, funcoes: modulo.default ?? modulo });
}
const autentificar = (await import("../middleware/Auth.js")).default;
const autorizarPerfil = (await import("../middleware/autorizarPerfil.js")).default;
const routers = [];
for (const arquivo of readdirSync(new URL("../routes/", import.meta.url))) {
  routers.push({ arquivo, router: (await import(`../routes/${arquivo}`)).default });
}
hooks.deregister();

const id = "111111111111111111111111";
const body = {
  nome: "Teste", email: "teste@example.invalid", senha: "senha-ficticia", perfil: "crianca",
  titulo: "Teste", enunciado: "Teste", descricao: "Teste", comodoId: id,
  imagemObjeto: "teste.png", posicao: { x: 0, y: 0, largura: 1, altura: 1 }, ordem: 1,
  dificuldade: "facil", tarefaId: id, texto: "Teste", correta: false,
  perfilJogoId: id, jogoSalvoId: id, respostaEscolhidaId: id,
  nomeAvatar: "Teste", imagemAvatar: "teste.png", nomeJogo: "Teste", permissaoAtiva: false,
  limiteTempoDiario: 30,
};
function req(dados = body) {
  return { body: dados, params: { id, usuarioId: id, criancaId: id, comodoId: id, tarefaId: id, respostaId: id },
    usuario: { id, perfil: "crianca" }, headers: {} };
}
function res() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; },
    json(dados) { this.body = dados; return this; },
    sendStatus(n) { this.statusCode = n; return this; } };
}
function configurar(t, erro = null, valor = { _id: id, permissaoAtiva: false, limiteTempoDiario: 30,
  acertou: false, tentativa: 2, pontuacaoGanha: 0, dificuldade: "facil" }) {
  estado.erro = erro; estado.valor = valor; estado.chamadas = [];
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "log", () => {});
}
function contrato(resposta, status) {
  assert.equal(resposta.statusCode, status);
  assert.equal(resposta.body?.erro, true);
  assert.equal(typeof resposta.body.mensagem, "string");
  assert.ok(resposta.body.mensagem.trim());
  assert.deepEqual(Object.keys(resposta.body).filter((k) => !["erro", "mensagem", "codigo"].includes(k)), []);
}
async function executar(fn, requisicao = req()) {
  const resposta = res(); await fn(requisicao, resposta); return resposta;
}
const falha = () => Object.assign(new Error("senha=ficticia; mongodb://host-interno; stack-interna"),
  { stack: "stack-interna", keyValue: { email: "segredo@example.invalid" } });

for (const { arquivo, funcoes } of grupos) {
  for (const [nome, fn] of Object.entries(funcoes)) {
    test(`#62 ${arquivo}/${nome}: 500 sanitizado`, async (t) => {
      configurar(t, falha());
      const resposta = await executar(fn);
      assert.equal(resposta.statusCode, 500);
      assert.doesNotMatch(JSON.stringify(resposta.body), /ficticia|mongodb|stack-interna|keyValue|segredo/);
      contrato(resposta, 500);
      assert.ok(estado.chamadas.length);
    });
    test(`#62 ${arquivo}/${nome}: sucesso preservado`, async (t) => {
      configurar(t);
      if (nome === "loginUsuario") {
        estado.valor = { _id: id, nome: body.nome, email: body.email, perfil: "crianca", senha: await bcrypt.hash(body.senha, 4) };
        const anterior = process.env.JWT_SECRET;
        process.env.JWT_SECRET = "segredo-ficticio-issue62";
        t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
      }
      const resposta = await executar(fn);
      const status = /^(delete|excluir|remover)/.test(nome) ? 204 : /^(post|cadastrar|registrar)/.test(nome) ? 201 : 200;
      assert.equal(resposta.statusCode, status);
      assert.ok(estado.chamadas.length);
      if (status === 204) assert.equal(resposta.body, undefined);
      else if (nome === "registrarResposta") assert.deepEqual(resposta.body, { acertou: false, tentativa: 2, pontuacaoGanha: 0, dificuldade: "facil" });
      else if (nome === "alterarPermissaoCrianca") assert.deepEqual(resposta.body, { mensagem: "Permissão atualizada com sucesso", permissaoAtiva: false });
      else if (nome === "alterarLimiteTempoCrianca") assert.deepEqual(resposta.body, { mensagem: "Limite diário atualizado com sucesso", limiteTempoDiario: 30 });
      else if (nome === "desvincularCrianca") assert.deepEqual(resposta.body, { mensagem: "Criança desvinculada com sucesso" });
      else if (nome === "loginUsuario") {
        assert.equal(jwt.verify(resposta.body.token, process.env.JWT_SECRET).id, id);
        assert.equal(resposta.body.usuario.senha, undefined);
      } else assert.deepEqual(resposta.body, estado.valor);
    });
  }
  // Todas as traduções explícitas do Controller; o status esperado vem do
  // contrato de domínio, não da resposta observada durante o teste.
  const source = readFileSync(new URL(`../controllers/${arquivo}`, import.meta.url), "utf8");
  const codigos = [...new Set([...source.matchAll(/error\.message === "([A-Z_]+)"/g)].map((m) => m[1]))];
  const primeira = Object.entries(funcoes).find(([nome]) => !/login/.test(nome))[1];
  for (const codigo of codigos) {
    const fn = Object.values(funcoes).find((f) => f.toString().includes(`"${codigo}"`)) ?? primeira;
    const status = /NAO_ENCONTRAD|NAO_VINCULADA/.test(codigo) ? 404 : /EXISTENTE|JA_VINCULADA/.test(codigo) ? 409 :
      codigo === "CREDENCIAIS_INVALIDAS" ? 401 : /ACESSO_NEGADO|INATIVA|BLOQUEAD|FORA_DA_ORDEM|INDISPONIVEL/.test(codigo) ? 403 : 400;
    test(`#62 ${arquivo}: ${codigo} -> ${status}`, async (t) => {
      configurar(t, new Error(codigo));
      const resposta = await executar(fn);
      contrato(resposta, status);
      if (/BLOQUEAD|FORA_DA_ORDEM|COMODO_INDISPONIVEL/.test(codigo)) assert.equal(resposta.body.codigo, codigo);
    });
  }
  for (const name of ["CastError", "ValidationError", "DocumentNotFoundError"]) {
    if (!source.includes(`error.name === "${name}"`)) continue;
    test(`#62 ${arquivo}: ${name} sem detalhes técnicos`, async (t) => {
      const fn = Object.values(funcoes).find((f) => f.toString().includes(`"${name}"`)) ?? primeira;
      configurar(t, Object.assign(falha(), { name }));
      const resposta = await executar(fn);
      contrato(resposta, name === "DocumentNotFoundError" ? 404 : 400);
      assert.doesNotMatch(JSON.stringify(resposta.body), /ficticia|mongodb|stack-interna|keyValue|segredo/);
    });
  }
  if (source.includes("11000")) test(`#62 ${arquivo}: duplicidade -> 409`, async (t) => {
    configurar(t, Object.assign(falha(), { code: 11000 }));
    contrato(await executar(primeira), 409);
  });
  if (source.includes("error.status === 400")) test(`#62 ${arquivo}: erro de negócio status 400`, async (t) => {
    configurar(t, Object.assign(new Error("Referência de mídia inválida"), { status: 400 }));
    const resposta = await executar(primeira);
    contrato(resposta, 400);
    assert.equal(resposta.body.mensagem, "Referência de mídia inválida");
  });
  for (const [nome, fn] of Object.entries(funcoes)) {
    if (!/if \(!\w+\)/.test(fn.toString()) || !/^(get|put|patch|delete)/.test(nome)) continue;
    test(`#62 ${arquivo}/${nome}: registro ausente`, async (t) => {
      configurar(t, null, null);
      const resposta = await executar(fn);
      contrato(resposta, 404);
    });
  }
}

for (const caso of ["usuario ausente", "senha incorreta", "segredo ausente"]) {
  test(`#62 login: ${caso}`, async (t) => {
    configurar(t);
    const anterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "segredo-ficticio-issue62";
    t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
    estado.valor = caso === "usuario ausente" ? null : { _id: id, perfil: "crianca",
      senha: await bcrypt.hash(caso === "senha incorreta" ? "outra-senha" : body.senha, 4) };
    if (caso === "segredo ausente") delete process.env.JWT_SECRET;
    const fn = grupos.find((g) => g.arquivo === "usuarioController.js").funcoes.loginUsuario;
    const resposta = await executar(fn);
    contrato(resposta, caso === "segredo ausente" ? 500 : 401);
    assert.doesNotMatch(JSON.stringify(resposta.body), /JWT_SECRET|senha-ficticia|hash|stack/);
  });
}

test("#62 tarefa: ordem duplicada -> 409", async (t) => {
  configurar(t, Object.assign(falha(), { code: 11000 }));
  const fn = grupos.find((g) => g.arquivo === "tarefaController.js").funcoes.postTarefa;
  contrato(await executar(fn), 409);
});

for (const ordem of [undefined, null, 0]) {
  test(`#62 PUT tarefa: ordem ${String(ordem)}`, async (t) => {
    configurar(t);
    const dados = { ...body, ordem };
    if (ordem === undefined) delete dados.ordem;
    const fn = grupos.find((g) => g.arquivo === "tarefaController.js").funcoes.putTarefaById;
    const resposta = await executar(fn, req(dados));
    if (ordem === 0) {
      assert.equal(resposta.statusCode, 200);
      assert.equal(estado.chamadas.length, 1);
      assert.equal(estado.chamadas[0][1].ordem, 0);
    } else {
      contrato(resposta, 400);
      assert.equal(estado.chamadas.length, 0);
    }
  });
}

// Lista fixa independente das condições extraídas do código: remover ou
// renomear uma regra em produção precisa quebrar estes testes de regressão.
for (const [arquivo, metodo, codigo, mensagem] of [
  ["historicoJogoController.js", "registrarResposta", "TAREFA_FORA_DA_ORDEM", "Vamos tentar outra atividade primeiro!"],
  ["historicoJogoController.js", "registrarResposta", "DIFICULDADE_BLOQUEADA", "Conclua a dificuldade anterior para continuar!"],
  ["historicoJogoController.js", "registrarResposta", "COMODO_BLOQUEADO", "Conclua o cômodo anterior para continuar!"],
  ["historicoJogoController.js", "registrarResposta", "COMODO_INDISPONIVEL", "Cômodo indisponível no momento"],
  ["jogoSalvoController.js", "editarJogoSalvo", "TAREFA_FORA_DA_ORDEM", "Conclua as tarefas anteriores para continuar!"],
  ["jogoSalvoController.js", "editarJogoSalvo", "DIFICULDADE_BLOQUEADA", "Conclua a dificuldade anterior para continuar!"],
  ["jogoSalvoController.js", "editarJogoSalvo", "COMODO_BLOQUEADO", "Conclua o cômodo anterior para continuar!"],
]) test(`#62 progressão fixa ${arquivo}: ${codigo}`, async (t) => {
  configurar(t, new Error(codigo));
  const fn = grupos.find((g) => g.arquivo === arquivo).funcoes[metodo];
  const resposta = await executar(fn);
  assert.equal(resposta.statusCode, 403);
  assert.deepEqual(resposta.body, { erro: true, mensagem, codigo });
});

for (const arquivo of ["usuarioController.js", "tarefaController.js", "respostaController.js", "historicoJogoController.js", "responsavelController.js"]) {
  const funcoes = grupos.find((g) => g.arquivo === arquivo).funcoes;
  const nomes = { "usuarioController.js": ["postUsuario", "putUsuarioById", "loginUsuario"],
    "tarefaController.js": ["postTarefa", "putTarefaById", "patchTarefaById"],
    "respostaController.js": ["postResposta", "putRespostaById", "patchRespostaById"],
    "historicoJogoController.js": ["registrarResposta"],
    "responsavelController.js": ["vincularCrianca", "alterarPermissaoCrianca"] }[arquivo];
  for (const nome of nomes) for (const dados of [undefined, {}]) {
    if (nome === "alterarPermissaoCrianca" && dados !== undefined) continue;
    test(`#62 ${arquivo}/${nome}: body ${dados === undefined ? "ausente" : "vazio"} -> 400`, async (t) => {
      configurar(t);
      const requisicao = req(); requisicao.body = dados;
      contrato(await executar(funcoes[nome], requisicao), 400);
      assert.equal(estado.chamadas.length, 0);
    });
  }
}

test("#62 HTTP: routers reais, autenticação, autorização e DELETE sem corpo", async (t) => {
  configurar(t);
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "segredo-ficticio-issue62";
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  // Executa o index.js real. Bloqueia somente conexão, dotenv e porta fixa;
  // parsing, handlers 400/404, ordem e montagem dos routers são de produção.
  let app;
  let server;
  let conexoes = 0;
  globalThis.__issue62Connect = () => { conexoes++; };
  const bootstrapHooks = registerHooks({
    load(url, context, next) {
      if (url === new URL("../config/db-connection.js", import.meta.url).href) {
        return { format: "module", shortCircuit: true,
          source: "export default () => globalThis.__issue62Connect();" };
      }
      return next(url, context);
    },
  });
  t.mock.method(dotenv, "config", () => ({ parsed: {} }));
  const listenOriginal = express.application.listen;
  t.mock.method(express.application, "listen", function () {
    app = this;
    server = listenOriginal.call(this, 0, "127.0.0.1");
    return server;
  });
  try { await import("../index.js"); }
  finally { bootstrapHooks.deregister(); delete globalThis.__issue62Connect; }
  assert.equal(conexoes, 1, "A conexão real foi substituída antes de importar index.js");
  const prefixos = { usuario: "usuarios", comodo: "comodos", tarefa: "tarefas", resposta: "respostas",
    crianca: "criancas", responsavel: "responsaveis", historicoJogo: "historico-jogo",
    progresso: "criancas", historicoConsulta: "criancas", perfilJogo: "perfis-jogo", jogoSalvo: "jogos-salvos" };
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  if (!server.listening) await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ id, perfil: "crianca" }, process.env.JWT_SECRET);
  await t.test("bootstrap real: rota raiz preservada", async () => {
    const resposta = await fetch(base + "/");
    assert.equal(resposta.status, 200);
    assert.equal(await resposta.text(), "Api iniciado com Sucesso");
  });
  await t.test("JSON malformado: HTTP 400 padronizado", async () => {
    const resposta = await fetch(base + "/usuarios", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: '{"nome":' });
    assert.equal(resposta.status, 400);
    assert.match(resposta.headers.get("content-type"), /application\/json/);
    contrato({ statusCode: resposta.status, body: await resposta.json() }, 400);
  });
  await t.test("rota inexistente: HTTP 404 padronizado", async () => {
    const resposta = await fetch(base + "/rota-inexistente-issue62");
    assert.equal(resposta.status, 404);
    assert.match(resposta.headers.get("content-type"), /application\/json/);
    contrato({ statusCode: resposta.status, body: await resposta.json() }, 404);
  });
  await t.test("JSON malformado: sem stack ou caminhos internos em desenvolvimento", async () => {
    // Express usa o mesmo ambiente selecionado pelo bootstrap de produção.
    // Tornar explícito o cenário de desenvolvimento evita depender do host.
    app.set("env", "development");
    const resposta = await fetch(base + "/usuarios", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: '{"nome":' });
    assert.equal(resposta.status, 400);
    assert.doesNotMatch(await resposta.text(), /SyntaxError|node_modules|[A-Z]:\\|at (?:parse|JSON)/);
  });
  await t.test("parâmetro de URL malformado: 400 JSON sem detalhes internos", async () => {
    const resposta = await fetch(base + "/tarefas/%ZZ", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(resposta.status, 400);
    const texto = await resposta.text();
    assert.doesNotMatch(texto, /URIError|node_modules|[A-Z]:\\/);
    assert.match(resposta.headers.get("content-type"), /application\/json/);
    contrato({ statusCode: resposta.status, body: JSON.parse(texto) }, 400);
  });
  for (const { arquivo, router } of routers) {
    for (const layer of router.stack.filter((l) => l.route)) {
      const rota = layer.route;
      const metodo = Object.keys(rota.methods)[0].toUpperCase();
      const caminho = `/${prefixos[arquivo.replace("Routes.js", "")]}${rota.path.replace(/:\w+/g, id)}`;
      if (arquivo === "usuarioRoutes.js" && metodo === "POST") continue;
      await t.test(`${metodo} ${caminho}: 401 padronizado`, async () => {
        const resposta = await fetch(base + caminho, { method: metodo });
        contrato({ statusCode: resposta.status, body: await resposta.json() }, 401);
      });
      const desvinculacao = arquivo === "responsavelRoutes.js" &&
        rota.path === "/minhas-criancas/:criancaId/vinculo";
      if (metodo === "DELETE" && desvinculacao) await t.test(`${caminho}: 200 e confirmação da desvinculação`, async () => {
        const tokenResponsavel = jwt.sign({ id, perfil: "responsavel" }, process.env.JWT_SECRET);
        const resposta = await fetch(base + caminho, { method: metodo, headers: { Authorization: `Bearer ${tokenResponsavel}` } });
        assert.equal(resposta.status, 200);
        assert.match(resposta.headers.get("content-type"), /application\/json/);
        assert.deepEqual(await resposta.json(), { mensagem: "Criança desvinculada com sucesso" });
      });
      if (metodo === "DELETE" && !desvinculacao) await t.test(`${caminho}: 204 real sem bytes`, async () => {
        const resposta = await fetch(base + caminho, { method: metodo, headers: { Authorization: `Bearer ${token}` } });
        assert.equal(resposta.status, 204); assert.equal(await resposta.text(), "");
        assert.equal(resposta.headers.get("content-type"), null);
      });
    }
  }
});

for (const caso of ["ausente", "formato", "assinatura", "expirado", "sem segredo", "sem usuario", "perfil negado", "valido"]) {
  test(`#62 middleware: ${caso}`, (t) => {
    configurar(t);
    const anterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "segredo-ficticio-issue62";
    t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
    const requisicao = req(); const resposta = res(); let chamadas = 0;
    const token = jwt.sign({ id, perfil: "crianca" }, caso === "assinatura" ? "outro-segredo" : process.env.JWT_SECRET,
      { expiresIn: caso === "expirado" ? -60 : 60 });
    requisicao.headers.authorization = `Bearer ${token}`;
    if (caso === "ausente") delete requisicao.headers.authorization;
    if (caso === "formato") requisicao.headers.authorization = "Basic token";
    if (caso === "sem segredo") delete process.env.JWT_SECRET;
    if (caso === "sem usuario") delete requisicao.usuario;
    const middleware = ["sem usuario", "perfil negado"].includes(caso) ? autorizarPerfil("responsavel") : autentificar;
    middleware(requisicao, resposta, () => chamadas++);
    if (caso === "valido") { assert.equal(chamadas, 1); assert.equal(requisicao.usuario.id, id); }
    else { assert.equal(chamadas, 0); contrato(resposta, caso === "sem segredo" ? 500 : caso === "perfil negado" ? 403 : 401); }
  });
}
