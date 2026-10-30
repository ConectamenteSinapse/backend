import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import tarefaRoutes from "../routes/tarefaRoutes.js";
import respostaRoutes from "../routes/respostaRoutes.js";
import comodoRoutes from "../routes/comodoRoutes.js";
import { id, serializar, dadosTarefa, dadosResposta, especificacoes } from "./helpers/midiaIssue90.js";

// Apenas persistência simulada. Schemas, casting, services, controllers e rotas reais.
// O mock não valida mídia: valores inválidos precisam ser rejeitados pelo service
// antes de chegar aos métodos de escrita. Não comprova índices ou commit MongoDB.
function preparar(t) {
  for (const metodo of ["connect", "createConnection"]) {
    t.mock.method(mongoose, metodo, () => assert.fail("MongoDB proibido nesta suíte"));
  }
  const comodo = { _id: id() };
  const tarefa = dadosTarefa({ comodoId: comodo._id });
  const resposta = dadosResposta({ tarefaId: tarefa._id });
  const dados = new Map([[Comodo, [comodo]], [Tarefa, [tarefa]], [Resposta, [resposta]]]);
  const escritas = [];
  for (const Model of [Tarefa, Resposta]) {
    t.mock.method(Model, "create", async (valores) => {
      escritas.push({ Model, operacao: "create", valores });
      const doc = new Model(valores);
      await doc.validate();
      dados.get(Model).push(doc.toObject());
      return doc;
    });
    t.mock.method(Model, "findByIdAndUpdate", async (chave, valores, opcoes) => {
      escritas.push({ Model, operacao: "update", valores });
      assert.equal(opcoes.new, true);
      assert.equal(opcoes.runValidators, true);
      const indice = dados.get(Model).findIndex(d => String(d._id) === String(chave));
      if (indice < 0) return null;
      const enviados = Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== undefined));
      const doc = new Model({ ...dados.get(Model)[indice], ...enviados });
      await doc.validate();
      dados.get(Model)[indice] = doc.toObject();
      return doc;
    });
  }
  t.mock.method(mongoose.Query.prototype, "exec", async function () {
    assert.ok(dados.has(this.model), "Model inesperado");
    assert.ok(["find", "findOne"].includes(this.op), "Somente leituras neste mock");
    this.cast();
    const filtro = this.getFilter();
    let linhas = dados.get(this.model).filter(doc => Object.entries(filtro).every(([k,v]) => String(doc[k]) === String(v)));
    for (const [campo, direcao] of Object.entries(this.getOptions().sort ?? {})) {
      linhas = [...linhas].sort((a,b) => (a[campo] - b[campo]) * direcao);
    }
    const excluidos = Object.entries(this.projection() ?? {}).filter(([,v]) => v === 0).map(([k]) => k.replace(/^-/, ""));
    linhas = linhas.map(doc => Object.fromEntries(Object.entries(doc).filter(([k]) => !excluidos.includes(k))));
    return this.op === "findOne" ? (linhas[0] ?? null) : linhas;
  });
  return { comodo, tarefa, resposta, dados, escritas };
}
async function chamarController(spec, operacao, chave, body) {
  const res = { status(codigo) { this.codigo = codigo; return this; }, json(dados) { this.dados = serializar(dados); return this; } };
  await spec.controller[spec[operacao]]({ params: { [spec.parametro]: String(chave) }, body }, res);
  return { status: res.codigo, dados: res.dados };
}
function chamarService(spec, operacao, chave, dados) {
  return operacao === "post" ? spec.service[spec.post](dados) : spec.service[spec[operacao]](chave, dados);
}
const casos = [
  ["string sem formato obrigatório", "referência livre de mídia", true],
  ["string vazia", "", false], ["somente espaços", " \t\n ", false],
  ["null", null, true], ["omitido", undefined, true],
  ["número", 42, false], ["booleano", false, false],
  ["objeto", { caminho: "midia.png" }, false], ["array", ["midia.png"], false],
];

