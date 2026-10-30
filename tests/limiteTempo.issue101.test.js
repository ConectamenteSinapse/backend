import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Responsavel from "../models/responsavelModel.js";
import Crianca from "../models/criancaModel.js";
import {
  id, serializar, invalidos, idsInvalidos, erroLimite, iniciarHttp,
} from "./helpers/limiteTempoIssue101.js";

async function preparar(t) {
  for (const metodo of ["connect", "createConnection"]) {
    t.mock.method(mongoose, metodo, () => assert.fail("MongoDB proibido nesta suíte"));
  }
  const responsavel = { _id: id(), usuarioId: id() };
  const crianca = new Crianca({
    _id: id(), usuarioId: id(), responsavelId: responsavel._id,
    dataNascimento: new Date("2018-05-10T00:00:00Z"), permissaoAtiva: true,
    limiteTempoDiario: 45, tempoUsadoHoje: 12,
    criadoEm: new Date("2026-01-01T00:00:00Z"),
  }).toObject();
  const consultas = [];
  const atualizacoes = [];
  t.mock.method(Responsavel, "findOne", async (filtro) => {
    consultas.push(filtro);
    return String(filtro.usuarioId) === String(responsavel.usuarioId) ? responsavel : null;
  });
  t.mock.method(Crianca, "findOneAndUpdate", async (filtro, update, opcoes) => {
    atualizacoes.push({ filtro, update, opcoes });
    if (String(filtro._id) !== String(crianca._id) ||
        String(filtro.responsavelId) !== String(crianca.responsavelId)) return null;
    Object.assign(crianca, update.$set);
    for (const [campo, valor] of Object.entries(update.$inc ?? {})) crianca[campo] = (crianca[campo] ?? 0) + valor;
    return crianca;
  });
  return {
    responsavel, crianca, consultas, atualizacoes,
    patch: await iniciarHttp(t, responsavel.usuarioId, crianca._id),
  };
}

for (const limite of [1, 30, 120]) {
  test(`#101 HTTP: inteiro positivo ${limite} — 200 e atualização restrita`, async (t) => {
    const j = await preparar(t);
    const antes = serializar(j.crianca);
    assert.deepEqual(await j.patch({ limiteTempoDiario: limite }), {
      status: 200,
      dados: { mensagem: "Limite diário atualizado com sucesso", limiteTempoDiario: limite },
    });
    assert.deepEqual(serializar(j.crianca), { ...antes, limiteTempoDiario: limite, sessaoJogoVersao: antes.sessaoJogoVersao + 1 });
    assert.deepEqual(j.consultas, [{ usuarioId: String(j.responsavel.usuarioId) }]);
    assert.deepEqual(j.atualizacoes, [{
      filtro: { _id: String(j.crianca._id), responsavelId: j.responsavel._id },
      update: { $set: { limiteTempoDiario: limite }, $inc: { sessaoJogoVersao: 1 } },
      opcoes: { new: true, runValidators: true },
    }]);
  });
}

test("#101 HTTP: null remove limite existente e preserva demais campos", async (t) => {
  const j = await preparar(t);
  const antes = serializar(j.crianca);
  assert.deepEqual(await j.patch({ limiteTempoDiario: null }), {
    status: 200,
    dados: { mensagem: "Limite diário atualizado com sucesso", limiteTempoDiario: null },
  });
  assert.deepEqual(serializar(j.crianca), { ...antes, limiteTempoDiario: null, sessaoJogoVersao: antes.sessaoJogoVersao + 1 });
  assert.deepEqual(j.atualizacoes[0].update, { $set: { limiteTempoDiario: null }, $inc: { sessaoJogoVersao: 1 } });
});

for (const [nome, body] of invalidos) {
  test(`#101 HTTP: rejeita ${nome} — 400 antes de consultar Models`, async (t) => {
    const j = await preparar(t);
    const antes = serializar(j.crianca);
    assert.deepEqual(await j.patch(body), { status: 400, dados: erroLimite });
    assert.deepEqual(j.consultas, []);
    assert.deepEqual(j.atualizacoes, []);
    assert.deepEqual(serializar(j.crianca), antes);
  });
}

