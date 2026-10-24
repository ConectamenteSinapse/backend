import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Crianca from "../../models/criancaModel.js";
import Responsavel from "../../models/responsavelModel.js";
import Historico from "../../models/historicoJogoModel.js";
import criancaRoutes from "../../routes/criancaRoutes.js";

export const id = (valor) => new mongoose.Types.ObjectId(valor);

// Somente a execução das queries é simulada. Router, JWT, autorização,
// Controller e cálculos do Service são os de produção. Não importa index.js.
export function prepararResumo(t) {
  const segredo = randomUUID();
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = segredo;
  t.after(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  for (const metodo of ["connect", "createConnection"]) {
    t.mock.method(mongoose, metodo, () => {
      assert.fail("Conexão MongoDB proibida nesta suíte");
    });
  }
  const responsavel = { _id: id(), usuarioId: id() };
  const outroResponsavel = { _id: id(), usuarioId: id() };
  const crianca = { _id: id(), usuarioId: id(), responsavelId: responsavel._id };
  const outraCrianca = { _id: id(), usuarioId: id(), responsavelId: outroResponsavel._id };
  const dados = new Map([
    [Crianca, [crianca, outraCrianca]],
    [Responsavel, [responsavel, outroResponsavel]],
    [Historico, []],
  ]);
  const consultas = [];
  const estado = { falharModelo: null };
  const erroInterno = new Error("Falha fictícia interna: host=db-interno; senha=segredo-ficticio");
  const logs = t.mock.method(console, "error", () => {});
  t.mock.method(mongoose.Query.prototype, "exec", async function () {
    const filtro = this.getFilter();
    const opcoes = this.getOptions();
    consultas.push({ model: this.model, operacao: this.op, filtro, opcoes, lean: this.mongooseOptions().lean });
    assert.ok(dados.has(this.model), "Consulta inesperada a outro Model");
    assert.ok(["find", "findOne"].includes(this.op), "Somente leituras são permitidas");
    if (estado.falharModelo === this.model) throw erroInterno;
    let linhas = dados.get(this.model).filter((doc) =>
      Object.entries(filtro).every(([campo, valor]) => String(doc[campo]) === String(valor)),
    );
    if (opcoes.sort) {
      linhas = [...linhas].sort((a, b) => {
        for (const [campo, direcao] of Object.entries(opcoes.sort)) {
          if (a[campo] < b[campo]) return -direcao;
          if (a[campo] > b[campo]) return direcao;
        }
        return 0;
      });
    }
    return this.op === "findOne" ? (linhas[0] ?? null) : linhas;
  });

  function tentativa(valores = {}) {
    const registro = {
      _id: id(), criancaId: crianca._id, perfilJogoId: id(),
      jogoSalvoId: id(), comodoId: id(), tarefaId: id(), respostaEscolhidaId: id(),
      acertou: true, tentativa: 1, pontuacaoGanha: 1, dificuldade: "facil",
      dataHora: new Date("2026-01-01T10:00:00.000Z"), ...valores,
    };
    dados.get(Historico).push(registro);
    return registro;
  }

  async function iniciarHttp() {
    const app = express();
    app.use("/criancas", criancaRoutes);
    const server = app.listen(0, "127.0.0.1");
    t.after(async () => {
      await new Promise((resolve, reject) => {
        server.close((erro) => erro ? reject(erro) : resolve());
        server.closeAllConnections();
      });
    });
    await once(server, "listening");
    return async (criancaId = crianca.usuarioId, usuario = { id: String(crianca.usuarioId), perfil: "crianca" }, authorization) => {
      const headers = {};
      if (authorization !== undefined) headers.authorization = authorization;
      else if (usuario !== null) headers.authorization = `Bearer ${jwt.sign(usuario, segredo, { expiresIn: "5m" })}`;
      const resposta = await fetch(`http://127.0.0.1:${server.address().port}/criancas/${criancaId}/resumo-desempenho`, { headers });
      assert.match(resposta.headers.get("content-type"), /application\/json/);
      return { status: resposta.status, dados: await resposta.json() };
    };
  }
  return {
    crianca, outraCrianca, responsavel, outroResponsavel, dados, consultas,
    estado, erroInterno, logs, tentativa, iniciarHttp,
    usuario: { id: String(crianca.usuarioId), perfil: "crianca" },
  };
}

export { Crianca, Responsavel, Historico };
