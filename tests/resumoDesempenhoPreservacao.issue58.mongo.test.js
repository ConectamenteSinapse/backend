import test from "node:test";
import assert from "node:assert/strict";
import { motivoIgnorarAtlas } from "./helpers/atlasSeguro.js";
import { prepararResumoAtlas } from "./helpers/resumoDesempenhoAtlas.js";

const opcoes = { skip: motivoIgnorarAtlas(), concurrency: false };

function conferirResumo(resposta, crianca, fixtures) {
  assert.equal(resposta.status, 200);
  const ordenar = (grupos) => [...grupos].sort((a, b) => a.comodoId.localeCompare(b.comodoId));
  assert.deepEqual({ ...resposta.dados, desempenhoPorComodo: ordenar(resposta.dados.desempenhoPorComodo) }, {
    criancaId: String(crianca._id),
    resumo: {
      totalTentativas: 6, acertos: 3, erros: 3, percentualAcertos: 50,
      totalEstrelas: 6, tarefasConcluidas: 2,
      ultimaInteracao: "2026-01-09T10:00:00.000Z",
    },
    desempenhoPorComodo: ordenar([
      { comodoId: fixtures.quarto, tentativas: 3, acertos: 2, erros: 1, percentualAcertos: 66.67, tarefasConcluidas: 1 },
      { comodoId: fixtures.cozinha, tentativas: 3, acertos: 1, erros: 2, percentualAcertos: 33.33, tarefasConcluidas: 1 },
    ]),
  });
}

test("#58 Atlas preservação: arquivamento de personagem", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  const fixtures = await j.criarSeisHistoricos(crianca);
  await j.confirmarPersistencia();
  const antes = await j.consultar(crianca);
  conferirResumo(antes, crianca, fixtures);

  // Service real; a segunda conexão deve ver apenas status: arquivado.
  await j.arquivarFixture(crianca, fixtures.perfis[0]);
  await j.confirmarPersistencia();
  const depois = await j.consultar(crianca);
  conferirResumo(depois, crianca, fixtures);
  assert.deepEqual(depois, antes);
  await j.confirmarPersistencia();
});

test("#58 Atlas preservação: exclusão de partida", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  const fixtures = await j.criarSeisHistoricos(crianca);
  await j.confirmarPersistencia();
  const antes = await j.consultar(crianca);
  conferirResumo(antes, crianca, fixtures);

  // Personagem ativo: o Service atual não permite excluir sua partida após
  // arquivá-lo. Por isso os dois fluxos têm fixtures e testes independentes.
  await j.excluirPartidaFixture(crianca, fixtures.partidas[0]);
  // Compara documentos completos: partida ausente, históricos preservados
  // inclusive com o jogoSalvoId original, e demais fixtures inalteradas.
  await j.confirmarPersistencia();
  const depois = await j.consultar(crianca);
  conferirResumo(depois, crianca, fixtures);
  assert.deepEqual(depois, antes);
  await j.confirmarPersistencia();
});

test("#58 Atlas preservação: histórico sem vínculo de partida", opcoes, async (t) => {
  const j = await prepararResumoAtlas(t);
  const crianca = await j.criarCrianca();
  const fixtures = await j.criarSeisHistoricos(crianca, { historicoSemPartida: true });
  assert.equal(fixtures.historicos[0].jogoSalvoId, null);
  // A comparação completa pela segunda conexão exige null persistido.
  await j.confirmarPersistencia();
  conferirResumo(await j.consultar(crianca), crianca, fixtures);
  await j.confirmarPersistencia();
});
