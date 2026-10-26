import test from "node:test";
import assert from "node:assert/strict";
import { consultarResumoDesempenho } from "../services/resumoDesempenhoService.js";
import { validarAcessoCrianca } from "../services/validarAcessoCriancaService.js";
import { prepararResumo, id, Crianca, Responsavel, Historico } from "./helpers/resumoDesempenhoMock.js";

const vazio = {
  totalTentativas: 0, acertos: 0, erros: 0, percentualAcertos: 0,
  totalEstrelas: 0, tarefasConcluidas: 0, ultimaInteracao: null,
};
const negado = {
  status: 403,
  dados: { erro: true, mensagem: "Você não tem permissão para consultar este resumo" },
};
async function prepararHttp(t) {
  const jogo = prepararResumo(t);
  return { ...jogo, consultar: await jogo.iniciarHttp() };
}
function semHistorico(jogo) {
  assert.equal(jogo.consultas.filter((q) => q.model === Historico).length, 0);
}
// A API não promete ordem entre cômodos; comparar sem impor esse contrato.
function ordenarComodos(comodos) {
  return [...comodos].sort((a, b) => a.comodoId.localeCompare(b.comodoId));
}

test("#58 HTTP: criança autenticada consulta seu próprio desempenho — 200", async (t) => {
  const j = await prepararHttp(t);
  j.tentativa();
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.equal(res.dados.criancaId, String(j.crianca._id));
  assert.deepEqual(res.dados.resumo, {
    ...vazio, totalTentativas: 1, acertos: 1, percentualAcertos: 100,
    totalEstrelas: 1, tarefasConcluidas: 1, ultimaInteracao: "2026-01-01T10:00:00.000Z",
  });
});

