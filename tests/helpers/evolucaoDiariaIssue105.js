import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import progressoRoutes from "../../routes/progressoRoutes.js";

export const id = () => new mongoose.Types.ObjectId();
export const serializar = valor => JSON.parse(JSON.stringify(valor));

export async function iniciarHttp(t, responsavel) {
  const anterior = process.env.JWT_SECRET;
  const segredo = randomUUID();
  process.env.JWT_SECRET = segredo;
  t.after(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  const app = express();
  app.use("/criancas", progressoRoutes);
  const servidor = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve, reject) => {
      servidor.close(erro => erro ? reject(erro) : resolve());
      servidor.closeAllConnections();
    });
  });
  await once(servidor, "listening");
  return async (alvo, usuario = { id: String(responsavel.usuarioId), perfil: "responsavel" }) => {
    const headers = usuario === null ? {} : {
      authorization: `Bearer ${jwt.sign(usuario, segredo, { expiresIn: "5m" })}`,
    };
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/criancas/${alvo}/evolucao-diaria`, { headers });
    assert.match(resposta.headers.get("content-type"), /application\/json/);
    return { status: resposta.status, dados: await resposta.json() };
  };
}

// Datas inseridas fora de ordem; tentativa é ordinal, não peso do contador.
// 02:59:59.999Z e 03:00:00Z ficam em dias locais diferentes.
export function historicos(crianca, outra) {
  const linhas = [
    ["2026-10-29T15:00:00Z", false],
    ["2026-10-25T15:00:00Z", true],
    ["2026-11-01T03:00:00Z", false],
    ["2026-10-27T15:00:00Z", true],
    ["2026-10-25T16:00:00Z", false],
    ["2026-11-01T02:59:59.999Z", true],
    ["2026-10-27T16:00:00Z", true],
    ["2026-10-29T16:00:00Z", false],
    ["2026-10-25T17:00:00Z", false],
    ["2026-10-27T17:00:00Z", false],
    ["2026-10-28T15:00:00Z", true],
    ["2026-10-28T16:00:00Z", true],
  ];
  return [...linhas, ["2026-10-25T18:00:00Z", true]].map(([dataHora, acertou], i) => ({
    _id: id(), criancaId: i === linhas.length ? outra._id : crianca._id,
    perfilJogoId: id(), jogoSalvoId: i % 2 ? id() : null,
    comodoId: id(), tarefaId: id(), respostaEscolhidaId: id(),
    acertou, tentativa: i + 1, pontuacaoGanha: acertou ? 2 : 0,
    tempoGastoSegundos: 5, dificuldade: ["facil", "medio", "dificil"][i % 3],
    dataHora: new Date(dataHora),
  }));
}

export const esperado = [
  { data: "2026-10-25", totalTentativas: 3, acertos: 1, erros: 2, percentualAcertos: 33.33 },
  { data: "2026-10-27", totalTentativas: 3, acertos: 2, erros: 1, percentualAcertos: 66.67 },
  { data: "2026-10-28", totalTentativas: 2, acertos: 2, erros: 0, percentualAcertos: 100 },
  { data: "2026-10-29", totalTentativas: 2, acertos: 0, erros: 2, percentualAcertos: 0 },
  { data: "2026-10-31", totalTentativas: 1, acertos: 1, erros: 0, percentualAcertos: 100 },
  { data: "2026-11-01", totalTentativas: 1, acertos: 0, erros: 1, percentualAcertos: 0 },
];

// Mesmos contratos HTTP exercitados com persistência simulada e MongoDB real.
export async function cenarios(t, j) {
  const consultar = () => j.get(j.crianca.usuarioId);
  const evolucao = async () => {
    const resposta = await consultar();
    assert.equal(resposta.status, 200);
    return resposta.dados.evolucao;
  };
  await t.test("JWT do responsável vinculado: contrato completo", async () => {
    assert.deepEqual(await consultar(), { status: 200, dados: {
      criancaId: String(j.crianca.usuarioId), evolucao: esperado,
    } });
  });
  await t.test("JWT da própria criança: mesmo resultado", async () => {
    assert.deepEqual(await j.get(j.crianca.usuarioId, {
      id: String(j.crianca.usuarioId), perfil: "crianca",
    }), await consultar());
  });
  await t.test("múltiplas tentativas do mesmo dia formam um único grupo", async () => {
    const grupos = (await evolucao()).filter(d => d.data === "2026-10-25");
    assert.deepEqual(grupos, [esperado[0]]);
  });
  await t.test("dias diferentes formam grupos independentes", async () => {
    assert.deepEqual(await evolucao(), esperado);
  });
  await t.test("ordem cronológica apesar da inserção fora de ordem", async () => {
    assert.deepEqual((await evolucao()).map(d => d.data), esperado.map(d => d.data));
  });
  await t.test("contadores: cada registro vale uma tentativa, independentemente do ordinal", async () => {
    const dias = await evolucao();
    assert.deepEqual(dias.map(d => [d.totalTentativas, d.acertos, d.erros]),
      [[3, 1, 2], [3, 2, 1], [2, 2, 0], [2, 0, 2], [1, 1, 0], [1, 0, 1]]);
    assert.equal(dias.reduce((n, d) => n + d.totalTentativas, 0), 12);
  });
  await t.test("percentuais arredondados para duas casas, para baixo e para cima", async () => {
    assert.deepEqual((await evolucao()).slice(0, 2).map(d => d.percentualAcertos), [33.33, 66.67]);
  });
  await t.test("dia com 100% de acertos", async () => {
    assert.deepEqual((await evolucao()).find(d => d.data === "2026-10-28"), esperado[2]);
  });
  await t.test("dia com tentativas e 0% de acertos", async () => {
    assert.deepEqual((await evolucao()).find(d => d.data === "2026-10-29"), esperado[3]);
  });
  await t.test("criança sem histórico retorna evolucao vazio", async () => {
    assert.deepEqual(await j.get(j.vazia.usuarioId), {
      status: 200, dados: { criancaId: String(j.vazia.usuarioId), evolucao: [] },
    });
  });
  await t.test("dias sem tentativas são omitidos, sem inventar 0%", async () => {
    const dias = await evolucao();
    for (const data of ["2026-10-26", "2026-10-30"]) assert.ok(!dias.some(d => d.data === data));
    assert.ok(dias.every(d => d.totalTentativas > 0));
  });
  await t.test("virada do mês à meia-noite de America/Sao_Paulo", async () => {
    assert.deepEqual((await evolucao()).slice(-2), esperado.slice(-2));
  });
  await t.test("histórico de outra criança não contamina os grupos", async () => {
    assert.deepEqual(await j.get(j.outra.usuarioId, {
      id: String(j.outra.usuarioId), perfil: "crianca",
    }), { status: 200, dados: { criancaId: String(j.outra.usuarioId), evolucao: [
      { data: "2026-10-25", totalTentativas: 1, acertos: 1, erros: 0, percentualAcertos: 100 },
    ] } });
  });
  const negado = "Você não tem permissão para consultar este progresso";
  for (const [nome, alvo, usuario, status, mensagem] of [
    ["identificador inválido", "invalido", undefined, 400, "ID da criança inválido"],
    ["criança inexistente", id(), undefined, 404, "Criança não encontrada"],
    ["Crianca._id não substitui Usuario._id na URL", j.crianca._id, undefined, 404, "Criança não encontrada"],
    ["sem JWT", j.crianca.usuarioId, null, 401, "Token nao informado"],
    ["responsável não vinculado", j.crianca.usuarioId, { id: String(j.outroResponsavel.usuarioId), perfil: "responsavel" }, 403, negado],
    ["outra criança", j.crianca.usuarioId, { id: String(j.outra.usuarioId), perfil: "crianca" }, 403, negado],
  ]) {
    await t.test(`${nome}: HTTP ${status}`, async () => {
      assert.deepEqual(await j.get(alvo, usuario), { status, dados: { erro: true, mensagem } });
    });
  }
}
