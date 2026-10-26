import test from "node:test";
import assert from "node:assert/strict";
import { motivoIgnorarAtlas } from "./helpers/atlasSeguro.js";
import { prepararResumoAtlas } from "./helpers/resumoDesempenhoAtlas.js";

// Execução sequencial: Models e JWT pertencem a este processo isolado.
const opcoes = { skip: motivoIgnorarAtlas(), concurrency: false };
const vazio = {
  totalTentativas: 0, acertos: 0, erros: 0, percentualAcertos: 0,
  totalEstrelas: 0, tarefasConcluidas: 0, ultimaInteracao: null,
};

function esperarCompleto(crianca, comodos) {
  return {
    criancaId: String(crianca._id),
    resumo: {
      totalTentativas: 6, acertos: 3, erros: 3, percentualAcertos: 50,
      totalEstrelas: 6, tarefasConcluidas: 2,
      ultimaInteracao: "2026-01-09T10:00:00.000Z",
    },
    desempenhoPorComodo: [
      { comodoId: comodos.quarto, tentativas: 3, acertos: 2, erros: 1, percentualAcertos: 66.67, tarefasConcluidas: 1 },
      { comodoId: comodos.cozinha, tentativas: 3, acertos: 1, erros: 2, percentualAcertos: 33.33, tarefasConcluidas: 1 },
    ],
  };
}

function conferirCompleto(resposta, crianca, comodos) {
  const esperado = esperarCompleto(crianca, comodos);
  assert.equal(resposta.status, 200);
  // A API não promete ordem entre os cômodos.
  const ordenar = (grupos) => [...grupos].sort((a, b) => a.comodoId.localeCompare(b.comodoId));
  assert.deepEqual({ ...resposta.dados, desempenhoPorComodo: ordenar(resposta.dados.desempenhoPorComodo) },
    { ...esperado, desempenhoPorComodo: ordenar(esperado.desempenhoPorComodo) });
}

test("#58 Atlas: resumo completo com seis históricos persistidos", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  const comodos = await j.criarSeisHistoricos(crianca);
  await j.confirmarPersistencia();
  conferirCompleto(await j.consultar(crianca), crianca, comodos);
  // O GET deve preservar integralmente os documentos persistidos.
  await j.confirmarPersistencia();
});

test("#58 Atlas: criança sem histórico", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  await j.confirmarPersistencia();
  assert.deepEqual(await j.consultar(crianca), {
    status: 200, dados: { criancaId: String(crianca._id), resumo: vazio, desempenhoPorComodo: [] },
  });
  await j.confirmarPersistencia();
});

test("#58 Atlas: isolamento entre crianças", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const a = await j.criarCrianca();
  const comodosA = await j.criarSeisHistoricos(a);
  const b = await j.criarCrianca();
  await j.confirmarPersistencia();
  conferirCompleto(await j.consultar(a), a, comodosA);
  assert.deepEqual(await j.consultar(b), {
    status: 200, dados: { criancaId: String(b._id), resumo: vazio, desempenhoPorComodo: [] },
  });
  const comodosB = await j.criarSeisHistoricos(b);
  await j.confirmarPersistencia();
  conferirCompleto(await j.consultar(a), a, comodosA);
  conferirCompleto(await j.consultar(b), b, comodosB);
  await j.confirmarPersistencia();
});

// Prefixo próprio permite executar apenas os novos testes de acesso.
test("#58 Atlas acesso: própria criança recebe 200", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  const comodos = await j.criarSeisHistoricos(crianca);
  await j.confirmarPersistencia();
  conferirCompleto(await j.consultar(crianca), crianca, comodos);
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: responsável vinculado recebe 200", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const responsavel = await j.criarResponsavel();
  const crianca = await j.criarCrianca({ responsavelId: responsavel._id });
  const comodos = await j.criarSeisHistoricos(crianca);
  await j.confirmarPersistencia();
  const resposta = await j.consultar(crianca, {
    usuario: { id: String(responsavel.usuarioId), perfil: "responsavel" },
  });
  conferirCompleto(resposta, crianca, comodos);
  assert.deepEqual(resposta, await j.consultar(crianca));
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: outra criança recebe 403", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  const outra = await j.criarCrianca();
  await j.criarSeisHistoricos(crianca);
  await j.confirmarPersistencia();
  assert.deepEqual(await j.consultar(crianca, {
    usuario: { id: String(outra.usuarioId), perfil: "crianca" },
  }), {
    status: 403, dados: { erro: true, mensagem: "Você não tem permissão para consultar este resumo" },
  });
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: responsável sem vínculo recebe 403", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const vinculado = await j.criarResponsavel();
  const outro = await j.criarResponsavel();
  const crianca = await j.criarCrianca({ responsavelId: vinculado._id });
  await j.criarSeisHistoricos(crianca);
  await j.confirmarPersistencia();
  assert.deepEqual(await j.consultar(crianca, {
    usuario: { id: String(outro.usuarioId), perfil: "responsavel" },
  }), {
    status: 403, dados: { erro: true, mensagem: "Você não tem permissão para consultar este resumo" },
  });
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: sem JWT recebe 401", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  await j.confirmarPersistencia();
  assert.deepEqual(await j.consultar(crianca, { usuario: null }), {
    status: 401, dados: { erro: true, mensagem: "Token nao informado" },
  });
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: JWT inválido recebe 401", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  await j.confirmarPersistencia();
  assert.deepEqual(await j.consultar(crianca, { authorization: "Bearer invalido" }), {
    status: 401, dados: { erro: true, mensagem: "Token invalido ou expirado" },
  });
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: JWT expirado recebe 401", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  await j.confirmarPersistencia();
  // Assinatura válida com exp no passado, sem espera ou alteração do relógio.
  assert.deepEqual(await j.consultar(crianca, { expirado: true }), {
    status: 401, dados: { erro: true, mensagem: "Token invalido ou expirado" },
  });
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: ID de usuário malformado recebe 400", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  await j.confirmarPersistencia();
  for (const usuarioId of ["invalido", "123", "z".repeat(24)]) {
    assert.deepEqual(await j.consultar(crianca, { usuarioId }), {
      status: 400, dados: { erro: true, mensagem: "ID da criança inválido" },
    });
  }
  await j.confirmarPersistencia();
});

test("#58 Atlas acesso: usuário sem cadastro de criança recebe 404", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  // Usuário persistido e autenticado consultando o próprio ID, sem Crianca.
  const usuario = await j.criarUsuario();
  await j.confirmarPersistencia();
  assert.deepEqual(await j.consultar({ usuarioId: usuario._id }), {
    status: 404, dados: { erro: true, mensagem: "Criança não encontrada" },
  });
  await j.confirmarPersistencia();
});
