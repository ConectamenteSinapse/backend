import assert from "node:assert/strict";
import { consultarProgressoJogo } from "../../services/progressoService.js";
import { verificarDificuldadeConcluida, verificarComodoDesbloqueado } from "../../services/validarProgressaoService.js";

export const dificuldades = ["facil", "medio", "dificil"];
export const instanteEstado = i => new Date(Date.parse("2026-10-29T15:00:00Z") + i * 1000);
export const registrosNivel = (comodo, niveis = dificuldades, tarefas = [0, 1], acertou = true) =>
  niveis.flatMap(d => tarefas.map(t => [comodo, t, d, acertou]));
export const inicial = ["disponivel", "bloqueado", "bloqueado", "bloqueado", "bloqueado"];
const primeiroConcluido = ["concluido", "disponivel", "bloqueado", "bloqueado", "bloqueado"];
const primeiro = registrosNivel(0);

// Oráculos literais, independentes dos helpers usados pela produção.
export const casosEstados = [
  { nome: "partida nova: primeiro disponível e posteriores bloqueados", estados: inicial, compararService: true },
  { nome: "acerto parcial mantém cômodo disponível", registros: [[0, 0, "facil", true]], estados: inicial },
  { nome: "somente fácil completo não conclui cômodo", registros: registrosNivel(0, ["facil"]), estados: inicial },
  { nome: "fácil e médio completos não concluem cômodo", registros: registrosNivel(0, ["facil", "medio"]), estados: inicial },
  { nome: "última tarefa do difícil pendente mantém cômodo disponível",
    registros: [...registrosNivel(0, ["facil", "medio"]), [0, 0, "dificil", true]], estados: inicial },
  { nome: "três níveis concluem primeiro cômodo e liberam segundo", registros: primeiro, estados: primeiroConcluido },
  { nome: "dois cômodos completos liberam o terceiro", registros: [...primeiro, ...registrosNivel(1)],
    estados: ["concluido", "concluido", "disponivel", "bloqueado", "bloqueado"] },
  { nome: "erros nos três níveis não concluem tarefas", registros: registrosNivel(0, dificuldades, [0, 1], false), estados: inicial },
  { nome: "acertos repetidos na mesma tarefa não substituem as demais",
    registros: Array.from({ length: 3 }, () => [0, 0, "facil", true]), estados: inicial },
  { nome: "repetição e erro posterior não desfazem conclusão",
    registros: [...primeiro, [0, 0, "facil", true], [0, 0, "facil", false]], estados: primeiroConcluido },
  { nome: "histórico de outra partida não interfere", outraPartida: primeiro, estados: inicial },
  { nome: "histórico de outra criança não interfere", outraCrianca: primeiro, estados: inicial },
  { nome: "dificuldades divididas entre partidas não são combinadas",
    registros: registrosNivel(0, ["facil", "medio"]), outraPartida: registrosNivel(0, ["dificil"]), estados: inicial },
  { nome: "cômodo inativo anterior não aparece nem bloqueia", inativoAntes: true, registros: primeiro, estados: primeiroConcluido },
  { nome: "tarefa inativa não é exigida nos três níveis", desativar: [[0, 1]],
    registros: registrosNivel(0, dificuldades, [0]), estados: primeiroConcluido },
  { nome: "só tarefas inativas não concluem cômodo mesmo com acertos antigos", desativar: [[0, 0], [0, 1]],
    registros: primeiro, estados: inicial },
  { nome: "cômodo vazio inicial disponível bloqueia os seguintes", vazioAntes: true,
    estados: ["bloqueado", "bloqueado", "bloqueado", "disponivel", "bloqueado"] },
  { nome: "cômodo inicial só com tarefas inativas permanece disponível", soInativasAntes: true,
    estados: ["bloqueado", "bloqueado", "bloqueado", "bloqueado", "disponivel"] },
  { nome: "vazio após cômodos completos não é concluído nem libera seu sucessor",
    registros: [...primeiro, ...registrosNivel(1), ...registrosNivel(2)],
    estados: ["concluido", "concluido", "concluido", "disponivel", "bloqueado"] },
  { nome: "ordem do catálogo prevalece sobre inserção e identificador", reordenar: true,
    estados: ["bloqueado", "disponivel", "bloqueado", "bloqueado", "bloqueado"] },
  { nome: "resumo, tarefas, datas e estrelas preservam contrato anterior", compararService: true, metricas: true,
    registros: [[0, 0, "facil", false], [0, 0, "facil", true], [0, 1, "facil", true]], estados: inicial },
];