test("#101 HTTP: body ausente — 400 sem consultas", async (t) => {
  const j = await preparar(t);
  assert.deepEqual(await j.patch(undefined), {
    status: 400, dados: { erro: true, mensagem: "Body da requisição obrigatório" },
  });
  assert.deepEqual(j.consultas, []);
  assert.deepEqual(j.atualizacoes, []);
});

for (const alvo of idsInvalidos) {
  test(`#101 HTTP: ID da criança inválido ${alvo} — 400 sem consultas`, async (t) => {
    const j = await preparar(t);
    assert.deepEqual(await j.patch({ limiteTempoDiario: 30 }, { alvo }), {
      status: 400, dados: { erro: true, mensagem: "ID inválido" },
    });
    assert.deepEqual(j.consultas, []);
    assert.deepEqual(j.atualizacoes, []);
  });
}

test("#101 HTTP: ID do usuário inválido no JWT — 400 sem consultas", async (t) => {
  const j = await preparar(t);
  assert.deepEqual(await j.patch({ limiteTempoDiario: 30 }, {
    usuario: { id: "invalido", perfil: "responsavel" },
  }), { status: 400, dados: { erro: true, mensagem: "ID inválido" } });
  assert.deepEqual(j.consultas, []);
  assert.deepEqual(j.atualizacoes, []);
});

for (const perfil of [null, "crianca", "admin"]) {
  test(`#101 HTTP: ${perfil === null ? "sem JWT — 401" : `perfil ${perfil} — 403`}`, async (t) => {
    const j = await preparar(t);
    assert.deepEqual(await j.patch({ limiteTempoDiario: 30 }, {
      usuario: perfil === null ? null : { id: String(j.responsavel.usuarioId), perfil },
    }), {
      status: perfil === null ? 401 : 403,
      dados: { erro: true, mensagem: perfil === null ? "Token nao informado" : "Acesso negado para esse perfil" },
    });
    assert.deepEqual(j.consultas, []);
    assert.deepEqual(j.atualizacoes, []);
  });
}

test("#101 HTTP: responsável sem perfil cadastrado — 404 sem atualização", async (t) => {
  const j = await preparar(t);
  assert.deepEqual(await j.patch({ limiteTempoDiario: 30 }, {
    usuario: { id: String(id()), perfil: "responsavel" },
  }), { status: 404, dados: { erro: true, mensagem: "Responsavel nao encontrado" } });
  assert.equal(j.consultas.length, 1);
  assert.deepEqual(j.atualizacoes, []);
});

for (const situacao of ["outro responsável", "sem vínculo", "inexistente", "ID de Usuario"]) {
  test(`#101 HTTP: criança ${situacao} — 404 e documento preservado`, async (t) => {
    const j = await preparar(t);
    if (situacao === "outro responsável") j.crianca.responsavelId = id();
    if (situacao === "sem vínculo") j.crianca.responsavelId = null;
    const alvo = situacao === "inexistente" ? id()
      : situacao === "ID de Usuario" ? j.crianca.usuarioId : j.crianca._id;
    const antes = serializar(j.crianca);
    assert.deepEqual(await j.patch({ limiteTempoDiario: 30 }, { alvo }), {
      status: 404,
      dados: { erro: true, mensagem: "Criança não encontrada entre as contas vinculadas" },
    });
    assert.deepEqual(serializar(j.crianca), antes);
    assert.equal(j.atualizacoes.length, 1);
    assert.equal(String(j.atualizacoes[0].filtro.responsavelId), String(j.responsavel._id));
  });
}

test("#101 HTTP: campos extras não alteram identidade, vínculo, permissão ou uso diário", async (t) => {
  const j = await preparar(t);
  const antes = serializar(j.crianca);
  assert.equal((await j.patch({
    limiteTempoDiario: 60, _id: String(id()), usuarioId: String(id()),
    responsavelId: String(id()), permissaoAtiva: false, tempoUsadoHoje: 0,
    dataNascimento: "2020-01-01", criadoEm: "2020-01-01", __v: 99,
  })).status, 200);
  assert.deepEqual(j.atualizacoes[0].update, { $set: { limiteTempoDiario: 60 }, $inc: { sessaoJogoVersao: 1 } });
  assert.deepEqual(serializar(j.crianca), { ...antes, limiteTempoDiario: 60, sessaoJogoVersao: antes.sessaoJogoVersao + 1 });
});