for (const spec of especificacoes) {
  for (const campo of spec.campos) {
    for (const operacao of ["post", "put", "patch"]) {
      for (const [rotulo, valor, valido] of casos) {
        test(`#90 local: ${spec.nome} ${operacao} ${campo}: ${rotulo}`, async (t) => {
          const j = preparar(t);
          const existente = spec.Model === Tarefa ? j.tarefa : j.resposta;
          const body = operacao === "patch" ? {} : { ...existente };
          if (valor !== undefined) body[campo] = valor;
          if (operacao === "patch" && valor === undefined) body[spec.Model === Tarefa ? "titulo" : "texto"] = "Texto atualizado";
          if (!valido) {
            await assert.rejects(chamarService(spec, operacao, existente._id, body), erro => {
              assert.equal(erro.status, 400);
              assert.equal(erro.message, spec.Model === Tarefa ? "Áudio do enunciado inválido" : "Referência de mídia inválida");
              return true;
            });
            const res = await chamarController(spec, operacao, existente._id, body);
            assert.equal(res.status, 400);
            assert.equal(res.dados.mensagem, spec.Model === Tarefa ? "Áudio do enunciado inválido" : "Referência de mídia inválida");
            assert.equal(j.escritas.length, 0, "Entrada inválida não pode alcançar persistência");
          } else {
            const res = await chamarController(spec, operacao, existente._id, body);
            assert.equal(res.status, operacao === "post" ? 201 : 200);
            if (valor !== undefined) assert.equal(res.dados[campo], valor);
            else assert.equal(Object.hasOwn(res.dados, campo), false);
            if (typeof valor === "string") assert.equal(typeof res.dados[campo], "string");
            assert.equal(res.dados[spec.referencia], String(existente[spec.referencia]));
            assert.equal(j.escritas.length, 1);
          }
        });
      }
    }
  }

  test(`#90 schema: ${spec.nome} legado aceita ausência de mídia e mantém obrigatórios`, async () => {
    const base = spec.dados();
    const doc = new spec.Model(base);
    await doc.validate();
    for (const campo of spec.campos) assert.equal(doc[campo], undefined);
    const obrigatorios = spec.Model === Tarefa
      ? ["titulo", "enunciado", "descricao", "comodoId", "imagemObjeto", "ordem"]
      : ["tarefaId", "texto", "correta", "ordem"];
    for (const campo of obrigatorios) {
      const invalido = new spec.Model({ ...base, [campo]: undefined });
      await assert.rejects(invalido.validate(), erro => Boolean(erro.errors[campo]));
    }
    if (spec.Model === Tarefa) {
      assert.equal(Tarefa.schema.path("dificuldade"), undefined);
      await assert.rejects(new Tarefa({ ...base, posicao: { x: 0 } }).validate(), { name: "ValidationError" });
    } else assert.equal(doc.correta, false);
  });

  for (const operacao of ["put", "patch"]) {
    test(`#90 local: ${spec.nome} ${operacao} adiciona, substitui, preserva omitidos e remove com null`, async (t) => {
      const j = preparar(t);
      const atual = spec.Model === Tarefa ? j.tarefa : j.resposta;
      const texto = spec.Model === Tarefa ? "titulo" : "texto";
      const base = operacao === "put" ? { ...atual } : {};
      const novas = Object.fromEntries(spec.campos.map(c => [c, `primeira-${c}`]));
      let res = await chamarController(spec, operacao, atual._id, { ...base, ...novas });
      assert.equal(res.status, 200);
      for (const c of spec.campos) assert.equal(res.dados[c], novas[c]);
      res = await chamarController(spec, operacao, atual._id, { ...base, [spec.campos[0]]: "substituída" });
      assert.equal(res.status, 200);
      assert.equal(res.dados[spec.campos[0]], "substituída");
      if (spec.campos[1]) assert.equal(res.dados[spec.campos[1]], novas[spec.campos[1]]);
      const antes = res.dados;
      res = await chamarController(spec, operacao, atual._id, { ...base, [texto]: "Novo texto" });
      assert.equal(res.status, 200);
      for (const c of spec.campos) assert.equal(res.dados[c], antes[c]);
      assert.equal(res.dados[texto], "Novo texto");
      res = await chamarController(spec, operacao, atual._id, { ...base, ...Object.fromEntries(spec.campos.map(c => [c, null])) });
      assert.equal(res.status, 200);
      for (const c of spec.campos) assert.equal(res.dados[c], null);
      assert.equal(res.dados[spec.referencia], String(atual[spec.referencia]));
      if (spec.Model === Tarefa) assert.equal(res.dados.imagemObjeto, atual.imagemObjeto);
      else assert.equal(res.dados.correta, false);
    });
  }

  for (const operacao of ["post", "put", "patch"]) {
    test(`#90 local: ${spec.nome} ${operacao} mantém validação do relacionamento`, async (t) => {
      const j = preparar(t);
      const atual = spec.Model === Tarefa ? j.tarefa : j.resposta;
      const body = { ...atual, [spec.referencia]: id(), [spec.campos[0]]: "mídia válida" };
      const res = await chamarController(spec, operacao, atual._id, body);
      assert.equal(res.status, 400);
      assert.equal(res.dados.mensagem, spec.Model === Tarefa ? "Cômodo não encontrado" : "Tarefa não encontrada");
      assert.equal(j.escritas.length, 0);
    });
  }
}

