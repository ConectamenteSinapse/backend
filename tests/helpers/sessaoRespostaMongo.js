import assert from "node:assert/strict";
import mongoose from "mongoose";
import Crianca from "../../models/criancaModel.js";
import { iniciarSessaoJogo, renovarSessaoJogo, encerrarSessaoJogo } from "../../services/tempoJogoService.js";
import { confirmarModels } from "./atlasSeguro.js";

// Preparação das fixtures, fora das respostas concorrentes e dos snapshots
// de rejeição. Usa o ciclo real, inclusive ao trocar a partida da criança.
export async function garantirSessaoResposta(usuarioId, jogoId) {
  confirmarModels(mongoose.connection, [Crianca]);
  const crianca = await Crianca.findOne({ usuarioId });
  assert.ok(crianca);
  if (crianca.sessaoJogoEstado === "ativa" && crianca.sessaoJogoExpiraEm > new Date()) {
    if (String(crianca.sessaoJogoSalvoId) === String(jogoId)) {
      if (crianca.sessaoJogoExpiraEm.getTime() - Date.now() < 5000)
        await renovarSessaoJogo(usuarioId, crianca.sessaoJogoId);
      return crianca.sessaoJogoId;
    }
    await encerrarSessaoJogo(usuarioId, crianca.sessaoJogoId);
  }
  return (await iniciarSessaoJogo(usuarioId, jogoId)).sessaoId;
}

// A autorização continua sem criar tentativa ou estrelas. O contrato novo
// exige confirmar o consumo e encerrar a sessão; compara todo o estado e
// permite APENAS essas alterações, com valores esperados independentes.
export async function conferirBloqueioPermissao(t, estado, criancaId, responder) {
  const antes = await estado(), esperado = structuredClone(antes);
  const alvo = esperado.Crianca.find(d => String(d._id) === String(criancaId));
  assert.ok(alvo); assert.equal(alvo.permissaoAtiva, false); assert.equal(alvo.sessaoJogoEstado, "ativa");
  const origem = new Date(alvo.sessaoJogoContabilizadoEm), agora = new Date(origem.getTime() + 1000);
  assert.ok(agora < new Date(alvo.sessaoJogoExpiraEm));
  t.mock.timers.enable({ apis: ["Date"], now: agora });
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const inicioDia = Date.parse(`${dia}T00:00:00-03:00`);
  alvo.tempoUsadoHoje = (alvo.dataReferenciaTempo === dia ? alvo.tempoUsadoHoje ?? 0 : 0)
    + (agora.getTime() - Math.max(origem.getTime(), inicioDia)) / 1000;
  alvo.dataReferenciaTempo = dia;
  alvo.sessaoJogoContabilizadoEm = agora.toISOString();
  alvo.sessaoJogoVersao = (alvo.sessaoJogoVersao ?? 0) + 1;
  alvo.sessaoJogoEstado = "encerrada"; alvo.sessaoJogoExpiraEm = null;
  const res = await responder();
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { erro: true, mensagem: "Permissão para jogar inativa" });
  assert.deepEqual(await estado(), esperado, "Bloqueio de permissão só pode confirmar consumo e encerramento");
}
