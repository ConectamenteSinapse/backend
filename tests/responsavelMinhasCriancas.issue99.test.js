import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import responsavelService from "../services/responsavelService.js";
import ResponsavelModel from "../models/responsavelModel.js";
import CriancaModel from "../models/criancaModel.js";

const usuarioResponsavelId = new mongoose.Types.ObjectId();
const responsavelId = new mongoose.Types.ObjectId();
const usuarioCriancaId = new mongoose.Types.ObjectId();
const criancaId = new mongoose.Types.ObjectId();

function mockarModelos(responsavel, criancas) {
  const responsavelOriginal = ResponsavelModel.findOne;
  const criancaOriginal = CriancaModel.find;
  ResponsavelModel.findOne = async () => responsavel;
  CriancaModel.find = () => ({
    populate: async () => criancas,
  });
  return () => {
    ResponsavelModel.findOne = responsavelOriginal;
    CriancaModel.find = criancaOriginal;
  };
}

test("#99 getMinhasCriancas retorna identidade sem senha e preserva campos", async () => {
  const restaurar = mockarModelos({ _id: responsavelId }, [{
    toObject: () => ({
      _id: criancaId,
      usuarioId: {
        _id: usuarioCriancaId,
        nome: "Ana Silva",
        email: "ana@example.com",
        senha: "hash-que-nao-deve-ser-retornado",
      },
      responsavelId,
      dataNascimento: "2018-01-01T00:00:00.000Z",
      permissaoAtiva: true,
      limiteTempoDiario: 30,
      tempoUsadoHoje: 10,
    }),
  }]);

  try {
    const resultado = await responsavelService.getMinhasCriancas(usuarioResponsavelId);
    assert.equal(resultado.length, 1);
    assert.equal(String(resultado[0]._id), String(criancaId));
    assert.equal(String(resultado[0].usuarioId), String(usuarioCriancaId));
    assert.equal(String(resultado[0].responsavelId), String(responsavelId));
    assert.equal(resultado[0].nome, "Ana Silva");
    assert.equal(resultado[0].email, "ana@example.com");
    assert.equal(resultado[0].dataNascimento, "2018-01-01T00:00:00.000Z");
    assert.equal(resultado[0].permissaoAtiva, true);
    assert.equal(resultado[0].limiteTempoDiario, 30);
    assert.equal(resultado[0].tempoUsadoHoje, 10);
    assert.equal(Object.hasOwn(resultado[0], "senha"), false);
  } finally {
    restaurar();
  }
});

test("#99 getMinhasCriancas retorna lista vazia", async () => {
  const restaurar = mockarModelos({ _id: responsavelId }, []);
  try {
    assert.deepEqual(await responsavelService.getMinhasCriancas(usuarioResponsavelId), []);
  } finally {
    restaurar();
  }
});

test("#99 getMinhasCriancas rejeita responsável inexistente", async () => {
  const restaurar = mockarModelos(null, []);
  try {
    await assert.rejects(
      responsavelService.getMinhasCriancas(usuarioResponsavelId),
      /RESPONSAVEL_NAO_ENCONTRADO/,
    );
  } finally {
    restaurar();
  }
});

test("#99 getMinhasCriancas trata usuário associado ausente", async () => {
  const restaurar = mockarModelos({ _id: responsavelId }, [{
    toObject: () => ({
      _id: criancaId,
      usuarioId: null,
      responsavelId,
      permissaoAtiva: false,
    }),
  }]);
  try {
    const resultado = await responsavelService.getMinhasCriancas(usuarioResponsavelId);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].usuarioId, null);
    assert.equal(resultado[0].nome, null);
    assert.equal(resultado[0].email, null);
  } finally {
    restaurar();
  }
});
