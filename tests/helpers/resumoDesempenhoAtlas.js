import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Usuario from "../../models/usuarioModel.js";
import Crianca from "../../models/criancaModel.js";
import Responsavel from "../../models/responsavelModel.js";
import Perfil from "../../models/perfilJogoModel.js";
import Partida from "../../models/jogoSalvoModel.js";
import Comodo from "../../models/comodoModel.js";
import Tarefa from "../../models/tarefaModel.js";
import Resposta from "../../models/respostaModel.js";
import Historico from "../../models/historicoJogoModel.js";
import criancaRoutes from "../../routes/criancaRoutes.js";
import { arquivarPersonagem } from "../../services/perfilJogoService.js";
import { excluirJogoSalvo } from "../../services/jogoSalvoService.js";
import {
  validarAtivacao, obterUriTeste, abrirConexaoTeste,
  confirmarModels, limparRegistrosTeste,
} from "./atlasSeguro.js";

const serializar = (valor) => JSON.parse(JSON.stringify(valor));

// Sem dotenv e sem import de index.js. A única autorização necessária é
// RUN_ATLAS_TESTS: estas fixtures não exercitam commit de transação do Service.
export async function prepararResumoAtlas(t) {
  validarAtivacao();
  obterUriTeste();
  const execucao = `issue58-${randomUUID()}`;
  const registros = new Map();
  const esperados = new Map();
  let conexao;
  let leitura;
  let server;
  const segredoAnterior = process.env.JWT_SECRET;
  const segredo = randomUUID();

  t.after(async () => {
    const falhas = [];
    try {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((erro) => erro ? reject(erro) : resolve());
          server.closeAllConnections();
        });
      }
    } catch { falhas.push(new Error("Falha ao encerrar HTTP da issue58")); }
    try {
      if (conexao) {
        // Todos os históricos desta suíte têm IDs registrados antes do save.
        await limparRegistrosTeste(conexao, registros);
      }
    } catch { falhas.push(new Error("Limpeza da issue58 incompleta")); }
    try {
      if (leitura) {
        confirmarModels(leitura);
        for (const [model, ids] of registros) {
          const restantes = await leitura.db.collection(model.collection.name)
            .countDocuments({ _id: { $in: ids } });
          assert.equal(restantes, 0, `Resíduos da execução em ${model.modelName}`);
        }
        t.diagnostic("Limpeza confirmada também pela conexão independente");
      }
    } catch { falhas.push(new Error("Ausência de resíduos não confirmada pela segunda conexão")); }
    try { await leitura?.close(); }
    catch { falhas.push(new Error("Falha ao encerrar conexão independente")); }
    try { if (conexao) await conexao.close(); }
    catch { falhas.push(new Error("Falha ao encerrar conexão principal")); }
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    if (falhas.length) throw new AggregateError(falhas, "Teardown da issue58 falhou");
  });

  conexao = await abrirConexaoTeste();
  leitura = await abrirConexaoTeste({ leitura: true });
  confirmarModels(conexao);
  confirmarModels(leitura);
  assert.notEqual(leitura.getClient(), conexao.getClient());
  t.diagnostic("Duas conexões confirmadas em conectamente_testes");
  process.env.JWT_SECRET = segredo;

  async function inserir(model, dados) {
    confirmarModels(conexao, [model]);
    const documento = new model({ ...dados, _id: new mongoose.Types.ObjectId() });
    if (!registros.has(model)) {
      registros.set(model, []);
      esperados.set(model, []);
    }
    // Registrar antes de validar/gravar: cobre falha ou resposta de escrita incerta.
    registros.get(model).push(documento._id);
    esperados.get(model).push(serializar(documento.toObject()));
    await documento.validate();
    await documento.save({ writeConcern: { w: "majority", wtimeoutMS: 10000 } });
    return documento;
  }

  async function criarUsuario(perfil = "crianca") {
    return inserir(Usuario, {
      nome: `Usuário fictício ${execucao}`,
      email: `${execucao}-${randomUUID()}@example.invalid`,
      senha: randomUUID(), perfil,
    });
  }

  async function criarResponsavel() {
    const usuario = await criarUsuario("responsavel");
    return inserir(Responsavel, { usuarioId: usuario._id });
  }

  async function criarCrianca({ responsavelId = null } = {}) {
    const usuario = await criarUsuario();
    return inserir(Crianca, { usuarioId: usuario._id, responsavelId, permissaoAtiva: true });
  }

  async function criarSeisHistoricos(crianca, { historicoSemPartida = false } = {}) {
    const perfis = [];
    const partidas = [];
    for (let indice = 0; indice < 2; indice++) {
      const perfil = await inserir(Perfil, {
        criancaId: crianca._id, nomeAvatar: `Avatar fictício ${execucao}-${indice}`,
        imagemAvatar: "teste.png",
      });
      perfis.push(perfil);
      partidas.push(await inserir(Partida, {
        perfilJogoId: perfil._id, nomeJogo: `Partida fictícia ${execucao}-${indice}`,
      }));
    }
    const comodos = [];
    for (const nome of ["Quarto", "Cozinha"]) {
      comodos.push(await inserir(Comodo, {
        nome, descricao: `Fixture ${execucao}`, imagemCenario: "teste.png",
        ordem: comodos.length + 1, dificuldadesDisponiveis: ["facil", "medio", "dificil"],
      }));
    }
    const tarefas = [];
    const respostas = [];
    for (let indice = 0; indice < 4; indice++) {
      const tarefa = await inserir(Tarefa, {
        comodoId: comodos[Math.floor(indice / 2)]._id,
        titulo: `Tarefa ${execucao}-${indice}`, enunciado: "Dados fictícios",
        descricao: "Fixture de resumo", imagemObjeto: "teste.png",
        posicao: { x: 0, y: 0, largura: 1, altura: 1 },
        ordem: indice % 2 + 1, dificuldade: "facil",
      });
      tarefas.push(tarefa);
      respostas.push(await inserir(Resposta, {
        tarefaId: tarefa._id, texto: "Alternativa fictícia", correta: indice % 2 === 0, ordem: 1,
      }));
    }
    const linhas = [
      // tarefa, acerto, estrelas, dificuldade, data UTC, tentativa
      [0, true, 1, "facil", "2026-01-02T10:00:00.000Z", 1],
      [0, true, 3, "dificil", "2026-01-09T10:00:00.000Z", 1],
      [1, false, 0, "facil", "2026-01-01T10:00:00.000Z", 1],
      [2, true, 2, "medio", "2026-01-04T10:00:00.000Z", 1],
      [3, false, 0, "facil", "2026-01-08T10:00:00.000Z", 1],
      [3, false, 0, "facil", "2026-01-03T10:00:00.000Z", 2],
    ];
    const historicos = [];
    for (const [indice, acertou, pontuacaoGanha, dificuldade, data, tentativa] of linhas) {
      const grupo = Math.floor(indice / 2);
      historicos.push(await inserir(Historico, {
        criancaId: crianca._id, perfilJogoId: perfis[grupo]._id,
        // Apenas o primeiro histórico fica sem vínculo; os outros mantêm partida.
        jogoSalvoId: historicoSemPartida && historicos.length === 0 ? null : partidas[grupo]._id,
        comodoId: comodos[grupo]._id,
        tarefaId: tarefas[indice]._id, respostaEscolhidaId: respostas[indice]._id,
        acertou, pontuacaoGanha, dificuldade, dataHora: new Date(data), tentativa,
      }));
    }
    return { quarto: String(comodos[0]._id), cozinha: String(comodos[1]._id), perfis, partidas, historicos };
  }

  function fixtureRegistrada(model, id) {
    confirmarModels(conexao, [model]);
    const documento = esperados.get(model)?.find((doc) => doc._id === String(id));
    assert.ok(documento, "Operação limitada às fixtures desta execução");
    return documento;
  }

  async function arquivarFixture(crianca, perfil) {
    const dono = fixtureRegistrada(Crianca, crianca._id);
    const esperado = fixtureRegistrada(Perfil, perfil._id);
    assert.equal(dono.usuarioId, String(crianca.usuarioId));
    assert.equal(esperado.criancaId, dono._id);
    const atualizado = await arquivarPersonagem(crianca.usuarioId, perfil._id);
    assert.equal(String(atualizado._id), esperado._id);
    assert.equal(atualizado.status, "arquivado");
    // Só esta mudança é esperada: todos os demais campos/documentos continuam
    // comparados integralmente pela conexão independente, inclusive históricos.
    esperado.status = "arquivado";
  }

  async function excluirPartidaFixture(crianca, partida) {
    const dono = fixtureRegistrada(Crianca, crianca._id);
    const esperado = fixtureRegistrada(Partida, partida._id);
    const perfil = fixtureRegistrada(Perfil, esperado.perfilJogoId);
    assert.equal(dono.usuarioId, String(crianca.usuarioId));
    assert.equal(perfil.criancaId, dono._id);
    await excluirJogoSalvo(crianca.usuarioId, partida._id);
    esperados.set(Partida, esperados.get(Partida).filter((doc) => doc._id !== esperado._id));
    // O ID permanece em registros: a verificação detecta se a exclusão não
    // persistiu e o teardown continua restrito ao conjunto original de IDs.
  }

  async function confirmarPersistencia() {
    confirmarModels(leitura);
    for (const [model, documentos] of esperados) {
      const encontrados = await leitura.db.collection(model.collection.name)
        .find({ _id: { $in: registros.get(model) } }).toArray();
      // __v é metadado gerado pelo save, não um dado da fixture.
      const normalizar = (docs) => serializar(docs).map(({ __v, ...doc }) => doc)
        .sort((a, b) => a._id.localeCompare(b._id));
      assert.deepEqual(normalizar(encontrados), normalizar(documentos),
        `Persistência independente de ${model.modelName}`);
    }
    // Confirma também ausência de histórico para crianças sem tentativas e
    // detecta registros extras, sempre limitado às crianças desta execução.
    const historicos = await leitura.db.collection(Historico.collection.name)
      .find({ criancaId: { $in: registros.get(Crianca) ?? [] } }).toArray();
    const ids = (docs) => docs.map((doc) => String(doc._id)).sort();
    assert.deepEqual(ids(historicos), ids(esperados.get(Historico) ?? []));
  }

  const app = express();
  app.use("/criancas", criancaRoutes);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  async function consultar(crianca, {
    usuario = { id: String(crianca.usuarioId), perfil: "crianca" },
    usuarioId = crianca.usuarioId,
    authorization,
    expirado = false,
  } = {}) {
    confirmarModels(conexao);
    const headers = {};
    if (authorization !== undefined) headers.Authorization = authorization;
    else if (usuario !== null) {
      const token = jwt.sign(usuario, segredo, { expiresIn: expirado ? -60 : "5m" });
      headers.Authorization = `Bearer ${token}`;
    }
    // O contrato atual da URL usa Usuario._id; a resposta devolve Crianca._id.
    const res = await fetch(`http://127.0.0.1:${server.address().port}/criancas/${encodeURIComponent(String(usuarioId))}/resumo-desempenho`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    assert.match(res.headers.get("content-type"), /application\/json/);
    return { status: res.status, dados: await res.json() };
  }
  return {
    criarUsuario, criarResponsavel, criarCrianca, criarSeisHistoricos,
    confirmarPersistencia, consultar, arquivarFixture, excluirPartidaFixture,
  };
}
