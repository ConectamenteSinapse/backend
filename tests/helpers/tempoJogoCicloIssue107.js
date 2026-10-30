import assert from "node:assert/strict";

// Fixtures e oráculos literais compartilhados entre execução simulada e real.
// Nenhum cálculo do Service é reproduzido para produzir os valores esperados.
export const instante = ms => new Date(Date.parse("2026-10-29T15:00:00Z") + ms);
export const baseCiclo = extras => ({ permissaoAtiva: true, limiteTempoDiario: 1,
  tempoUsadoHoje: 12, dataReferenciaTempo: "2026-10-29", sessaoJogoEstado: "ativa",
  sessaoJogoId: "sessao-ciclo-107", sessaoJogoVersao: 0,
  sessaoJogoContabilizadoEm: instante(0), sessaoJogoExpiraEm: instante(30000), ...extras });

export const casosCiclo = [
  { nome: "heartbeat após 10 segundos", op: "renovar", ms: 10000,
    esperado: { tempoUsadoHoje: 22, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoExpiraEm: instante(40000) } },
  { nome: "heartbeat no mesmo instante não acrescenta consumo", op: "renovar", ms: 0,
    esperado: { tempoUsadoHoje: 12, sessaoJogoContabilizadoEm: instante(0), sessaoJogoExpiraEm: instante(30000) } },
  { nome: "heartbeat com saldo de cinco segundos", op: "renovar", ms: 10000, entrada: { tempoUsadoHoje: 45 },
    esperado: { tempoUsadoHoje: 55, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoExpiraEm: instante(15000) } },
  { nome: "heartbeat com limite null", op: "renovar", ms: 10000, entrada: { limiteTempoDiario: null, tempoUsadoHoje: 9000 },
    esperado: { tempoUsadoHoje: 9010, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoExpiraEm: instante(40000) } },
  { nome: "heartbeat expirado após 31 segundos", op: "renovar", ms: 31000, erro: "SESSAO_EXPIRADA",
    esperado: { tempoUsadoHoje: 42, sessaoJogoContabilizadoEm: instante(30000), sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null } },
  { nome: "heartbeat exatamente na expiração", op: "renovar", ms: 30000, erro: "SESSAO_EXPIRADA",
    esperado: { tempoUsadoHoje: 42, sessaoJogoContabilizadoEm: instante(30000), sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null } },
  { nome: "limite alcançado antes da validade antiga", op: "renovar", ms: 10000, entrada: { tempoUsadoHoje: 50 }, erro: "LIMITE_TEMPO_ATINGIDO",
    esperado: { tempoUsadoHoje: 60, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null } },
  { nome: "saldo reduzido enquanto sessão estava válida", op: "renovar", ms: 10000, entrada: { tempoUsadoHoje: 55 }, erro: "LIMITE_TEMPO_ATINGIDO",
    esperado: { tempoUsadoHoje: 65, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null } },
  { nome: "expiração e limite simultâneos encerram, com precedência de SESSAO_EXPIRADA", op: "renovar", ms: 5000,
    entrada: { tempoUsadoHoje: 55, sessaoJogoExpiraEm: instante(5000) }, erro: "SESSAO_EXPIRADA",
    esperado: { tempoUsadoHoje: 60, sessaoJogoContabilizadoEm: instante(5000), sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null } },
  { nome: "permissão revogada contabiliza e encerra", op: "renovar", ms: 10000, entrada: { permissaoAtiva: false }, erro: "PERMISSAO_INATIVA",
    esperado: { tempoUsadoHoje: 22, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null } },
  { nome: "heartbeat na virada de São Paulo", op: "renovar", agora: new Date("2026-10-30T03:00:10Z"),
    entrada: { tempoUsadoHoje: 600, sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"), sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z") },
    esperado: { tempoUsadoHoje: 10, dataReferenciaTempo: "2026-10-30", sessaoJogoContabilizadoEm: new Date("2026-10-30T03:00:10Z"), sessaoJogoExpiraEm: new Date("2026-10-30T03:00:40Z") } },
  { nome: "heartbeat após expiração que atravessou meia-noite", op: "renovar", agora: new Date("2026-10-30T04:00:00Z"),
    entrada: { tempoUsadoHoje: 600, sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"), sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z") }, erro: "SESSAO_EXPIRADA",
    esperado: { tempoUsadoHoje: 20, dataReferenciaTempo: "2026-10-30", sessaoJogoContabilizadoEm: new Date("2026-10-30T03:00:20Z"), sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null } },
];
for (const [op, estado] of [["pausar", "pausada"], ["encerrar", "encerrada"]]) {
  casosCiclo.push(
    { nome: `${op} aos dez segundos`, op, ms: 10000,
      esperado: { tempoUsadoHoje: 22, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoEstado: estado, sessaoJogoExpiraEm: null } },
    { nome: `${op} muito após expiração`, op, ms: 3600000,
      esperado: { tempoUsadoHoje: 42, sessaoJogoContabilizadoEm: instante(30000), sessaoJogoEstado: estado, sessaoJogoExpiraEm: null } },
    { nome: `${op} com permissão revogada ainda permite interromper`, op, ms: 10000, entrada: { permissaoAtiva: false },
      esperado: { tempoUsadoHoje: 22, sessaoJogoContabilizadoEm: instante(10000), sessaoJogoEstado: estado, sessaoJogoExpiraEm: null } },
    { nome: `${op} após meia-noite e expiração`, op, agora: new Date("2026-10-30T04:00:00Z"),
      entrada: { tempoUsadoHoje: 600, sessaoJogoContabilizadoEm: new Date("2026-10-30T02:59:50Z"), sessaoJogoExpiraEm: new Date("2026-10-30T03:00:20Z") },
      esperado: { tempoUsadoHoje: 20, dataReferenciaTempo: "2026-10-30", sessaoJogoContabilizadoEm: new Date("2026-10-30T03:00:20Z"), sessaoJogoEstado: estado, sessaoJogoExpiraEm: null } },
    { nome: `${op} com milissegundos`, op, ms: 1250,
      esperado: { tempoUsadoHoje: 13.25, sessaoJogoContabilizadoEm: instante(1250), sessaoJogoEstado: estado, sessaoJogoExpiraEm: null } },
  );
}
for (const op of ["renovar", "pausar", "encerrar"]) {
  for (const estado of ["pausada", "encerrada"]) casosCiclo.push({
    nome: `${op} sessão ${estado}: sem escrita`, op, ms: 10000,
    entrada: { sessaoJogoEstado: estado }, erro: "SESSAO_INATIVA", grava: false,
  });
  casosCiclo.push({ nome: `${op} identificador antigo: sem escrita`, op, ms: 10000,
    sessaoId: "sessao-anterior", erro: "SESSAO_INVALIDA", grava: false });
}
for (const valor of [undefined, null, "data-invalida"]) casosCiclo.push({
  nome: `heartbeat com expiração ${String(valor)}`, op: "renovar", ms: 10000,
  entrada: { sessaoJogoExpiraEm: valor }, erro: "SESSAO_EXPIRADA",
  esperado: { tempoUsadoHoje: 12, sessaoJogoEstado: "encerrada", sessaoJogoExpiraEm: null },
});
for (const [op, estado] of [["pausar", "pausada"], ["encerrar", "encerrada"]]) {
  for (const campo of ["sessaoJogoContabilizadoEm", "sessaoJogoExpiraEm"]) {
    for (const valor of [undefined, null, "data-invalida"]) casosCiclo.push({
      nome: `${op} com ${campo} ${String(valor)} interrompe sem inventar consumo`, op, ms: 10000,
      entrada: { [campo]: valor }, esperado: { tempoUsadoHoje: 12,
        sessaoJogoEstado: estado, sessaoJogoExpiraEm: null,
        ...(campo === "sessaoJogoContabilizadoEm" && valor === undefined ? { sessaoJogoContabilizadoEm: null } : {}),
      },
    });
  }
}

export function conferirCiclo(antes, depois, caso, resultado) {
  const esperado = caso.grava === false ? antes : { ...antes, ...caso.esperado, sessaoJogoVersao: (antes.sessaoJogoVersao ?? 0) + 1 };
  assert.deepEqual(depois, esperado, "Documento completo deve preservar campos não envolvidos");
  assert.ok(Number.isFinite(depois.tempoUsadoHoje));
  if (!caso.erro) {
    const retorno = { sessaoId: depois.sessaoJogoId, estado: depois.sessaoJogoEstado,
      tempoUsadoHoje: depois.tempoUsadoHoje, limiteTempoDiario: depois.limiteTempoDiario };
    if (caso.op === "renovar") retorno.expiraEm = depois.sessaoJogoExpiraEm;
    assert.deepEqual(resultado, retorno);
  }
}
export const erroCiclo = mensagem => erro => { assert.equal(erro.message, mensagem); return true; };