async function prepararHttp(t) {
  const j = preparar(t);
  const anterior = process.env.JWT_SECRET;
  const segredo = randomUUID();
  process.env.JWT_SECRET = segredo;
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  const app = express();
  app.use(express.json());
  app.use("/tarefas", tarefaRoutes);
  app.use("/respostas", respostaRoutes);
  app.use("/comodos", comodoRoutes);
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(e => e ? reject(e) : resolve());
      server.closeAllConnections();
    });
  });
  await once(server, "listening");
  const token = jwt.sign({ id: String(id()), perfil: "crianca" }, segredo, { expiresIn: "5m" });
  j.requisitar = async (url, { method = "GET", autenticar = true } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: autenticar ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000),
    });
    const dados = res.headers.get("content-type")?.includes("application/json") ? await res.json() : await res.text();
    return { status: res.status, dados };
  };
  return j;
}

test("#90 HTTP: consultas de tarefas retornam áudio e preservam imagemObjeto, texto e comodoId", async (t) => {
  const j = await prepararHttp(t);
  j.tarefa.audioEnunciado = "enunciado.mp3";
  const legado = dadosTarefa({ comodoId: j.comodo._id, ordem: 2 });
  j.dados.get(Tarefa).push(legado);
  for (const url of ["/tarefas", `/tarefas/${j.tarefa._id}`, `/comodos/${j.comodo._id}/tarefas`]) {
    const res = await j.requisitar(url);
    assert.equal(res.status, 200);
    const lista = Array.isArray(res.dados) ? res.dados : [res.dados];
    const tarefa = lista.find(d => d._id === String(j.tarefa._id));
    assert.equal(tarefa.audioEnunciado, "enunciado.mp3");
    assert.equal(tarefa.imagemObjeto, j.tarefa.imagemObjeto);
    assert.equal(tarefa.enunciado, j.tarefa.enunciado);
    assert.equal(tarefa.comodoId, String(j.comodo._id));
    if (Array.isArray(res.dados)) assert.equal(Object.hasOwn(lista.find(d => d._id === String(legado._id)), "audioEnunciado"), false);
  }
});

test("#90 HTTP: todas as consultas de respostas expõem mídia sem expor correta", async (t) => {
  const j = await prepararHttp(t);
  Object.assign(j.resposta, { imagem: "alternativa.png", audio: "alternativa.mp3", ordem: 3 });
  const legado = dadosResposta({ tarefaId: j.tarefa._id, ordem: 1, correta: true });
  const nula = dadosResposta({ tarefaId: j.tarefa._id, ordem: 2, imagem: null, audio: null });
  const outra = dadosTarefa({ comodoId: j.comodo._id, ordem: 2 });
  j.dados.get(Tarefa).push(outra);
  j.dados.get(Resposta).push(legado, nula, dadosResposta({ tarefaId: outra._id, ordem: 1 }));
  for (const url of ["/respostas", `/respostas/${j.resposta._id}`, `/tarefas/${j.tarefa._id}/respostas`]) {
    const res = await j.requisitar(url);
    assert.equal(res.status, 200);
    const lista = Array.isArray(res.dados) ? res.dados : [res.dados];
    const alternativa = lista.find(d => d._id === String(j.resposta._id));
    assert.equal(alternativa.imagem, "alternativa.png");
    assert.equal(alternativa.audio, "alternativa.mp3");
    assert.equal(alternativa.tarefaId, String(j.tarefa._id));
    assert.equal(alternativa.texto, j.resposta.texto);
    for (const d of lista) assert.equal(Object.hasOwn(d, "correta"), false);
    if (url.startsWith("/tarefas")) {
      assert.ok(Array.isArray(res.dados));
      assert.deepEqual(lista.map(d => d.ordem), [1,2,3]);
      assert.ok(lista.every(d => d.tarefaId === String(j.tarefa._id)));
      assert.equal(Object.hasOwn(lista[0], "imagem"), false);
      assert.equal(lista[1].audio, null);
    }
  }
});

test("#90 HTTP: autenticação, lista vazia e escritas desativadas permanecem", async (t) => {
  const j = await prepararHttp(t);
  const vazia = dadosTarefa({ comodoId: j.comodo._id, ordem: 2 });
  j.dados.get(Tarefa).push(vazia);
  assert.deepEqual(await j.requisitar(`/tarefas/${vazia._id}/respostas`), { status: 200, dados: [] });
  for (const url of ["/tarefas", `/tarefas/${j.tarefa._id}`, `/comodos/${j.comodo._id}/tarefas`, "/respostas", `/respostas/${j.resposta._id}`, `/tarefas/${j.tarefa._id}/respostas`]) {
    assert.equal((await j.requisitar(url, { autenticar: false })).status, 401);
  }
  for (const prefixo of ["tarefas", "respostas"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const url = method === "POST" ? `/${prefixo}` : `/${prefixo}/${id()}`;
      assert.equal((await j.requisitar(url, { method })).status, 404);
    }
  }
  assert.equal(j.escritas.length, 0);
});
