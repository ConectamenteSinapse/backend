import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Perfil from "../models/perfilJogoModel.js";
import Jogo from "../models/jogoSalvoModel.js";
import Historico from "../models/historicoJogoModel.js";
import Comodo from "../models/comodoModel.js";
import Tarefa from "../models/tarefaModel.js";
import Resposta from "../models/respostaModel.js";
import jogoRouter from "../routes/jogoSalvoRoutes.js";
import historicoRouter from "../routes/historicoJogoRoutes.js";
import { criarCatalogo } from "./helpers/catalogo.js";
import { garantirSessaoResposta } from "./helpers/sessaoRespostaMongo.js";
import { motivoIgnorarCommitReal, conectarBancoCommitReal } from "./helpers/bancoCommitReal.js";
import { confirmarModels, limparRegistrosTeste } from "./helpers/atlasSeguro.js";
import { casosEstados, prepararCasoEstados, conferirEstados, conferirAcessoEstados, instanteEstado, dificuldades } from "./helpers/estadosComodosIssue107.js";

const id = () => new mongoose.Types.ObjectId();
const json = valor => JSON.parse(JSON.stringify(valor));
test("#107 MongoDB: estados dos cômodos, contrato HTTP e desbloqueio real", {
  skip: motivoIgnorarCommitReal(), concurrency: false, timeout: 240000,
}, async t => {
  let conexao, leitura, server;
  const segredoAnterior = process.env.JWT_SECRET, segredo = randomUUID();
  const ids = { comodos: [], tarefas: [], respostas: [] };
  const registros = new Map([[Historico, []], [Jogo, []], [Perfil, []], [Crianca, []],
    [Resposta, ids.respostas], [Tarefa, ids.tarefas], [Comodo, ids.comodos]]);
  const comandos = [], monitorar = e => comandos.push(e.commandName);
  t.after(async () => {
    const falhas = [];
    try { if (server) await new Promise((resolve, reject) => {
      server.close(e => e ? reject(e) : resolve()); server.closeAllConnections();
    }); } catch { falhas.push(new Error("Falha ao encerrar HTTP de estados")); }
    conexao?.getClient().off("commandStarted", monitorar);
    try { if (conexao) await limparRegistrosTeste(conexao, registros, Historico, registros.get(Perfil)); }
    catch { falhas.push(new Error("Limpeza de estados incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [Model, chaves] of registros) assert.equal(await leitura.db.collection(Model.collection.name)
          .countDocuments({ _id: { $in: chaves } }), 0);
        assert.equal(await leitura.db.collection(Historico.collection.name)
          .countDocuments({ perfilJogoId: { $in: registros.get(Perfil) } }), 0);
        t.diagnostic("Estados dos cômodos: zero resíduos confirmado por conexão independente");
      }
    } catch { falhas.push(new Error("Não foi possível descartar resíduos de estados")); }
    try { await leitura?.close(); } catch { falhas.push(new Error("Falha ao fechar leitura")); }
    try { await conexao?.close(); } catch { falhas.push(new Error("Falha ao fechar conexão")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown de estados falhou");
  });
  conexao = await conectarBancoCommitReal({ monitorCommands: true });
  leitura = await conectarBancoCommitReal({ leitura: true });
  assert.notEqual(conexao.getClient(), leitura.getClient());
  process.env.JWT_SECRET = segredo;
  const catalogo = await criarCatalogo(null, ids, `estados-107-${randomUUID()}`);
  const originais = [catalogo.quarto, catalogo.banheiro, catalogo.cozinha, catalogo.inativo, catalogo.vazio, catalogo.soInativas];
  const tarefasOriginais = originais.map(c => c.tarefas ?? (c.tarefa ? [c.tarefa] : []));
  async function inserir(Model, dados) {
    confirmarModels(conexao, [Model]);
    const _id = id(); registros.get(Model).push(_id);
    return Model.create({ ...dados, _id });
  }
  async function atualizar(Model, chave, valores) {
    confirmarModels(conexao, [Model]);
    assert.ok(registros.get(Model).some(permitida => permitida.equals(chave)));
    assert.equal((await Model.updateOne({ _id: chave }, { $set: valores })).matchedCount, 1);
  }
  async function jogador() {
    const crianca = await inserir(Crianca, { usuarioId: id(), permissaoAtiva: true });
    const perfil = await inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "Estados #107", imagemAvatar: "teste.png" });
    const jogo = await inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "Estados #107" });
    return { usuarioId: crianca.usuarioId, crianca, perfil, jogo,
      comodos: originais.map(c => ({ ...c })), tarefas: tarefasOriginais.map(lista => lista.map(a => ({ ...a }))) };
  }
  async function fixture() {
    // Restaura somente catálogo temporário desta execução entre cenários.
    for (const c of originais) await atualizar(Comodo, c._id, { ordem: c.ordem, ativo: c.ativo });
    for (const tarefa of tarefasOriginais.flat()) await atualizar(Tarefa, tarefa._id, { ativo: tarefa.ativo });
    return jogador();
  }
  const app = express(); app.use(express.json()); app.use("/jogos-salvos", jogoRouter); app.use("/historico-jogo", historicoRouter);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  async function request(f, method, caminho, body, auth) {
    const headers = {};
    if (auth !== null) headers.authorization = `Bearer ${jwt.sign({ id: String(f.usuarioId), perfil: "crianca", ...(auth ?? {}) }, segredo, { expiresIn: "5m" })}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`http://127.0.0.1:${server.address().port}${caminho}`, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    assert.match(res.headers.get("content-type"), /application\/json/);
    return { status: res.status, dados: await res.json() };
  }
  const h = {
    mudarComodo: async (f, i, valores) => { await atualizar(Comodo, f.comodos[i]._id, valores); Object.assign(f.comodos[i], valores); },
    mudarTarefa: (f, c, p, valores) => atualizar(Tarefa, f.tarefas[c][p]._id, valores),
    outraPartida: async f => ({ ...f, jogo: await inserir(Jogo, { perfilJogoId: f.perfil._id, nomeJogo: "Outra partida" }) }),
    outraCrianca: () => jogador(),
    historicos: async (f, registrosHistoricos) => {
      const tentativas = new Map();
      let estrelas = 0;
      const docs = registrosHistoricos.map(([c, p, dificuldade, acertou], i) => {
        const tarefa = f.tarefas[c][p], chave = `${tarefa._id}:${dificuldade}`;
        const tentativa = (tentativas.get(chave) ?? 0) + 1; tentativas.set(chave, tentativa);
        const pontuacaoGanha = acertou ? { facil: 1, medio: 2, dificil: 3 }[dificuldade] : 0; estrelas += pontuacaoGanha;
        const _id = id(); registros.get(Historico).push(_id);
        return { _id, criancaId: f.crianca._id, perfilJogoId: f.perfil._id, jogoSalvoId: f.jogo._id,
          comodoId: tarefa.comodoId, tarefaId: tarefa._id, dificuldade, acertou, tentativa, pontuacaoGanha,
          respostaEscolhidaId: tarefa[acertou ? "correta" : "incorreta"]._id, dataHora: instanteEstado(i) };
      });
      confirmarModels(conexao, [Historico]);
      if (docs.length) await Historico.insertMany(docs, { ordered: true });
      await atualizar(Jogo, f.jogo._id, { estrelasTotal: estrelas });
    },
    catalogoAtivo: async () => { confirmarModels(leitura);
      return leitura.db.collection(Comodo.collection.name).find({ ativo: true }).sort({ ordem: 1 }).toArray(); },
    estado: async f => {
      confirmarModels(leitura);
      const documentos = [];
      for (const [Model, chaves] of registros) documentos.push([Model.modelName,
        await leitura.db.collection(Model.collection.name).find({ _id: { $in: chaves } }).sort({ _id: 1 }).toArray()]);
      return json({ jogo: await leitura.db.collection(Jogo.collection.name).findOne({ _id: f.jogo._id }), documentos });
    },
    http: (f, alvo = f.jogo._id, auth) => request(f, "GET", `/jogos-salvos/${alvo}/progresso`, undefined, auth),
  };
  conexao.getClient().on("commandStarted", monitorar);
  for (const caso of casosEstados) await t.test(caso.nome, async () => {
    const f = await fixture(); await prepararCasoEstados(h, f, caso);
    const inicio = comandos.length;
    await conferirEstados(h, f, caso);
    assert.deepEqual(comandos.slice(inicio).filter(c => ["insert", "update", "delete", "findAndModify", "bulkWrite"].includes(c)), []);
  });
  await t.test("autenticação, autorização e IDs", async s => conferirAcessoEstados(s, h, await fixture()));
  await t.test("respostas reais fazem a API acompanhar o desbloqueio de cada etapa", async () => {
    const f = await fixture();
    const responder = async (c, p, dificuldade = "facil", correta = true) => {
      const tarefa = f.tarefas[c][p], sessaoId = await garantirSessaoResposta(f.usuarioId, f.jogo._id);
      return request(f, "POST", "/historico-jogo/responder", { perfilJogoId: String(f.perfil._id),
        jogoSalvoId: String(f.jogo._id), tarefaId: String(tarefa._id), dificuldade, sessaoId,
        respostaEscolhidaId: String(tarefa[correta ? "correta" : "incorreta"]._id) });
    };
    const conferirPar = async (primeiro, segundo) => {
      const res = await h.http(f); assert.equal(res.status, 200);
      assert.equal(res.dados.comodos.find(c => c.comodoId === String(f.comodos[0]._id)).estado, primeiro);
      assert.equal(res.dados.comodos.find(c => c.comodoId === String(f.comodos[1]._id)).estado, segundo);
    };
    await conferirPar("disponivel", "bloqueado");
    assert.equal((await responder(1, 0)).dados.codigo, "COMODO_BLOQUEADO");
    assert.equal((await responder(0, 0, "facil", false)).status, 201);
    await conferirPar("disponivel", "bloqueado");
    for (const dificuldade of dificuldades) {
      for (const p of [0, 1]) {
        assert.equal((await responder(0, p, dificuldade)).status, 201);
        if (dificuldade !== "dificil" || p === 0) {
          await conferirPar("disponivel", "bloqueado");
          const bloqueada = await responder(1, 0);
          assert.equal(bloqueada.status, 403); assert.equal(bloqueada.dados.codigo, "COMODO_BLOQUEADO");
        }
      }
    }
    await conferirPar("concluido", "disponivel");
    assert.equal((await responder(1, 0)).status, 201);
    const dados = (await h.http(f)).dados;
    assert.equal(dados.estrelasTotal, 13);
    assert.equal(dados.resumo.totalTentativas, 8); assert.equal(dados.resumo.acertos, 7);
    assert.equal(dados.resumo.erros, 1); assert.equal(dados.resumo.tarefasConcluidas, 7);
    assert.equal(await leitura.db.collection(Historico.collection.name).countDocuments({ jogoSalvoId: f.jogo._id }), 8);
  });
});
