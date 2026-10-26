import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Usuario from "../models/usuarioModel.js";
import Crianca from "../models/criancaModel.js";
import Responsavel from "../models/responsavelModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Partida from "../models/jogoSalvoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import usuarioRoutes from "../routes/usuarioRoutes.js";
import criancaRoutes from "../routes/criancaRoutes.js";
import responsavelRoutes from "../routes/responsavelRoutes.js";
import historicoRoutes from "../routes/historicoJogoRoutes.js";
import { criarCatalogo } from "./helpers/catalogo.js";
import {
  motivoIgnorarAtlas, validarAtivacao, obterUriTeste, abrirConexaoTeste,
  prepararColecoesTeste, confirmarModels, limparRegistrosTeste,
} from "./helpers/atlasSeguro.js";

// HTTP, Services, Models, bcrypt, JWT e transações reais. Não importa index.js,
// não carrega .env, não gera tokens e não substitui Services/queries por mocks.
test("#94 Fase 1: identidade, vínculo e permissão por HTTP com MongoDB", {
  skip: motivoIgnorarAtlas(), concurrency: false,
}, async (t) => {
  validarAtivacao();
  obterUriTeste();
  const execucao = `issue94-${randomUUID()}`;
  const segredoAnterior = process.env.JWT_SECRET;
  const segredo = randomUUID();
  const contas = [];
  const emails = new Set();
  // As APIs geram seus IDs. Registrar e verificar ausência das chaves exclusivas
  // ANTES do POST permite recuperar IDs inclusive após falha/resposta incerta.
  const registros = new Map([
    [Historico, []], [Partida, []], [Perfil, []], [Resposta, []], [Tarefa, []],
    [Comodo, []], [Crianca, []], [Responsavel, []], [Usuario, []],
  ]);
  let conexao;
  let leitura;
  let server;
  let base;
  const modelos = [...registros.keys()];
  const ids = (Model) => registros.get(Model);
  const serializar = (valor) => JSON.parse(JSON.stringify(valor));
  const registrar = (Model, valores) => {
    for (const valor of valores) {
      const id = new mongoose.Types.ObjectId(valor);
      if (!ids(Model).some((v) => v.equals(id))) ids(Model).push(id);
    }
  };
  async function descobrirIdentidade() {
    confirmarModels(leitura);
    const usuarios = await leitura.db.collection(Usuario.collection.name)
      .find({ email: { $in: [...emails] } }).toArray();
    for (const doc of usuarios) assert.ok(emails.has(doc.email), "Documento fora da execução");
    registrar(Usuario, usuarios.map((doc) => doc._id));
    for (const Model of [Crianca, Responsavel]) {
      const docs = await leitura.db.collection(Model.collection.name)
        .find({ usuarioId: { $in: ids(Usuario) } }).toArray();
      registrar(Model, docs.map((doc) => doc._id));
    }
    return usuarios;
  }
  async function estado() {
    await descobrirIdentidade();
    const resultado = {};
    for (const Model of modelos) {
      const filtro = Model === Historico
        ? { perfilJogoId: { $in: ids(Perfil) } }
        : { _id: { $in: ids(Model) } };
      resultado[Model.modelName] = serializar(await leitura.db.collection(Model.collection.name)
        .find(filtro).sort({ _id: 1 }).toArray());
    }
    return resultado;
  }
  t.after(async () => {
    const falhas = [];
    try {
      // Aguarda os handlers ativos antes de descobrir/limpar criações HTTP.
      if (server) await new Promise((resolve, reject) => {
        server.close((erro) => erro ? reject(erro) : resolve());
        server.closeIdleConnections();
      });
    } catch { falhas.push(new Error("Falha ao encerrar HTTP da fase 1")); }
    try {
      if (leitura) {
        await descobrirIdentidade();
        const docs = await leitura.db.collection(Historico.collection.name)
          .find({ perfilJogoId: { $in: ids(Perfil) } }).toArray();
        registrar(Historico, docs.map((doc) => doc._id));
      }
    } catch { falhas.push(new Error("Não foi possível recuperar todos os IDs gerados pelo HTTP")); }
    try {
      // Mesmo se a descoberta falhar, tenta remover os IDs já conhecidos.
      if (conexao) await limparRegistrosTeste(conexao, registros, Historico, ids(Perfil));
    } catch { falhas.push(new Error("Limpeza das fixtures da fase 1 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const Model of modelos) {
          assert.equal(await leitura.db.collection(Model.collection.name)
            .countDocuments({ _id: { $in: ids(Model) } }), 0, `Resíduo em ${Model.modelName}`);
        }
        assert.equal(await leitura.db.collection(Usuario.collection.name)
          .countDocuments({ email: { $in: [...emails] } }), 0);
        for (const Model of [Crianca, Responsavel]) {
          assert.equal(await leitura.db.collection(Model.collection.name)
            .countDocuments({ usuarioId: { $in: ids(Usuario) } }), 0);
        }
        assert.equal(await leitura.db.collection(Historico.collection.name)
          .countDocuments({ perfilJogoId: { $in: ids(Perfil) } }), 0);
        t.diagnostic("Limpeza da fase 1 confirmada por conexão independente: zero resíduos de identidade e suporte");
      }
    } catch { falhas.push(new Error("Ausência de resíduos da fase 1 não confirmada")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão principal")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown da fase 1 falhou");
  });
  conexao = await abrirConexaoTeste();
  await prepararColecoesTeste(conexao);
  leitura = await abrirConexaoTeste({ leitura: true });
  confirmarModels(conexao, modelos);
  confirmarModels(leitura);
  assert.notEqual(conexao.getClient(), leitura.getClient());
  process.env.JWT_SECRET = segredo;
  const app = express();
  app.use(express.json());
  app.use("/usuarios", usuarioRoutes);
  app.use("/criancas", criancaRoutes);
  app.use("/responsaveis", responsavelRoutes);
  app.use("/historico-jogo", historicoRoutes);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  t.diagnostic("Duas conexões em conectamente_testes; nenhum Service ou Model substituído");

  function semSegredos(valor) {
    if (!valor || typeof valor !== "object") return;
    for (const [campo, dado] of Object.entries(valor)) {
      assert.ok(!/senha|password|hash/i.test(campo), "Campo privado na resposta HTTP");
      if (typeof dado === "string") {
        assert.ok(!/^\$2[aby]\$/.test(dado), "Hash bcrypt exposto na resposta HTTP");
        assert.ok(!contas.some((c) => dado.includes(c.senha)), "Senha exposta na resposta HTTP");
      } else semSegredos(dado);
    }
  }
  async function chamar(method, caminho, dados, ator) {
    confirmarModels(conexao, modelos);
    const headers = {};
    if (dados !== undefined) headers["Content-Type"] = "application/json";
    if (ator) {
      assert.ok(ator.token, "JWT deve ter sido obtido pelo login HTTP");
      headers.Authorization = `Bearer ${ator.token}`;
    }
    const res = await fetch(base + caminho, {
      method, headers, body: dados === undefined ? undefined : JSON.stringify(dados),
      signal: AbortSignal.timeout(30000),
    });
    assert.match(res.headers.get("content-type"), /application\/json/);
    const body = await res.json();
    semSegredos(body);
    return { status: res.status, body };
  }
  function erro(res, status) {
    assert.equal(res.status, status);
    assert.equal(res.body.erro, true);
    assert.equal(typeof res.body.mensagem, "string");
    assert.ok(res.body.mensagem.trim());
    assert.deepEqual(Object.keys(res.body).sort(), ["erro", "mensagem"]);
  }
  async function semEscrita(fn) {
    const antes = await estado();
    try { await fn(); }
    finally {
      assert.ok(JSON.stringify(await estado()) === JSON.stringify(antes),
        "Rejeição alterou documentos da execução");
    }
  }
  async function conta(perfil) {
    const email = `${execucao}-${contas.length}@example.invalid`;
    assert.equal(await leitura.db.collection(Usuario.collection.name).countDocuments({ email }), 0);
    emails.add(email);
    const c = { nome: `Fixture ${execucao}`, email, senha: randomUUID(), perfil };
    contas.push(c);
    return c;
  }
  async function cadastrar(c, extras = {}) {
    const res = await chamar("POST", "/usuarios", { ...c, ...extras });
    assert.equal(res.status, 201);
    c.id = res.body._id;
    registrar(Usuario, [c.id]);
    assert.equal(res.body.email, c.email);
    assert.equal(res.body.perfil, c.perfil);
    const salvo = await leitura.db.collection(Usuario.collection.name).findOne({ email: c.email });
    assert.ok(salvo, "Cadastro não persistiu na conexão independente");
    assert.equal(String(salvo._id), c.id);
    assert.ok(salvo.senha !== c.senha, "Senha em texto puro no banco");
    assert.ok(await bcrypt.compare(c.senha, salvo.senha), "Hash persistido não corresponde à senha");
    assert.equal(bcrypt.getRounds(salvo.senha), 12);
    return res;
  }
  async function login(c) {
    const res = await chamar("POST", "/usuarios/auth", { email: c.email, senha: c.senha });
    assert.equal(res.status, 200);
    assert.equal(res.body.usuario.id, c.id);
    const claims = jwt.verify(res.body.token, segredo);
    assert.equal(claims.id, c.id);
    assert.equal(claims.perfil, c.perfil);
    assert.equal(claims.exp - claims.iat, 5 * 60 * 60);
    c.token = res.body.token;
  }
  async function perfil(c, dados = {}) {
    const res = await chamar("POST", c.perfil === "crianca" ? "/criancas" : "/responsaveis", dados, c);
    assert.equal(res.status, 201);
    c.perfilId = res.body._id;
    const Model = c.perfil === "crianca" ? Crianca : Responsavel;
    registrar(Model, [c.perfilId]);
    const salvo = await leitura.db.collection(Model.collection.name)
      .findOne({ usuarioId: new mongoose.Types.ObjectId(c.id) });
    assert.ok(salvo, "Perfil não persistiu na conexão independente");
    assert.equal(String(salvo._id), c.perfilId);
    assert.equal(res.body.usuarioId, c.id);
    return res;
  }
  const responsavel = await conta("responsavel");
  const crianca = await conta("crianca");
  const outro = await conta("responsavel");
  const semPerfil = await conta("crianca");
  const credenciais = (c) => ({ email: c.email, senha: c.senha });
  const caminhoPermissao = (c) => `/responsaveis/minhas-criancas/${c.perfilId}/permissao`;
  const vincular = (r, c = crianca) => chamar("POST", "/responsaveis/vincular-crianca", credenciais(c), r);
  const permissao = (r, valor, c = crianca) => chamar("PATCH", caminhoPermissao(c), { permissaoAtiva: valor }, r);

  await t.test("01 cadastrar responsável por HTTP e conferir hash persistido", () => cadastrar(responsavel));
  await t.test("02 cadastrar criança por HTTP e conferir hash persistido", () => cadastrar(crianca));
  await t.test("03 login HTTP de ambos emite JWTs reais sem senha", async () => {
    await login(responsavel); await login(crianca);
  });
  await t.test("04 JWTs do login consultam somente a própria conta", async () => {
    for (const c of [responsavel, crianca]) {
      const res = await chamar("GET", "/usuarios/meu-perfil", undefined, c);
      assert.equal(res.status, 200); assert.equal(res.body._id, c.id);
      assert.equal(res.body.email, c.email); assert.equal(res.body.perfil, c.perfil);
    }
  });
  await t.test("05 cadastro duplicado retorna 409 sem alterar usuário/hash", () => semEscrita(async () => {
    erro(await chamar("POST", "/usuarios", { ...credenciais(crianca), nome: crianca.nome, perfil: crianca.perfil }), 409);
  }));
  await t.test("06 cadastro obrigatório/perfil inválido retorna 400 sem escrita", () => semEscrita(async () => {
    const invalida = await conta("crianca");
    for (const campo of ["nome", "email", "senha", "perfil"]) {
      const dados = { ...invalida }; delete dados[campo];
      erro(await chamar("POST", "/usuarios", dados), 400);
    }
    erro(await chamar("POST", "/usuarios", { ...invalida, perfil: "admin" }), 400);
    erro(await chamar("POST", "/usuarios"), 400);
  }));
  await t.test("07 login inválido/obrigatórios retorna 401/400 sem escrita", () => semEscrita(async () => {
    for (const dados of [{ email: crianca.email, senha: "incorreta" }, { email: `${execucao}-ausente@example.invalid`, senha: "incorreta" }]) {
      erro(await chamar("POST", "/usuarios/auth", dados), 401);
    }
    erro(await chamar("POST", "/usuarios/auth", {}), 400);
    erro(await chamar("POST", "/usuarios/auth"), 400);
  }));
  await t.test("08 criança sem perfil retorna 404 em meu-perfil", async () => {
    erro(await chamar("GET", "/criancas/meu-perfil", undefined, crianca), 404);
  });
  await t.test("09 criar perfil responsável via HTTP e persistir vínculo com Usuario", async () => { await perfil(responsavel); });
  await t.test("10 criar perfil infantil ignora injeção de vínculo e permissão", async () => {
    const res = await perfil(crianca, { dataNascimento: "2018-01-01", usuarioId: responsavel.id,
      responsavelId: responsavel.perfilId, permissaoAtiva: true });
    assert.equal(res.body.responsavelId, null); assert.equal(res.body.permissaoAtiva, false);
    assert.equal(res.body.dataNascimento, "2018-01-01T00:00:00.000Z");
    const salvo = (await estado()).Crianca.find((doc) => doc._id === crianca.perfilId);
    assert.equal(salvo.responsavelId, null); assert.equal(salvo.permissaoAtiva, false);
    assert.equal(salvo.dataNascimento, "2018-01-01T00:00:00.000Z");
  });
  await t.test("11 consultar perfil infantil e perfil responsável pelas rotas disponíveis", async () => {
    const res = await chamar("GET", "/criancas/meu-perfil", undefined, crianca);
    assert.equal(res.status, 200); assert.equal(res.body._id, crianca.perfilId);
    const lista = await chamar("GET", "/responsaveis/minhas-criancas", undefined, responsavel);
    assert.equal(lista.status, 200); assert.deepEqual(lista.body, []);
  });
  await t.test("12 perfis duplicados retornam 409 e preservam documentos", () => semEscrita(async () => {
    erro(await chamar("POST", "/criancas", {}, crianca), 409);
    erro(await chamar("POST", "/responsaveis", {}, responsavel), 409);
  }));
  await t.test("13 ausência JWT e troca de perfil são rejeitadas sem escrita", () => semEscrita(async () => {
    erro(await chamar("GET", "/usuarios/meu-perfil"), 401);
    erro(await chamar("POST", "/criancas", {}), 401);
    erro(await chamar("POST", "/responsaveis", {}), 401);
    erro(await chamar("POST", "/criancas", {}, responsavel), 403);
    erro(await chamar("POST", "/responsaveis", {}, crianca), 403);
    erro(await chamar("GET", "/responsaveis/minhas-criancas", undefined, crianca), 403);
  }));
  await t.test("14 preparar outro responsável por cadastro/login/perfil HTTP", async () => {
    await cadastrar(outro); await login(outro); await perfil(outro);
    await cadastrar(semPerfil); await login(semPerfil);
  });
  await t.test("15 vínculo rejeita credenciais inválidas e criança sem perfil", () => semEscrita(async () => {
    for (const dados of [ { email: crianca.email, senha: "incorreta" }, credenciais(outro),
      { email: `${execucao}-ausente@example.invalid`, senha: "incorreta" } ]) {
      erro(await chamar("POST", "/responsaveis/vincular-crianca", dados, responsavel), 401);
    }
    erro(await vincular(responsavel, semPerfil), 404);
    erro(await chamar("POST", "/responsaveis/vincular-crianca", {}, responsavel), 400);
  }));
  await t.test("16 vincular criança por HTTP e confirmar proprietário persistido", async () => {
    const res = await vincular(responsavel);
    assert.equal(res.status, 200); assert.equal(res.body._id, crianca.perfilId);
    const salvo = (await estado()).Crianca.find((doc) => doc._id === crianca.perfilId);
    assert.equal(salvo.responsavelId, responsavel.perfilId); assert.equal(salvo.permissaoAtiva, false);
  });
  await t.test("17 listagem isola crianças por responsável", async () => {
    const lista = await chamar("GET", "/responsaveis/minhas-criancas", undefined, responsavel);
    const alheias = await chamar("GET", "/responsaveis/minhas-criancas", undefined, outro);
    assert.equal(lista.status, 200); assert.deepEqual(lista.body.map((doc) => doc._id), [crianca.perfilId]);
    assert.equal(alheias.status, 200); assert.deepEqual(alheias.body, []);
  });
  await t.test("18 vínculo duplicado pelo mesmo/outro responsável retorna 409", () => semEscrita(async () => {
    erro(await vincular(responsavel), 409); erro(await vincular(outro), 409);
  }));
  await t.test("19 responsável alheio não controla permissão; criança não assume esse papel", () => semEscrita(async () => {
    erro(await permissao(outro, true), 404);
    erro(await permissao(crianca, true), 403);
    erro(await chamar("PATCH", caminhoPermissao(crianca), { permissaoAtiva: true }), 401);
  }));
  await t.test("20 permissão exige booleano e Crianca._id, não Usuario._id", () => semEscrita(async () => {
    for (const valor of ["true", 1, null]) erro(await permissao(responsavel, valor), 400);
    erro(await chamar("PATCH", caminhoPermissao(crianca), {}, responsavel), 400);
    erro(await chamar("PATCH", `/responsaveis/minhas-criancas/${crianca.id}/permissao`, { permissaoAtiva: true }, responsavel), 404);
  }));

  // Apenas suporte à prova da permissão. Não testa o CRUD de personagens/save.
  // Seus IDs são registrados antes de inserir. Contas/perfis seguem HTTP real.
  const catalogoIds = { comodos: ids(Comodo), tarefas: ids(Tarefa), respostas: ids(Resposta) };
  let bodyResposta;
  await t.test("21 preparar atividade mínima e rejeitar resposta com permissão inicial false", async () => {
    const catalogo = await criarCatalogo(undefined, catalogoIds, execucao);
    const personagem = new Perfil({ criancaId: crianca.perfilId, nomeAvatar: execucao, imagemAvatar: "teste.png" });
    registrar(Perfil, [personagem._id]); await personagem.save();
    const partida = new Partida({ perfilJogoId: personagem._id, nomeJogo: execucao });
    registrar(Partida, [partida._id]); await partida.save();
    const tarefa = catalogo.quarto.tarefas[0];
    bodyResposta = { perfilJogoId: String(personagem._id), jogoSalvoId: String(partida._id),
      tarefaId: String(tarefa._id), respostaEscolhidaId: String(tarefa.correta._id), dificuldade: "facil" };
    await semEscrita(async () => {
      const res = await chamar("POST", "/historico-jogo/responder", bodyResposta, crianca);
      erro(res, 403); assert.equal(res.body.mensagem, "Permissão para jogar inativa");
    });
  });
  await t.test("22 ativar permissão e confirmar persistência pelo banco/perfil HTTP", async () => {
    const res = await permissao(responsavel, true);
    assert.equal(res.status, 200); assert.equal(res.body.permissaoAtiva, true);
    assert.equal((await estado()).Crianca.find((doc) => doc._id === crianca.perfilId).permissaoAtiva, true);
    const atual = await chamar("GET", "/criancas/meu-perfil", undefined, crianca);
    assert.equal(atual.body.permissaoAtiva, true);
  });
  await t.test("23 mesmo JWT infantil registra resposta e commit persiste", async () => {
    const res = await chamar("POST", "/historico-jogo/responder", bodyResposta, crianca);
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { acertou: true, tentativa: 1, pontuacaoGanha: 1, dificuldade: "facil" });
    const salvo = await estado();
    assert.equal(salvo.HistoricoJogo.length, 1);
    assert.equal(salvo.HistoricoJogo[0].criancaId, crianca.perfilId);
    assert.equal(salvo.HistoricoJogo[0].jogoSalvoId, bodyResposta.jogoSalvoId);
    assert.equal(salvo.HistoricoJogo[0].pontuacaoGanha, 1);
    assert.equal(salvo.JogoSalvo[0].estrelasTotal, 1);
    t.diagnostic("Resposta 201 e histórico/estrelas confirmados fora da sessão por conexão independente");
  });
  await t.test("24 revogar permissão com false e confirmar persistência", async () => {
    const res = await permissao(responsavel, false);
    assert.equal(res.status, 200); assert.equal(res.body.permissaoAtiva, false);
    assert.equal((await estado()).Crianca.find((doc) => doc._id === crianca.perfilId).permissaoAtiva, false);
  });
  await t.test("25 mesmo JWT é bloqueado após revogação sem histórico/estrelas extras", () => semEscrita(async () => {
    const res = await chamar("POST", "/historico-jogo/responder", bodyResposta, crianca);
    erro(res, 403); assert.equal(res.body.mensagem, "Permissão para jogar inativa");
  }));
  await t.test("26 duas tentativas HTTP concorrentes de vínculo têm um único vencedor", async () => {
    const concorrente = await conta("crianca");
    await cadastrar(concorrente); await login(concorrente); await perfil(concorrente);
    const antes = await estado();
    const respostas = await Promise.all([vincular(responsavel, concorrente), vincular(outro, concorrente)]);
    assert.deepEqual(respostas.map((res) => res.status).sort(), [200, 409]);
    erro(respostas.find((res) => res.status === 409), 409);
    const vencedor = respostas[0].status === 200 ? responsavel : outro;
    const perdedor = vencedor === responsavel ? outro : responsavel;
    const depois = await estado();
    const alvo = depois.Crianca.find((doc) => doc._id === concorrente.perfilId);
    assert.equal(alvo.responsavelId, vencedor.perfilId); assert.equal(alvo.permissaoAtiva, false);
    const esperado = structuredClone(antes);
    esperado.Crianca.find((doc) => doc._id === concorrente.perfilId).responsavelId = vencedor.perfilId;
    assert.ok(JSON.stringify(depois) === JSON.stringify(esperado), "Concorrência alterou outro documento/campo");
    await semEscrita(async () => { erro(await permissao(perdedor, true, concorrente), 404); });
  });
  await t.test("27 perfil infantil sem body deve retornar 400 sem criar documento", async () => {
    await semEscrita(async () => {
      const res = await chamar("POST", "/criancas", undefined, semPerfil);
      erro(res, 400);
      assert.equal(res.body.mensagem, "Body da requisição obrigatório");
    });
  });
  await t.test("28 body vazio continua válido: perfil infantil 201 com data opcional null", async () => {
    const res = await perfil(semPerfil, {});
    assert.equal(res.body.dataNascimento, null);
    assert.equal(res.body.responsavelId, null);
    assert.equal(res.body.permissaoAtiva, false);
    const salvo = (await estado()).Crianca.find((doc) => doc._id === semPerfil.perfilId);
    assert.equal(salvo.dataNascimento, null);
    const consulta = await chamar("GET", "/criancas/meu-perfil", undefined, semPerfil);
    assert.equal(consulta.status, 200);
    assert.equal(consulta.body._id, semPerfil.perfilId);
    assert.equal(consulta.body.dataNascimento, null);
  });
});