export async function prepararCasoEstados(h, f, caso) {
  const base = f.comodos[0].ordem;
  if (caso.inativoAntes) await h.mudarComodo(f, 3, { ordem: base - 1 });
  if (caso.vazioAntes) await h.mudarComodo(f, 4, { ordem: base - 1 });
  if (caso.soInativasAntes) await h.mudarComodo(f, 5, { ordem: base - 1 });
  if (caso.reordenar) for (const [i, deslocamento] of [[0, 2], [1, 0], [2, 1]])
    await h.mudarComodo(f, i, { ordem: base + deslocamento });
  for (const [c, t] of caso.desativar ?? []) await h.mudarTarefa(f, c, t, { ativo: false });
  await h.historicos(f, caso.registros ?? []);
  if (caso.outraPartida) await h.historicos(await h.outraPartida(f), caso.outraPartida);
  if (caso.outraCrianca) await h.historicos(await h.outraCrianca(f), caso.outraCrianca);
}

export async function conferirEstados(h, f, caso) {
  const antes = await h.estado(f);
  const res = await h.http(f);
  assert.equal(res.status, 200);
  const dados = res.dados;
  assert.deepEqual(Object.keys(dados).sort(), ["comodos", "estrelasTotal", "jogoSalvoId", "resumo", "tarefas"]);
  assert.equal(dados.jogoSalvoId, String(f.jogo._id));
  assert.equal(dados.estrelasTotal, antes.jogo.estrelasTotal);
  assert.deepEqual(dados.comodos.map(c => c.comodoId), (await h.catalogoAtivo()).map(c => String(c._id)),
    "Inclui todos os ativos, na ordem, sem modificar o catálogo preexistente");
  const indices = [0, 1, 2, 4, 5];
  for (const [posicao, i] of indices.entries()) {
    const comodo = f.comodos[i], item = dados.comodos.find(c => c.comodoId === String(comodo._id));
    assert.deepEqual(item, { comodoId: String(comodo._id), nome: comodo.nome, estado: caso.estados[posicao] });
    const liberado = await verificarComodoDesbloqueado(f.jogo._id, comodo);
    assert.equal(item.estado !== "bloqueado", liberado, "Estado deve concordar com o desbloqueio real");
    const concluidas = await Promise.all(dificuldades.map(d => verificarDificuldadeConcluida(f.jogo._id, comodo._id, d)));
    assert.equal(item.estado === "concluido", concluidas.every(Boolean));
  }
  assert.ok(!dados.comodos.some(c => c.comodoId === String(f.comodos[3]._id)));
  if (!(caso.registros?.length)) {
    assert.deepEqual(dados.resumo, { totalTentativas: 0, acertos: 0, erros: 0, tarefasConcluidas: 0, ultimaInteracao: null });
    assert.deepEqual(dados.tarefas, []);
  }
  if (caso.metricas) {
    assert.equal(dados.estrelasTotal, 2);
    assert.deepEqual(dados.resumo, { totalTentativas: 3, acertos: 2, erros: 1, tarefasConcluidas: 2,
      ultimaInteracao: instanteEstado(2).toISOString() });
    assert.deepEqual(dados.tarefas, [
      { tarefaId: String(f.tarefas[0][1]._id), dificuldade: "facil", concluida: true, tentativas: 1,
        acertos: 1, erros: 0, ultimaInteracao: instanteEstado(2).toISOString() },
      { tarefaId: String(f.tarefas[0][0]._id), dificuldade: "facil", concluida: true, tentativas: 2,
        acertos: 1, erros: 1, ultimaInteracao: instanteEstado(1).toISOString() },
    ]);
  }
  if (caso.compararService) assert.deepEqual(dados,
    JSON.parse(JSON.stringify(await consultarProgressoJogo(f.usuarioId, f.jogo._id))));
  assert.deepEqual(await h.estado(f), antes, "Consultar progresso não altera documentos ou consumo");
  return dados;
}

export async function conferirAcessoEstados(t, h, f) {
  for (const [nome, alvo, auth, status] of [
    ["sem JWT", f.jogo._id, null, 401],
    ["responsável", f.jogo._id, { perfil: "responsavel" }, 403],
    ["outra criança", f.jogo._id, { id: "111111111111111111111111" }, 404],
    ["ID inválido", "invalido", undefined, 400],
    ["partida inexistente", "222222222222222222222222", undefined, 404],
  ]) await t.test(nome, async () => {
    const antes = await h.estado(f), res = await h.http(f, alvo, auth);
    assert.equal(res.status, status); assert.equal(res.dados.erro, true);
    assert.deepEqual(await h.estado(f), antes);
  });
}
