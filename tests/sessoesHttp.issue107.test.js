import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { dadosSessaoHttp, cenariosSessoesHttp } from "./helpers/sessoesHttpIssue107.js";

test("#107 HTTP: Router real, JWT, autorização, sessões e regressão de jogos salvos", async t => {
  // Importação real antes das fixtures: erros de ligação ESM são falhas de
  // bootstrap, não devem ser escondidos por mocks ou substituição de imports.
  await import("../routes/jogoSalvoRoutes.js");
  const { preparar, Crianca, Perfil, Jogo, id } = await import("./helpers/jogoSalvoMock.js");
  async function fixture(s, extras) {
    const j = await preparar(s);
    Object.assign(j.dados.get(Crianca).get(String(j.crianca._id)), dadosSessaoHttp(extras));
    const original = mongoose.Query.prototype.exec;
    s.mock.method(mongoose.Query.prototype, "exec", async function () {
      if (this.model !== Crianca || this.op !== "findOneAndUpdate") return original.call(this);
      const filtro = this.getFilter(), update = this.getUpdate();
      const doc = j.dados.get(Crianca).get(String(filtro._id));
      if (!doc) return null;
      const versao = filtro.$or ? 0 : filtro.sessaoJogoVersao;
      if (versao !== (doc.sessaoJogoVersao ?? 0)) return null;
      if (filtro.sessaoJogoId !== undefined && filtro.sessaoJogoId !== doc.sessaoJogoId) return null;
      if (filtro.sessaoJogoEstado !== undefined && filtro.sessaoJogoEstado !== doc.sessaoJogoEstado) return null;
      assert.deepEqual(this.getOptions(), { new: true, runValidators: true });
      Object.assign(doc, update.$set);
      doc.sessaoJogoVersao = (doc.sessaoJogoVersao ?? 0) + update.$inc.sessaoJogoVersao;
      return Crianca.hydrate(doc);
    });
    return { j, usuarioId: j.usuarioId, crianca: j.crianca, perfil: j.perfil, jogo: j.novaPartida() };
  }
  await cenariosSessoesHttp(t, {
    fixture,
    outra: async (s, f) => {
      const crianca = f.j.inserir(Crianca, { usuarioId: id(), ...dadosSessaoHttp() });
      const perfil = f.j.inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "Outra", imagemAvatar: "outra.png" });
      const jogo = f.j.inserir(Jogo, { perfilJogoId: perfil._id, nomeJogo: "Outra" });
      return { ...f, crianca, perfil, jogo, usuarioId: crianca.usuarioId };
    },
    ler: async f => JSON.parse(JSON.stringify(f.j.dados.get(Crianca).get(String(f.crianca._id)))),
    request: (f, metodo, caminho, body, auth) => f.j.chamar(metodo, caminho, body,
      auth === null ? null : typeof auth === "string" ? auth
        : `Bearer ${f.j.token({ id: String(f.usuarioId), ...(auth ?? {}) })}`),
    conflitar: (s, f) => {
      const chamada = s.mock.method(Crianca, "findOneAndUpdate", async () => null);
      return () => chamada.mock.callCount();
    },
  });
});