test("#58 HTTP: responsável vinculado recebe o mesmo resumo — 200", async (t) => {
  const j = await prepararHttp(t);
  j.tentativa({ pontuacaoGanha: 3 });
  const res = await j.consultar(j.crianca.usuarioId, {
    id: String(j.responsavel.usuarioId), perfil: "responsavel",
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res, await j.consultar());
  assert.deepEqual(j.consultas.find((q) => q.model === Responsavel).filtro, {
    usuarioId: String(j.responsavel.usuarioId),
  });
});

test("#58 HTTP: criança consulta outra criança — 403, sem ler histórico", async (t) => {
  const j = await prepararHttp(t);
  assert.deepEqual(await j.consultar(j.outraCrianca.usuarioId), negado);
  semHistorico(j);
});

test("#58 HTTP: responsável consulta criança não vinculada — 403", async (t) => {
  const j = await prepararHttp(t);
  assert.deepEqual(await j.consultar(j.crianca.usuarioId, {
    id: String(j.outroResponsavel.usuarioId), perfil: "responsavel",
  }), negado);
  semHistorico(j);
});

test("#58 HTTP: ID malformado — 400 antes de consultar qualquer Model", async (t) => {
  const j = await prepararHttp(t);
  for (const valor of ["invalido", "123", "z".repeat(24)]) {
    assert.deepEqual(await j.consultar(valor), {
      status: 400, dados: { erro: true, mensagem: "ID da criança inválido" },
    });
  }
  assert.deepEqual(j.consultas, []);
});

test("#58 HTTP: criança inexistente — 404", async (t) => {
  const j = await prepararHttp(t);
  assert.deepEqual(await j.consultar(id()), {
    status: 404, dados: { erro: true, mensagem: "Criança não encontrada" },
  });
  semHistorico(j);
});

test("#58 HTTP: sem JWT — 401 antes de consultar o banco", async (t) => {
  const j = await prepararHttp(t);
  assert.deepEqual(await j.consultar(j.crianca.usuarioId, null), {
    status: 401, dados: { erro: true, mensagem: "Token nao informado" },
  });
  assert.deepEqual(j.consultas, []);
});

test("#58 HTTP: JWT inválido e formato inválido — 401 sem consultas", async (t) => {
  const j = await prepararHttp(t);
  for (const authorization of ["Bearer invalido", "Basic invalido"]) {
    assert.equal((await j.consultar(j.crianca.usuarioId, null, authorization)).status, 401);
  }
  assert.deepEqual(j.consultas, []);
});

test("#58 HTTP: criança sem histórico — indicadores zero e última interação null", async (t) => {
  const j = await prepararHttp(t);
  assert.deepEqual(await j.consultar(), {
    status: 200, dados: {
      criancaId: String(j.crianca._id), resumo: vazio, desempenhoPorComodo: [],
    },
  });
});

test("#58 HTTP: calcula tentativas, acertos, erros e percentual arredondado", async (t) => {
  const j = await prepararHttp(t);
  j.tentativa();
  j.tentativa();
  j.tentativa({ acertou: false, pontuacaoGanha: 0 });
  const { status, dados: { resumo } } = await j.consultar();
  assert.equal(status, 200);
  assert.equal(resumo.totalTentativas, 3);
  assert.equal(resumo.acertos, 2);
  assert.equal(resumo.erros, 1);
  assert.equal(resumo.percentualAcertos, 66.67);
});

test("#58 HTTP: soma estrelas de todas as tentativas, inclusive pontuação zero", async (t) => {
  const j = await prepararHttp(t);
  for (const pontuacaoGanha of [3, 2, 0, 1]) j.tentativa({ pontuacaoGanha });
  assert.equal((await j.consultar()).dados.resumo.totalEstrelas, 6);
});

test("#58 HTTP: acertos repetidos na mesma tarefa contam uma conclusão distinta", async (t) => {
  const j = await prepararHttp(t);
  const tarefaId = id();
  j.tentativa({ tarefaId });
  j.tentativa({ tarefaId: id(String(tarefaId)), dificuldade: "dificil" });
  j.tentativa({ tarefaId: id(), acertou: false, pontuacaoGanha: 0 });
  j.tentativa({ tarefaId: id() });
  const { resumo } = (await j.consultar()).dados;
  assert.equal(resumo.totalTentativas, 4);
  assert.equal(resumo.acertos, 3);
  assert.equal(resumo.tarefasConcluidas, 2);
});

test("#58 HTTP: agrega várias partidas e perfis, excluindo histórico de outra criança", async (t) => {
  const j = await prepararHttp(t);
  const jogoSalvoId = id();
  const perfilJogoId = id();
  j.tentativa({ jogoSalvoId, perfilJogoId });
  j.tentativa({ jogoSalvoId, perfilJogoId, acertou: false, pontuacaoGanha: 0 });
  j.tentativa({ jogoSalvoId: id(), perfilJogoId: id(), pontuacaoGanha: 3 });
  j.tentativa({ criancaId: j.outraCrianca._id, pontuacaoGanha: 99 });
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(res.dados.resumo, {
    totalTentativas: 3, acertos: 2, erros: 1, percentualAcertos: 66.67,
    totalEstrelas: 4, tarefasConcluidas: 2, ultimaInteracao: "2026-01-01T10:00:00.000Z",
  });
  const consulta = j.consultas.find((q) => q.model === Historico);
  assert.deepEqual(consulta.filtro, { criancaId: j.crianca._id });
  assert.equal(consulta.lean, true);
});

test("#58 HTTP: inclui histórico preservado com partida ausente e vínculo null", async (t) => {
  const j = await prepararHttp(t);
  const comodoId = id();
  // Nenhum documento de partida existe no mock. Uma referência pendente
  // representa a partida excluída; null cobre histórico sem vínculo.
  j.tentativa({ comodoId, jogoSalvoId: id(), pontuacaoGanha: 3 });
  j.tentativa({ comodoId, jogoSalvoId: null, acertou: false, pontuacaoGanha: 0 });
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(res.dados.resumo, {
    totalTentativas: 2, acertos: 1, erros: 1, percentualAcertos: 50,
    totalEstrelas: 3, tarefasConcluidas: 1, ultimaInteracao: "2026-01-01T10:00:00.000Z",
  });
  assert.deepEqual(res.dados.desempenhoPorComodo, [{
    comodoId: String(comodoId), tentativas: 2, acertos: 1, erros: 1,
    percentualAcertos: 50, tarefasConcluidas: 1,
  }]);
  assert.ok(j.consultas.every((q) => [Crianca, Historico].includes(q.model)));
});

test("#58 HTTP: última interação é a maior data, independentemente da ordem de inserção", async (t) => {
  const j = await prepararHttp(t);
  for (const data of ["2026-01-02", "2026-01-09", "2026-01-01", "2026-01-04"]) {
    j.tentativa({ dataHora: new Date(`${data}T10:00:00.000Z`) });
  }
  assert.equal((await j.consultar()).dados.resumo.ultimaInteracao, "2026-01-09T10:00:00.000Z");
  assert.deepEqual(j.consultas.find((q) => q.model === Historico).opcoes.sort, { dataHora: -1 });
});

for (const model of [Crianca, Responsavel, Historico]) {
  test(`#58 HTTP: erro inesperado em ${model.modelName} — 500 sem detalhes internos`, async (t) => {
    const j = await prepararHttp(t);
    j.estado.falharModelo = model;
    const res = await j.consultar(j.crianca.usuarioId, {
      id: String(j.responsavel.usuarioId), perfil: "responsavel",
    });
    assert.deepEqual(res, {
      status: 500, dados: { erro: true, mensagem: "Erro interno ao consultar resumo de desempenho" },
    });
    assert.doesNotMatch(JSON.stringify(res.dados), /db-interno|segredo-ficticio|stack|Error/);
    assert.equal(j.logs.mock.callCount(), 1);
    assert.equal(j.logs.mock.calls[0].arguments[1], j.erroInterno);
  });
}

test("#58 unitário: Service usa Usuario._id na autorização e Crianca._id no histórico", async (t) => {
  const j = prepararResumo(t);
  assert.notEqual(String(j.crianca._id), String(j.crianca.usuarioId));
  const res = await consultarResumoDesempenho(String(j.crianca.usuarioId), j.usuario);
  assert.deepEqual(res, {
    criancaId: j.crianca._id, resumo: vazio, desempenhoPorComodo: [],
  });
  assert.deepEqual(j.consultas.map((q) => q.filtro), [
    { usuarioId: String(j.crianca.usuarioId) }, { criancaId: j.crianca._id },
  ]);
});

test("#58 unitário: Service trata histórico legado sem pontuação como zero", async (t) => {
  const j = prepararResumo(t);
  j.tentativa({ pontuacaoGanha: undefined });
  j.tentativa({ pontuacaoGanha: null });
  const { resumo } = await consultarResumoDesempenho(String(j.crianca.usuarioId), j.usuario);
  assert.equal(resumo.totalEstrelas, 0);
  assert.equal(resumo.totalTentativas, 2);
});

test("#58 unitário: somente erros resultam em 0% e nenhuma tarefa concluída", async (t) => {
  const j = prepararResumo(t);
  j.tentativa({ acertou: false, pontuacaoGanha: 0 });
  const { resumo } = await consultarResumoDesempenho(String(j.crianca.usuarioId), j.usuario);
  assert.equal(resumo.percentualAcertos, 0);
  assert.equal(resumo.acertos, 0);
  assert.equal(resumo.erros, 1);
  assert.equal(resumo.tarefasConcluidas, 0);
});

test("#58 unitário: autorização rejeita usuário ausente, perfil inesperado e responsável inexistente", async (t) => {
  const j = prepararResumo(t);
  for (const usuario of [undefined, { id: String(j.crianca.usuarioId), perfil: "admin" }, { id: String(id()), perfil: "responsavel" }]) {
    await assert.rejects(validarAcessoCrianca(String(j.crianca.usuarioId), usuario), { message: "ACESSO_NEGADO" });
  }
  semHistorico(j);
});

test("#58 unitário: responsável não acessa criança sem vínculo", async (t) => {
  const j = prepararResumo(t);
  j.crianca.responsavelId = null;
  await assert.rejects(validarAcessoCrianca(String(j.crianca.usuarioId), {
    id: String(j.responsavel.usuarioId), perfil: "responsavel",
  }), { message: "ACESSO_NEGADO" });
});

test("#58 HTTP: agrupa ObjectIds equivalentes e separa cômodos, incluindo várias partidas", async (t) => {
  const j = await prepararHttp(t);
  const quarto = id();
  const cozinha = id();
  j.tentativa({ comodoId: quarto, jogoSalvoId: id() });
  j.tentativa({ comodoId: cozinha, jogoSalvoId: id(), acertou: false, pontuacaoGanha: 0 });
  j.tentativa({ comodoId: id(String(quarto)), jogoSalvoId: id() });
  // Outra criança não pode alterar os grupos nem criar um cômodo adicional.
  j.tentativa({ criancaId: j.outraCrianca._id, comodoId: quarto });
  j.tentativa({ criancaId: j.outraCrianca._id, comodoId: id() });
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(ordenarComodos(res.dados.desempenhoPorComodo), ordenarComodos([
    { comodoId: String(quarto), tentativas: 2, acertos: 2, erros: 0, percentualAcertos: 100, tarefasConcluidas: 2 },
    { comodoId: String(cozinha), tentativas: 1, acertos: 0, erros: 1, percentualAcertos: 0, tarefasConcluidas: 0 },
  ]));
});

test("#58 HTTP: contagens e percentuais por cômodo, com arredondamento e extremos", async (t) => {
  const j = await prepararHttp(t);
  const comodos = [id(), id(), id(), id()];
  const resultados = [[true, true, false], [true, false, false], [true, true], [false, false]];
  for (const [indice, respostas] of resultados.entries()) {
    for (const acertou of respostas) {
      j.tentativa({ comodoId: comodos[indice], acertou, pontuacaoGanha: acertou ? 1 : 0 });
    }
  }
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(ordenarComodos(res.dados.desempenhoPorComodo), ordenarComodos([
    { comodoId: String(comodos[0]), tentativas: 3, acertos: 2, erros: 1, percentualAcertos: 66.67, tarefasConcluidas: 2 },
    { comodoId: String(comodos[1]), tentativas: 3, acertos: 1, erros: 2, percentualAcertos: 33.33, tarefasConcluidas: 1 },
    { comodoId: String(comodos[2]), tentativas: 2, acertos: 2, erros: 0, percentualAcertos: 100, tarefasConcluidas: 2 },
    { comodoId: String(comodos[3]), tentativas: 2, acertos: 0, erros: 2, percentualAcertos: 0, tarefasConcluidas: 0 },
  ]));
});

test("#58 HTTP: tarefas distintas por cômodo não duplicam acertos repetidos", async (t) => {
  const j = await prepararHttp(t);
  const quarto = id();
  const cozinha = id();
  const tarefa = id();
  j.tentativa({ comodoId: quarto, tarefaId: tarefa });
  j.tentativa({ comodoId: quarto, tarefaId: id(String(tarefa)), tentativa: 2, dificuldade: "dificil" });
  j.tentativa({ comodoId: quarto, tarefaId: id(), acertou: false, pontuacaoGanha: 0 });
  j.tentativa({ comodoId: quarto, tarefaId: id() });
  // Exercita a independência dos Sets: o mesmo ID pode ser contado em cada
  // grupo, mas apenas uma vez no resumo geral (fixture sintética).
  j.tentativa({ comodoId: cozinha, tarefaId: id(String(tarefa)) });
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(ordenarComodos(res.dados.desempenhoPorComodo), ordenarComodos([
    { comodoId: String(quarto), tentativas: 4, acertos: 3, erros: 1, percentualAcertos: 75, tarefasConcluidas: 2 },
    { comodoId: String(cozinha), tentativas: 1, acertos: 1, erros: 0, percentualAcertos: 100, tarefasConcluidas: 1 },
  ]));
  assert.equal(res.dados.resumo.tarefasConcluidas, 2);
  assert.equal(res.dados.resumo.totalTentativas, 5);
});

test("#58 HTTP: registros sem comodoId não entram nos grupos e permanecem no resumo geral", async (t) => {
  const j = await prepararHttp(t);
  const comodoId = id();
  j.tentativa({ comodoId, pontuacaoGanha: 2 });
  j.tentativa({ comodoId: null, pontuacaoGanha: 3 });
  const semCampo = j.tentativa({ acertou: false, pontuacaoGanha: 0, dataHora: new Date("2026-01-09T10:00:00.000Z") });
  delete semCampo.comodoId;
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(res.dados.desempenhoPorComodo, [{
    comodoId: String(comodoId), tentativas: 1, acertos: 1, erros: 0,
    percentualAcertos: 100, tarefasConcluidas: 1,
  }]);
  assert.deepEqual(res.dados.resumo, {
    totalTentativas: 3, acertos: 2, erros: 1, percentualAcertos: 66.67,
    totalEstrelas: 5, tarefasConcluidas: 2, ultimaInteracao: "2026-01-09T10:00:00.000Z",
  });
});

test("#58 HTTP: histórico apenas sem comodoId retorna grupos vazios sem erro", async (t) => {
  const j = await prepararHttp(t);
  j.tentativa({ comodoId: undefined, pontuacaoGanha: 3 });
  j.tentativa({ comodoId: null, acertou: false, pontuacaoGanha: 0 });
  const res = await j.consultar();
  assert.equal(res.status, 200);
  assert.deepEqual(res.dados.desempenhoPorComodo, []);
  assert.deepEqual(res.dados.resumo, {
    totalTentativas: 2, acertos: 1, erros: 1, percentualAcertos: 50,
    totalEstrelas: 3, tarefasConcluidas: 1, ultimaInteracao: "2026-01-01T10:00:00.000Z",
  });
});

test("#58 unitário: agrupamento preserva resumo geral e documentos de várias partidas", async (t) => {
  const j = prepararResumo(t);
  const quarto = id();
  const cozinha = id();
  const tarefa = id();
  j.tentativa({ comodoId: quarto, tarefaId: tarefa, pontuacaoGanha: 3 });
  j.tentativa({ comodoId: quarto, tarefaId: id(String(tarefa)), pontuacaoGanha: 2 });
  j.tentativa({ comodoId: quarto, acertou: false, pontuacaoGanha: 0 });
  j.tentativa({ comodoId: cozinha, pontuacaoGanha: 1, dataHora: new Date("2026-01-09T10:00:00.000Z") });
  j.tentativa({ comodoId: cozinha, acertou: false, pontuacaoGanha: 0 });
  const antes = j.dados.get(Historico).map((doc) => ({ ...doc }));
  const res = await consultarResumoDesempenho(String(j.crianca.usuarioId), j.usuario);
  assert.deepEqual(res.resumo, {
    totalTentativas: 5, acertos: 3, erros: 2, percentualAcertos: 60,
    totalEstrelas: 6, tarefasConcluidas: 2, ultimaInteracao: new Date("2026-01-09T10:00:00.000Z"),
  });
  assert.deepEqual(ordenarComodos(res.desempenhoPorComodo), ordenarComodos([
    { comodoId: String(quarto), tentativas: 3, acertos: 2, erros: 1, percentualAcertos: 66.67, tarefasConcluidas: 1 },
    { comodoId: String(cozinha), tentativas: 2, acertos: 1, erros: 1, percentualAcertos: 50, tarefasConcluidas: 1 },
  ]));
  assert.deepEqual(j.dados.get(Historico), antes);
  assert.ok(j.consultas.every((q) => ["find", "findOne"].includes(q.operacao)));
});
