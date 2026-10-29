import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import responsavelRoutes from "../../routes/responsavelRoutes.js";

export const id = () => new mongoose.Types.ObjectId();
export const serializar = (valor) => JSON.parse(JSON.stringify(valor));
export const invalidos = [
  ["negativo", { limiteTempoDiario: -1 }],
  ["zero", { limiteTempoDiario: 0 }],
  ["fracionário", { limiteTempoDiario: 1.5 }],
  ["string numérica", { limiteTempoDiario: "30" }],
  ["string vazia", { limiteTempoDiario: "" }],
  ["string textual", { limiteTempoDiario: "trinta" }],
  ["campo ausente", {}],
  ["booleano", { limiteTempoDiario: true }],
  ["objeto", { limiteTempoDiario: {} }],
  ["array", { limiteTempoDiario: [30] }],
];
export const idsInvalidos = ["invalido", "123", "z".repeat(24)];
export const erroLimite = {
  erro: true,
  mensagem: "O limite diário deve ser um número inteiro positivo ou null",
};

// Mesmo Router, JWT, Controller e Service em ambas as suítes. Sem index.js/.env.
export async function iniciarHttp(t, usuarioId, criancaId) {
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
      server.close((erro) => erro ? reject(erro) : resolve());
      server.closeAllConnections();
    });
  });
  await once(server, "listening");
  return async (body, {
    alvo = criancaId,
    usuario = { id: String(usuarioId), perfil: "responsavel" },
  } = {}) => {
    const headers = {};
    if (usuario !== null) {
      headers.authorization = `Bearer ${jwt.sign(usuario, segredo, { expiresIn: "5m" })}`;
    }
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/responsaveis/minhas-criancas/${alvo}/limite-tempo`,
      { method: "PATCH", headers, body: body === undefined ? undefined : JSON.stringify(body) },
    );
    assert.match(res.headers.get("content-type"), /application\/json/);
    return { status: res.status, dados: await res.json() };
  };
}
