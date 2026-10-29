import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Responsavel from "../models/responsavelModel.js";
import {
  id, serializar, dadosCrianca, erroVinculo, idsInvalidos, iniciarHttp,
} from "./helpers/desvinculacaoIssue103.js";

async function preparar(t, extras = {}) {
  for (const metodo of ["connect", "createConnection"]) {
    t.mock.method(mongoose, metodo, () => assert.fail("MongoDB proibido nesta suíte"));
  }
  const responsavel = { _id: id(), usuarioId: id() };
  const crianca = new Crianca(dadosCrianca(id(), responsavel._id, extras)).toObject();
  const irma = new Crianca(dadosCrianca(id(), responsavel._id)).toObject();
  const outraCrianca = new Crianca(dadosCrianca(id(), id())).toObject();
  const criancas = [crianca, irma, outraCrianca];
  const consultas = [];
  const atualizacoes = [];
  t.mock.method(Responsavel, "findOne", async filtro => {
    consultas.push(filtro);
    return String(filtro.usuarioId) === String(responsavel.usuarioId) ? responsavel : null;
  });
  t.mock.method(Crianca, "findOneAndUpdate", async (filtro, update, opcoes) => {
    atualizacoes.push({ filtro, update, opcoes });
    const doc = criancas.find(c => String(c._id) === String(filtro._id) &&
      String(c.responsavelId) === String(filtro.responsavelId));
    if (!doc) return null;
    Object.assign(doc, update.$set);
    return doc;
  });
  t.mock.method(Crianca, "find", filtro => ({
    populate: async (campo, projecao) => {
      assert.equal(campo, "usuarioId");
      assert.equal(projecao, "nome email");
      return criancas.filter(c => String(c.responsavelId) === String(filtro.responsavelId))
        .map(c => ({ toObject: () => ({ ...c, usuarioId: {
          _id: c.usuarioId, nome: "Fixture #103", email: `${c.usuarioId}@example.com`,
        } }) }));
    },
  }));
  return {
    responsavel, crianca, irma, outraCrianca, consultas, atualizacoes,
    estado: () => serializar(criancas), ...await iniciarHttp(t, responsavel.usuarioId),
  };
}

for (const [nome, extras] of [
  ["permissão ativa e limite definido", {}],
  ["permissão já inativa e limite null", { permissaoAtiva: false, limiteTempoDiario: null }],
]) {
  test(`#103 HTTP: desvincula com ${nome} e preserva demais campos`, async t => {
    const j = await preparar(t, extras);
    const antes = j.estado();
    assert.deepEqual(await j.desvincular(j.crianca._id), {
      status: 200, dados: { mensagem: "Criança desvinculada com sucesso" },
    });
    assert.deepEqual(j.estado(), antes.map(c => c._id === String(j.crianca._id)
      ? { ...c, responsavelId: null, permissaoAtiva: false } : c));
    assert.deepEqual(j.consultas, [{ usuarioId: String(j.responsavel.usuarioId) }]);
    assert.deepEqual(j.atualizacoes, [{
      filtro: { _id: String(j.crianca._id), responsavelId: j.responsavel._id },
      update: { $set: { responsavelId: null, permissaoAtiva: false } },
      opcoes: { new: true, runValidators: true },
    }]);
  });
}

test("#103 HTTP: sai da listagem e outra criança permanece vinculada", async t => {
  const j = await preparar(t);
  const listarIds = async () => {
    const res = await j.listar();
    assert.equal(res.status, 200);
    return res.dados.map(c => c._id).sort();
  };
  assert.deepEqual(await listarIds(), [String(j.crianca._id), String(j.irma._id)].sort());
  assert.equal((await j.desvincular(j.crianca._id)).status, 200);
  assert.deepEqual(await listarIds(), [String(j.irma._id)]);
});

for (const caso of ["outro responsável", "já desvinculada", "inexistente", "ID de Usuario"]) {
  test(`#103 HTTP: criança ${caso} — 404 e dados preservados`, async t => {
    const j = await preparar(t);
    if (caso === "já desvinculada") j.crianca.responsavelId = null;
    const alvo = caso === "outro responsável" ? j.outraCrianca._id
      : caso === "inexistente" ? id() : caso === "ID de Usuario" ? j.crianca.usuarioId : j.crianca._id;
    const antes = j.estado();
    assert.deepEqual(await j.desvincular(alvo), { status: 404, dados: erroVinculo });
    assert.deepEqual(j.estado(), antes);
    assert.equal(j.atualizacoes.length, 1);
    assert.equal(String(j.atualizacoes[0].filtro.responsavelId), String(j.responsavel._id));
  });
}

test("#103 HTTP: segunda desvinculação retorna 404 sem novas alterações", async t => {
  const j = await preparar(t);
  assert.equal((await j.desvincular(j.crianca._id)).status, 200);
  const antes = j.estado();
  assert.deepEqual(await j.desvincular(j.crianca._id), { status: 404, dados: erroVinculo });
  assert.deepEqual(j.estado(), antes);
});

for (const alvo of idsInvalidos) {
  test(`#103 HTTP: ID inválido ${alvo} — 400 sem consultas`, async t => {
    const j = await preparar(t);
    assert.deepEqual(await j.desvincular(alvo), {
      status: 400, dados: { erro: true, mensagem: "ID inválido" },
    });
    assert.deepEqual(j.consultas, []);
    assert.deepEqual(j.atualizacoes, []);
  });
}

for (const [nome, usuario, status, mensagem] of [
  ["ID inválido no JWT", { id: "invalido", perfil: "responsavel" }, 400, "ID inválido"],
  ["responsável sem perfil", { id: String(id()), perfil: "responsavel" }, 404, "Responsavel nao encontrado"],
  ["sem JWT", null, 401, "Token nao informado"],
  ["perfil criança", { id: String(id()), perfil: "crianca" }, 403, "Acesso negado para esse perfil"],
  ["perfil admin", { id: String(id()), perfil: "admin" }, 403, "Acesso negado para esse perfil"],
]) {
  test(`#103 HTTP: ${nome} — ${status} sem atualização`, async t => {
    const j = await preparar(t);
    const antes = j.estado();
    assert.deepEqual(await j.desvincular(j.crianca._id, { usuario }), {
      status, dados: { erro: true, mensagem },
    });
    assert.deepEqual(j.estado(), antes);
    assert.deepEqual(j.atualizacoes, []);
    assert.equal(j.consultas.length, status === 404 ? 1 : 0);
  });
}

test("#103 HTTP: body não pode escolher responsável nem alterar outros campos", async t => {
  const j = await preparar(t);
  const antes = j.estado();
  assert.equal((await j.desvincular(j.crianca._id, { body: {
    usuarioId: String(id()), responsavelId: String(id()), permissaoAtiva: true,
    limiteTempoDiario: 0, tempoUsadoHoje: 0, dataNascimento: "2020-01-01",
  } })).status, 200);
  assert.deepEqual(j.estado(), antes.map(c => c._id === String(j.crianca._id)
    ? { ...c, responsavelId: null, permissaoAtiva: false } : c));
});
