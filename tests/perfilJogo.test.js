import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import perfilRoutes from "../routes/perfilJogoRoutes.js";
import historicoRoutes from "../routes/historicoJogoRoutes.js";

// HTTP, JWT, autorização, controllers, services e validação Mongoose reais.
// Somente a persistência é simulada; nenhuma conexão MongoDB é aberta.
async function preparar(t) {
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  t.after(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  const usuarioId = String(new mongoose.Types.ObjectId());
  const criancaId = new mongoose.Types.ObjectId();
  const perfis = new Map();
  let falhar = false;
  const igual = (a, b) => String(a) === String(b);
  const consultaCrianca = t.mock.method(Crianca, "findOne", async (filtro) => {
    if (falhar) throw new Error("Falha de persistência fictícia");
    return igual(filtro.usuarioId, usuarioId)
      ? { _id: criancaId, permissaoAtiva: true }
      : null;
  });
  const criar = t.mock.method(Perfil, "create", async (dados) => {
    const doc = new Perfil(dados);
    await doc.validate();
    perfis.set(String(doc._id), doc.toObject());
    return doc;
  });
  const salvar = t.mock.method(Perfil.prototype, "save", async function () {
    await this.validate();
    perfis.set(String(this._id), this.toObject());
    return this;
  });
  // Mantém as queries Mongoose reais para observar filtro, sort e select.
  // Qualquer consulta não prevista falha em vez de alcançar um banco.
  const consultas = t.mock.method(
    mongoose.Query.prototype,
    "exec",
    async function () {
      assert.equal(
        this.model,
        Perfil,
        "Consulta inesperada fora de PerfilJogo",
      );
      assert.ok(["find", "findOne", "findOneAndUpdate"].includes(this.op));
      this.cast();
      const filtro = this.getFilter();
      let encontrados = [...perfis.values()].filter((doc) =>
        Object.entries(filtro).every(([chave, valor]) =>
          igual(doc[chave], valor),
        ),
      );
      if (this.op === "findOneAndUpdate") {
        const anterior = encontrados[0];
        if (!anterior) return null;
        const atualizacao = this.getUpdate();
        // Simula somente $set; operações não previstas devem continuar falhando.
        assert.deepEqual(Object.keys(atualizacao), ["$set"]);
        const opcoes = this.getOptions();
        if (opcoes.runValidators) {
          await Perfil.validate(
            atualizacao.$set,
            Object.keys(atualizacao.$set),
          );
        }
        const atualizado = { ...anterior, ...atualizacao.$set };
        perfis.set(String(anterior._id), atualizado);
        return Perfil.hydrate(opcoes.new ? atualizado : anterior);
      }
      if (this.getOptions().sort?.criadoEm === -1)
        encontrados.sort((a, b) => b.criadoEm - a.criadoEm);
      encontrados = encontrados.map((doc) => {
        if (!this.mongooseOptions().lean) return Perfil.hydrate(doc);
        const campos = this.projection();
        return campos
          ? Object.fromEntries(
              Object.entries(doc).filter(
                ([chave]) => chave === "_id" || campos[chave] === 1,
              ),
            )
          : Perfil.hydrate(doc).toObject();
      });
      return this.op === "findOne" ? (encontrados[0] ?? null) : encontrados;
    },
  );
  t.mock.method(console, "error", () => {});
  const app = express();
  app.use(express.json());
  app.use("/perfis-jogo", perfilRoutes);
  app.use("/historico-jogo", historicoRoutes);
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((erro) => (erro ? reject(erro) : resolve()));
      server.closeIdleConnections();
    });
  });
  await once(server, "listening");
  const token = (claims = {}, opcoes = {}) =>
    jwt.sign(
      { id: usuarioId, perfil: "crianca", ...claims },
      process.env.JWT_SECRET,
      { expiresIn: "5m", ...opcoes },
    );
  async function chamar(
    method,
    caminho = "",
    body,
    authorization = `Bearer ${token()}`,
  ) {
    const headers = { "Content-Type": "application/json" };
    if (authorization !== null) headers.Authorization = authorization;
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}${caminho.startsWith("/historico-jogo") ? caminho : `/perfis-jogo${caminho}`}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );
    return {
      status: res.status,
      dados: res.status === 204 ? null : await res.json(),
    };
  }
  function inserir(dados = {}) {
    const doc = new Perfil({
      criancaId,
      nomeAvatar: "Avatar",
      imagemAvatar: "avatar.png",
      ...dados,
    });
    perfis.set(String(doc._id), doc.toObject());
    return String(doc._id);
  }
  return {
    chamar,
    inserir,
    perfis,
    token,
    criar,
    salvar,
    consultas,
    consultaCrianca,
    criancaId,
    falhar: () => {
      falhar = true;
    },
  };
}

