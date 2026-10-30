import assert from "node:assert/strict";
import { instante } from "./tempoJogoCicloIssue107.js";
export { instante };
export const dadosTempoResposta = extras => ({ permissaoAtiva: true, limiteTempoDiario: 1,
  tempoUsadoHoje: 12, dataReferenciaTempo: "2026-10-29", sessaoJogoVersao: 0,
  sessaoJogoEstado: "ativa", sessaoJogoContabilizadoEm: instante(0), sessaoJogoExpiraEm: instante(30000), ...extras });
export const casosRespostaTempo = [
  { nome: "acerto válido", total: 22, pontos: 1 },
  { nome: "erro válido preserva tentativa sem estrelas", correta: false, total: 22, pontos: 0 },
  { nome: "sessaoId ausente", semSessao: true, codigo: "SESSAO_INVALIDA", grava: false, transacoes: 0 },
  { nome: "identificador inexistente", sessaoId: "inexistente", codigo: "SESSAO_INVALIDA", grava: false },
  { nome: "sessão vinculada a outra partida", outraPartida: true, codigo: "SESSAO_INVALIDA", grava: false },
  { nome: "sessão pausada", entrada: { sessaoJogoEstado: "pausada" }, codigo: "SESSAO_INATIVA", grava: false },
  { nome: "sessão encerrada", entrada: { sessaoJogoEstado: "encerrada" }, codigo: "SESSAO_INATIVA", grava: false },
  { nome: "sessão expirada", agora: instante(40000), total: 42, marcador: instante(30000), codigo: "SESSAO_EXPIRADA" },
  { nome: "limite já esgotado", entrada: { tempoUsadoHoje: 60 }, total: 70, codigo: "LIMITE_TEMPO_ATINGIDO" },
  { nome: "pendência completa limite", entrada: { tempoUsadoHoje: 50 }, total: 60, codigo: "LIMITE_TEMPO_ATINGIDO" },
  { nome: "permissão revogada durante sessão", entrada: { permissaoAtiva: false }, total: 22, codigo: "PERMISSAO_INATIVA" },
  { nome: "limite null", entrada: { limiteTempoDiario: null, tempoUsadoHoje: 9000 }, total: 9010, pontos: 1 },
  { nome: "virada de São Paulo com sessão ainda válida", agora: new Date("2026-10-30T03:00:10Z"),
    entrada: { tempoUsadoHoje: 600, sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"), sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z") },
    dia: "2026-10-30", total: 10, pontos: 1 },
  { nome: "virada e expiração antes da primeira resposta", agora: new Date("2026-10-30T04:00:00Z"),
    entrada: { tempoUsadoHoje: 600, sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"), sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z") },
    dia: "2026-10-30", total: 20, marcador: new Date("2026-10-30T03:00:20Z"), codigo: "SESSAO_EXPIRADA" },
  { nome: "origem futura", entrada: { sessaoJogoContabilizadoEm: instante(20000) }, total: 12, marcador: instante(20000), codigo: "SESSAO_INVALIDA" },
  { nome: "progressão exige tarefa anterior", tarefa: "segunda", codigo: "TAREFA_FORA_DA_ORDEM", grava: false, transacoes: 0 },
  { nome: "médio exige fácil", dificuldade: "medio", codigo: "DIFICULDADE_BLOQUEADA", grava: false, transacoes: 0 },
  { nome: "cômodo seguinte exige três níveis", tarefa: "outroComodo", codigo: "COMODO_BLOQUEADO", grava: false, transacoes: 0 },
];
for (const campo of ["sessaoJogoContabilizadoEm", "sessaoJogoExpiraEm"]) {
  for (const valor of [undefined, null, "data-invalida"]) casosRespostaTempo.push({
    nome: `${campo} ${String(valor)}`, entrada: { [campo]: valor }, total: 12, codigo: "SESSAO_INVALIDA", semMarcadorConfiavel: true,
  });
}
export const erroRespostaTempo = codigo => codigo === "PERMISSAO_INATIVA"
  ? { erro: true, mensagem: "Permissão para jogar inativa" }
  : { erro: true, codigo, mensagem: codigo === "LIMITE_TEMPO_ATINGIDO" ? "O limite diário de jogo foi atingido"
    : codigo === "TAREFA_FORA_DA_ORDEM" ? "Vamos tentar outra atividade primeiro!"
    : codigo === "DIFICULDADE_BLOQUEADA" ? "Conclua a dificuldade anterior para continuar!"
    : codigo === "COMODO_BLOQUEADO" ? "Conclua o cômodo anterior para continuar!"
    : "A sessão de jogo não está disponível" };

export async function conferirRespostaTempo(h, f, caso) {
  const antes = await h.estado(f);
  const res = await h.responder(f);
  const depois = await h.estado(f);
  if (caso.codigo) {
    assert.deepEqual(res, { status: ["LIMITE_TEMPO_ATINGIDO", "PERMISSAO_INATIVA", "TAREFA_FORA_DA_ORDEM", "DIFICULDADE_BLOQUEADA", "COMODO_BLOQUEADO"].includes(caso.codigo) ? 403 : 409,
      dados: erroRespostaTempo(caso.codigo) });
    assert.deepEqual(depois.historicos, antes.historicos);
    assert.deepEqual(depois.jogo, antes.jogo);
    assert.deepEqual(depois.perfil, antes.perfil);
  } else {
    assert.deepEqual(res, { status: 201, dados: { acertou: caso.correta !== false, tentativa: 1,
      pontuacaoGanha: caso.pontos, dificuldade: "facil" } });
    assert.equal(depois.historicos.length, antes.historicos.length + 1);
    assert.equal(depois.historicos.at(-1).pontuacaoGanha, caso.pontos);
    assert.equal(depois.historicos.at(-1).acertou, caso.correta !== false);
    assert.equal(depois.jogo.estrelasTotal, antes.jogo.estrelasTotal + caso.pontos);
  }
  if (caso.grava === false) assert.deepEqual(depois.crianca, antes.crianca);
  else {
    assert.equal(depois.crianca.tempoUsadoHoje, caso.total);
    assert.ok(Number.isFinite(depois.crianca.tempoUsadoHoje));
    assert.equal(depois.crianca.dataReferenciaTempo, caso.dia ?? "2026-10-29");
    assert.equal(depois.crianca.sessaoJogoVersao, antes.crianca.sessaoJogoVersao + 1);
    assert.equal(depois.crianca.sessaoJogoEstado, caso.codigo ? "encerrada" : "ativa");
    assert.equal(depois.crianca.sessaoJogoExpiraEm, caso.codigo ? null : antes.crianca.sessaoJogoExpiraEm,
      "Responder não deve renovar a validade");
    if (!caso.semMarcadorConfiavel) assert.equal(depois.crianca.sessaoJogoContabilizadoEm,
      (caso.marcador ?? caso.agora ?? instante(10000)).toISOString());
  }
  for (const campo of ["_id", "usuarioId", "responsavelId", "limiteTempoDiario", "sessaoJogoId", "sessaoJogoSalvoId"])
    assert.deepEqual(depois.crianca[campo], antes.crianca[campo]);
}
