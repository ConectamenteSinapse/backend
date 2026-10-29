import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Crianca from "../models/criancaModel.js";
import Responsavel from "../models/responsavelModel.js";
import Historico from "../models/historicoJogoModel.js";
import { id, serializar, iniciarHttp, historicos, cenarios } from "./helpers/evolucaoDiariaIssue105.js";

test("#105 HTTP: evolução diária com persistência simulada", { concurrency: false }, async t => {
  for (const metodo of ["connect", "createConnection"]) {
    t.mock.method(mongoose, metodo, () => assert.fail("MongoDB proibido nesta suíte"));
  }
  const responsavel = { _id: id(), usuarioId: id() };
  const outroResponsavel = { _id: id(), usuarioId: id() };
  const criar = dono => new Crianca({ usuarioId: id(), responsavelId: dono._id }).toObject();
  const crianca = criar(responsavel);
  const vazia = criar(responsavel);
  const outra = criar(outroResponsavel);
  const criancas = [crianca, vazia, outra];
  const responsaveis = [responsavel, outroResponsavel];
  const documentos = historicos(crianca, outra);
  const antes = serializar({ criancas, responsaveis, documentos });
  t.mock.method(Crianca, "findOne", async filtro =>
    criancas.find(c => String(c.usuarioId) === String(filtro.usuarioId)) ?? null);
  t.mock.method(Responsavel, "findOne", async filtro =>
    responsaveis.find(r => String(r.usuarioId) === String(filtro.usuarioId)) ?? null);
  t.mock.method(Historico, "find", filtro => ({
    sort: ordem => ({ lean: async () => {
      assert.deepEqual(Object.keys(filtro), ["criancaId"]);
      return documentos.filter(d => String(d.criancaId) === String(filtro.criancaId))
        .map(d => ({ ...d })).sort((a, b) => (a.dataHora - b.dataHora) * ordem.dataHora);
    } }),
  }));
  const get = await iniciarHttp(t, responsavel);
  await cenarios(t, { crianca, vazia, outra, outroResponsavel, get });
  await t.test("consultas e rejeições preservam todos os dados simulados", () => {
    assert.deepEqual(serializar({ criancas, responsaveis, documentos }), antes);
  });
});