const endpoints = [
  ["POST", ""],
  ["GET", ""],
  ["GET", "/111111111111111111111111"],
  ["PATCH", "/111111111111111111111111"],
  ["DELETE", "/111111111111111111111111"],
];

test("Issue #71: index registra o router no prefixo esperado", async () => {
  // Não importa index.js: sua importação conecta ao Atlas e inicia o servidor.
  const fonte = await readFile(new URL("../index.js", import.meta.url), "utf8");
  assert.match(
    fonte,
    /import perfilJogoRoutes from ["']\.\/routes\/perfilJogoRoutes\.js["']/,
  );
  assert.match(fonte, /app\.use\(["']\/perfis-jogo["'],\s*perfilJogoRoutes\)/);
});

test("Issue #71: cinco endpoints exigem JWT válido e perfil criança", async (t) => {
  const j = await preparar(t);
  for (const [method, caminho] of endpoints) {
    for (const auth of [
      null,
      "Bearer",
      "Basic abc",
      "Bearer invalido",
      `Bearer ${j.token({}, { expiresIn: -1 })}`,
      `Bearer ${jwt.sign({ perfil: "crianca" }, randomUUID())}`,
    ])
      assert.equal(
        (await j.chamar(method, caminho, undefined, auth)).status,
        401,
      );
    for (const perfil of ["responsavel", "administrador", "desconhecido"])
      assert.equal(
        (
          await j.chamar(
            method,
            caminho,
            undefined,
            `Bearer ${j.token({ perfil })}`,
          )
        ).status,
        403,
      );
  }
  assert.equal(j.consultaCrianca.mock.callCount(), 0);
});

test("Issue #71: POST normaliza nome/imagem e inicia ativo com zero estrelas", async (t) => {
  const j = await preparar(t);
  const res = await j.chamar("POST", "", {
    nomeAvatar: "  Luna  ",
    imagemAvatar: "  luna.png  ",
    estrelasTotal: 99,
    nivelAtual: 10,
    status: "arquivado",
    criancaId: String(new mongoose.Types.ObjectId()),
  });
  assert.equal(res.status, 201);
  assert.equal(res.dados.nomeAvatar, "Luna");
  assert.equal(res.dados.imagemAvatar, "luna.png");
  assert.equal(res.dados.estrelasTotal, 0);
  assert.equal(res.dados.nivelAtual, 1);
  assert.equal(res.dados.status, "ativo");
  assert.equal(res.dados.criancaId, String(j.criancaId));
  assert.ok(res.dados.criadoEm);
});

test("Issue #71: POST rejeita campos ausentes, vazios e tipos inválidos sem gravar", async (t) => {
  const j = await preparar(t);
  for (const body of [
    undefined,
    {},
    [],
    { nomeAvatar: "A" },
    { imagemAvatar: "a.png" },
  ])
    assert.equal((await j.chamar("POST", "", body)).status, 400);
  for (const campo of ["nomeAvatar", "imagemAvatar"])
    for (const valor of [null, "", "  ", 42, false, [], {}])
      assert.equal(
        (
          await j.chamar("POST", "", {
            nomeAvatar: "A",
            imagemAvatar: "a.png",
            [campo]: valor,
          })
        ).status,
        400,
      );
  assert.equal(j.criar.mock.callCount(), 0);
});

test("Issue #71: GET lista somente ativos do dono e ordena por criação", async (t) => {
  const j = await preparar(t);
  assert.deepEqual(await j.chamar("GET"), { status: 200, dados: [] });
  const antigo = j.inserir({ criadoEm: new Date("2025-01-01") });
  const recente = j.inserir({ criadoEm: new Date("2026-01-01") });
  j.inserir({ status: "arquivado" });
  j.inserir({ criancaId: new mongoose.Types.ObjectId() });
  const res = await j.chamar("GET");
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.dados.map((p) => p._id),
    [recente, antigo],
  );
  assert.deepEqual(
    Object.keys(res.dados[0]).sort(),
    ["_id", "nomeAvatar", "imagemAvatar", "estrelasTotal", "nivelAtual"].sort(),
  );
  assert.equal((await j.chamar("GET", `/${antigo}`)).dados._id, antigo);
});

test("Issue #71: GET/PATCH/DELETE rejeitam ID inválido e personagens alheios, arquivados ou inexistentes", async (t) => {
  const j = await preparar(t);
  const alheio = j.inserir({ criancaId: new mongoose.Types.ObjectId() });
  const arquivado = j.inserir({ status: "arquivado" });
  const antes = [...j.perfis].map(([id, doc]) => [
    id,
    Perfil.hydrate(doc).toObject(),
  ]);
  for (const method of ["GET", "PATCH", "DELETE"]) {
    assert.equal(
      (
        await j.chamar(
          method,
          "/invalido",
          method === "PATCH" ? { nomeAvatar: "Novo" } : undefined,
        )
      ).status,
      400,
    );
    for (const id of [alheio, arquivado, String(new mongoose.Types.ObjectId())])
      assert.equal(
        (
          await j.chamar(
            method,
            `/${id}`,
            method === "PATCH" ? { nomeAvatar: "Novo" } : undefined,
          )
        ).status,
        404,
      );
  }
  assert.deepEqual([...j.perfis], antes);
  assert.equal(j.salvar.mock.callCount(), 0);
});

test("Issue #71: PATCH altera somente nomeAvatar/imagemAvatar e preserva demais campos", async (t) => {
  const j = await preparar(t);
  const id = j.inserir({ estrelasTotal: 7, nivelAtual: 3 });
  const antes = Perfil.hydrate(j.perfis.get(id)).toObject();
  assert.equal(
    (
      await j.chamar("PATCH", `/${id}`, {
        nomeAvatar: "  Novo  ",
        estrelasTotal: 999,
        nivelAtual: 99,
        status: "arquivado",
        criancaId: String(new mongoose.Types.ObjectId()),
        criadoEm: "2000-01-01",
        $set: { estrelasTotal: 999 },
      })
    ).status,
    200,
  );
  assert.deepEqual(j.perfis.get(id), { ...antes, nomeAvatar: "Novo" });
  assert.equal(
    (await j.chamar("PATCH", `/${id}`, { imagemAvatar: "  nova.png  " }))
      .status,
    200,
  );
  assert.equal(j.perfis.get(id).imagemAvatar, "nova.png");
  assert.equal(
    (
      await j.chamar("PATCH", `/${id}`, {
        nomeAvatar: "Dois",
        imagemAvatar: "dois.png",
      })
    ).status,
    200,
  );
  assert.equal(j.perfis.get(id).nomeAvatar, "Dois");
  assert.equal(j.perfis.get(id).imagemAvatar, "dois.png");
});

test("Issue #71: PATCH inválido não salva alterações parciais", async (t) => {
  const j = await preparar(t);
  const id = j.inserir();
  const antes = Perfil.hydrate(j.perfis.get(id)).toObject();
  const corpos = [undefined, {}, [], { estrelasTotal: 99 }];
  for (const campo of ["nomeAvatar", "imagemAvatar"])
    for (const valor of [null, "", "  ", 42, false, [], {}])
      corpos.push({
        nomeAvatar: "Novo",
        imagemAvatar: "nova.png",
        [campo]: valor,
      });
  for (const body of corpos) {
    assert.equal((await j.chamar("PATCH", `/${id}`, body)).status, 400);
    assert.deepEqual(j.perfis.get(id), antes);
  }
  assert.equal(j.salvar.mock.callCount(), 0);
});

test("Issue #71: DELETE preserva documento e bloqueia leitura, edição e novas respostas (#72)", async (t) => {
  const j = await preparar(t);
  const id = j.inserir({ estrelasTotal: 8 });
  const antes = Perfil.hydrate(j.perfis.get(id)).toObject();
  // Qualquer query de exclusão ou acesso ao histórico falharia no adapter.
  assert.deepEqual(await j.chamar("DELETE", `/${id}`), {
    status: 204,
    dados: null,
  });
  assert.deepEqual(j.perfis.get(id), { ...antes, status: "arquivado" });
  assert.deepEqual((await j.chamar("GET")).dados, []);
  for (const method of ["GET", "PATCH", "DELETE"])
    assert.equal(
      (
        await j.chamar(
          method,
          `/${id}`,
          method === "PATCH" ? { nomeAvatar: "Novo" } : undefined,
        )
      ).status,
      404,
    );
  const tarefaId = new mongoose.Types.ObjectId();
  const respostaId = new mongoose.Types.ObjectId();
  t.mock.method(Tarefa, "findById", async () => ({
    _id: tarefaId,
    ativo: true,
  }));
  t.mock.method(Resposta, "findOne", async () => ({
    _id: respostaId,
    correta: true,
  }));
  const sessao = t.mock.method(mongoose, "startSession", async () =>
    assert.fail("Não deve iniciar transação para arquivado"),
  );
  const res = await j.chamar("POST", "/historico-jogo/responder", {
    perfilJogoId: id,
    tarefaId,
    respostaEscolhidaId: respostaId,
    dificuldade: "facil",
  });
  assert.deepEqual(res, {
    status: 404,
    dados: { mensagem: "Registro não encontrado" },
  });
  assert.equal(sessao.mock.callCount(), 0);
  assert.deepEqual(j.perfis.get(id), { ...antes, status: "arquivado" });
});

test("Issue #71: arquivamento condicional repetido retorna 404 sem nova alteração", async (t) => {
  const j = await preparar(t);
  const id = j.inserir({ estrelasTotal: 8 });
  const antes = Perfil.hydrate(j.perfis.get(id)).toObject();
  const original = Perfil.findOneAndUpdate;
  const arquivar = t.mock.method(
    Perfil,
    "findOneAndUpdate",
    function (...args) {
      return original.apply(this, args);
    },
  );

  assert.deepEqual(await j.chamar("DELETE", `/${id}`), {
    status: 204,
    dados: null,
  });
  assert.deepEqual(arquivar.mock.calls[0].arguments, [
    { _id: id, criancaId: j.criancaId, status: "ativo" },
    { $set: { status: "arquivado" } },
    { new: true, runValidators: true },
  ]);
  const depois = { ...antes, status: "arquivado" };
  assert.deepEqual(j.perfis.get(id), depois);
  for (let repeticao = 0; repeticao < 2; repeticao++) {
    assert.deepEqual(await j.chamar("DELETE", `/${id}`), {
      status: 404,
      dados: { mensagem: "Criança ou personagem não encontrado" },
    });
    assert.deepEqual(j.perfis.get(id), depois);
  }
  assert.equal(arquivar.mock.callCount(), 3);
  assert.equal(j.salvar.mock.callCount(), 0);
});

test("Issue #71: ValidationError e CastError Mongoose retornam 400 nos cinco endpoints", async (t) => {
  const j = await preparar(t);
  const id = j.inserir();
  const antes = Perfil.hydrate(j.perfis.get(id)).toObject();
  const validacao = new mongoose.Error.ValidationError();
  validacao.addError(
    "status",
    new mongoose.Error.ValidatorError({
      path: "status",
      value: "invalido",
      message: "Status fictício inválido",
    }),
  );
  const cast = new mongoose.Error.CastError("ObjectId", "invalido", "_id");
  const operacoes = [
    [
      "POST",
      "",
      Perfil,
      "create",
      { nomeAvatar: "Novo", imagemAvatar: "nova.png" },
    ],
    ["GET", "", Perfil, "find"],
    ["GET", `/${id}`, Perfil, "findOne"],
    ["PATCH", `/${id}`, Perfil.prototype, "save", { nomeAvatar: "Novo" }],
    ["DELETE", `/${id}`, Perfil, "findOneAndUpdate"],
  ];
  for (const erro of [validacao, cast]) {
    for (const [method, caminho, alvo, metodo, body] of operacoes) {
      // Injeta na persistência usada por cada endpoint, sem substituir o controller.
      const persistir = t.mock.method(alvo, metodo, () => {
        throw erro;
      });
      try {
        assert.deepEqual(
          await j.chamar(method, caminho, body),
          {
            status: 400,
            dados: { mensagem: "Dados inválidos" },
          },
          `${method} ${caminho}: ${erro.name}`,
        );
        assert.equal(persistir.mock.callCount(), 1);
        assert.deepEqual(j.perfis.get(id), antes);
        assert.equal(j.perfis.size, 1);
      } finally {
        persistir.mock.restore();
      }
    }
  }
});

test("Issue #71: erro inesperado no findOneAndUpdate retorna 500 sem arquivar", async (t) => {
  const j = await preparar(t);
  const id = j.inserir();
  const antes = Perfil.hydrate(j.perfis.get(id)).toObject();
  const arquivar = t.mock.method(Perfil, "findOneAndUpdate", () => {
    throw new Error("Falha fictícia ao arquivar");
  });
  assert.deepEqual(await j.chamar("DELETE", `/${id}`), {
    status: 500,
    dados: { mensagem: "Erro interno do servidor" },
  });
  assert.equal(arquivar.mock.callCount(), 1);
  assert.deepEqual(j.perfis.get(id), antes);
});

test("Issue #71: criança sem cadastro retorna 404 em todos os endpoints", async (t) => {
  const j = await preparar(t);
  for (const [method, caminho] of endpoints)
    assert.equal(
      (
        await j.chamar(
          method,
          caminho,
          method === "POST"
            ? { nomeAvatar: "A", imagemAvatar: "a.png" }
            : undefined,
          `Bearer ${j.token({ id: String(new mongoose.Types.ObjectId()) })}`,
        )
      ).status,
      404,
    );
});

test("Issue #71: falha inesperada retorna 500 genérico nos cinco endpoints", async (t) => {
  const j = await preparar(t);
  j.falhar();
  for (const [method, caminho] of endpoints)
    assert.deepEqual(
      await j.chamar(
        method,
        caminho,
        method === "POST"
          ? { nomeAvatar: "A", imagemAvatar: "a.png" }
          : undefined,
      ),
      { status: 500, dados: { mensagem: "Erro interno do servidor" } },
    );
});

test("Issue #71: JWT_SECRET ausente retorna 500 antes do banco", async (t) => {
  const j = await preparar(t);
  const token = j.token();
  delete process.env.JWT_SECRET;
  assert.deepEqual(await j.chamar("GET", "", undefined, `Bearer ${token}`), {
    status: 500,
    dados: { mensagem: "Erro interno do servidor" },
  });
  assert.equal(j.consultaCrianca.mock.callCount(), 0);
});
