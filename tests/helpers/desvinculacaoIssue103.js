import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import responsavelRoutes from "../../routes/responsavelRoutes.js";

export const id = () => new mongoose.Types.ObjectId();
export const serializar = (valor) => JSON.parse(JSON.stringify(valor));
export const erroVinculo = {
  erro: true, mensagem: "Criança não encontrada entre as contas vinculadas",
};
export const idsInvalidos = ["invalido", "123", "z".repeat(24)];
export const dadosCrianca = (usuarioId, responsavelId, extras = {}) => ({
  usuarioId, responsavelId, permissaoAtiva: true, limiteTempoDiario: 45,
  tempoUsadoHoje: 12, dataNascimento: new Date("2018-05-10T00:00:00Z"),
  criadoEm: new Date("2026-01-01T00:00:00Z"), ...extras,
});

// HTTP real, sem index.js ou carregamento automático de .env.
export async function iniciarHttp(t, usuarioId) {
  const anterior = process.env.JWT_SECRET;
  const segredo = randomUUID();
  process.env.JWT_SECRET = segredo;
  t.after(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  const app = express();
  app.use(express.json());
  app.use("/responsaveis", responsavelRoutes);
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(erro => erro ? reject(erro) : resolve());
      server.closeAllConnections();
    });
  });
  await once(server, "listening");
  async function requisitar(method, caminho, {
    usuario = { id: String(usuarioId), perfil: "responsavel" }, body,
  } = {}) {
    const headers = {};
    if (usuario !== null) headers.authorization = `Bearer ${jwt.sign(usuario, segredo, { expiresIn: "5m" })}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const resposta = await fetch(`http://127.0.0.1:${server.address().port}/responsaveis${caminho}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.match(resposta.headers.get("content-type"), /application\/json/);
    return { status: resposta.status, dados: await resposta.json() };
  }
  return {
    desvincular: (alvo, opcoes) => requisitar("DELETE", `/minhas-criancas/${alvo}/vinculo`, opcoes),
    listar: (opcoes) => requisitar("GET", "/minhas-criancas", opcoes),
  };
}
