import test from "node:test";
import { opcoesTesteAtlas } from "./helpers/bancoTeste.js";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { prepararProgresso } from "./helpers/progresso.js";

const negado = {
  status: 403,
  dados: { mensagem: "Você não tem permissão para consultar este histórico" },
};

// A mesma preparação da issue #56 cria somente documentos fictícios,
// injeta a sessão nas leituras e aborta a transação ao encerrar.
test(
  "Consulta de histórico no Atlas (dados fictícios e transação descartada)",
  opcoesTesteAtlas,
  async (t) => {
    const jogo = await prepararProgresso(t);
    const usuarioId = String(jogo.usuarios[0]._id);
    const estadoInicial = await jogo.estado();
    const progressoInicial = await jogo.consultar();

    await t.test(
      "GET /criancas/:criancaId/historico retorna HTTP 200 com histórico",
      async () => {
        const { status, dados } = await jogo.consultarHistorico();
        assert.equal(status, 200);
        assert.equal(dados.criancaId, usuarioId);
        assert.equal(dados.totalTentativas, 5);
        assert.equal(dados.tentativas.length, 5);
      },
    );

    await t.test(
      "Criança sem tentativas retorna HTTP 200 com lista vazia",
      async () => {
        assert.deepEqual(
          await jogo.consultarHistorico(jogo.usuarios[1]._id, 1),
          {
            status: 200,
            dados: {
              criancaId: String(jogo.usuarios[1]._id),
              totalTentativas: 0,
              tentativas: [],
            },
          },
        );
      },
    );

    await t.test("ID inválido retorna HTTP 400", async () => {
      for (const id of ["invalido", "123", "z".repeat(24)]) {
        assert.deepEqual(await jogo.consultarHistorico(id), {
          status: 400,
          dados: { mensagem: "ID da criança inválido" },
        });
      }
    });

    await t.test("Criança inexistente retorna HTTP 404", async () => {
      assert.deepEqual(
        await jogo.consultarHistorico(new mongoose.Types.ObjectId()),
        {
          status: 404,
          dados: { mensagem: "Criança não encontrada" },
        },
      );
    });

    await t.test(
      "Sem JWT retorna HTTP 401 antes de consultar o banco",
      async () => {
        const inicio = jogo.comandos.length;
        assert.deepEqual(await jogo.consultarHistorico(usuarioId, null), {
          status: 401,
          dados: { mensagem: "Token nao informado" },
        });
        assert.deepEqual(jogo.comandos.slice(inicio), []);
      },
    );

    await t.test("Criança consulta seu próprio histórico", async () => {
      const { status, dados } = await jogo.consultarHistorico(usuarioId, 0);
      assert.equal(status, 200);
      assert.equal(dados.totalTentativas, 5);
    });

    await t.test(
      "Criança não pode consultar outra criança: HTTP 403",
      async () => {
        // A criança sem tentativas não pode ler os dados da outra criança.
        assert.deepEqual(await jogo.consultarHistorico(usuarioId, 1), negado);
        assert.deepEqual(
          await jogo.consultarHistorico(jogo.usuarios[1]._id, 0),
          negado,
        );
      },
    );

    await t.test(
      "Responsável consulta crianças vinculadas, com ou sem tentativas",
      async () => {
        for (const [indice, usuario] of jogo.usuarios.slice(0, 2).entries()) {
          assert.deepEqual(
            await jogo.consultarHistorico(usuario._id, 2),
            await jogo.consultarHistorico(usuario._id, indice),
          );
        }
      },
    );

    await t.test(
      "Responsável não pode consultar criança não vinculada: HTTP 403",
      async () => {
        for (const usuario of jogo.usuarios.slice(0, 2)) {
          assert.deepEqual(
            await jogo.consultarHistorico(usuario._id, 3),
            negado,
          );
        }
      },
    );

    await t.test(
      "URL recebe usuarioId e histórico usa Crianca._id",
      async () => {
        assert.notEqual(usuarioId, String(jogo.criancas[0]._id));
        assert.ok(
          estadoInicial.HistoricoJogo.every(
            (tentativa) =>
              String(tentativa.criancaId) === String(jogo.criancas[0]._id),
          ),
        );
        assert.equal(
          (await jogo.consultarHistorico()).dados.totalTentativas,
          5,
        );
        assert.equal(
          (await jogo.consultarHistorico(jogo.criancas[0]._id)).status,
          404,
        );
      },
    );

    await t.test(
      "Retorna tarefa, resposta escolhida, dificuldade, resultado, tentativa e data/hora",
      async () => {
        const { dados } = await jogo.consultarHistorico();
        const esperadas = [...estadoInicial.HistoricoJogo]
          .sort((a, b) => b.dataHora - a.dataHora)
          .map((registro) => ({
            _id: String(registro._id),
            perfilJogoId: String(registro.perfilJogoId),
            jogoSalvoId:
              registro.jogoSalvoId == null
                ? null
                : String(registro.jogoSalvoId),
            comodoId: String(registro.comodoId),
            tarefaId: String(registro.tarefaId),
            respostaEscolhidaId: String(registro.respostaEscolhidaId),
            dificuldade: registro.dificuldade,
            acertou: registro.acertou,
            tentativa: registro.tentativa,
            pontuacaoGanha: registro.pontuacaoGanha,
            dataHora: registro.dataHora.toISOString(),
          }));
        // Confere também a projeção exata, sem outros campos de documentos.
        assert.deepEqual(dados.tentativas, esperadas);
        assert.deepEqual(
          new Set(dados.tentativas.map((tentativa) => tentativa.acertou)),
          new Set([true, false]),
        );
      },
    );

    await t.test(
      "Ordena da tentativa mais recente para a mais antiga",
      async () => {
        const { dados } = await jogo.consultarHistorico();
        assert.deepEqual(
          dados.tentativas.map((tentativa) => tentativa.dataHora),
          [
            "2026-01-05T10:00:00.000Z",
            "2026-01-04T10:00:00.000Z",
            "2026-01-03T10:00:00.000Z",
            "2026-01-02T10:00:00.000Z",
            "2026-01-01T10:00:00.000Z",
          ],
        );
      },
    );

    await t.test(
      "Preserva tentativas repetidas e acertos repetidos individualmente",
      async () => {
        const { dados } = await jogo.consultarHistorico();
        const repetidas = dados.tentativas.filter(
          (tentativa) =>
            tentativa.tarefaId === String(jogo.tarefas[0]._id) &&
            tentativa.dificuldade === "facil",
        );
        assert.deepEqual(
          repetidas.map(({ tentativa, acertou }) => ({ tentativa, acertou })),
          [
            { tentativa: 3, acertou: true },
            { tentativa: 2, acertou: true },
            { tentativa: 1, acertou: false },
          ],
        );
        assert.equal(
          new Set(dados.tentativas.map((tentativa) => tentativa._id)).size,
          5,
        );
      },
    );

    await t.test(
      "Consulta de histórico preserva resposta e cálculos do progresso da issue #56",
      async () => {
        await jogo.consultarHistorico();
        const progressoFinal = await jogo.consultar();
        assert.deepEqual(progressoFinal, progressoInicial);
        assert.deepEqual(progressoFinal.dados.resumo, {
          totalTentativas: 5,
          acertos: 3,
          erros: 2,
          tarefasConcluidas: 2,
          ultimaInteracao: "2026-01-05T10:00:00.000Z",
        });
      },
    );

    await t.test(
      "Consultas preservam documentos e enviam somente comandos de leitura ao MongoDB",
      async () => {
        assert.deepEqual(await jogo.estado(), estadoInicial);
        assert.ok(jogo.comandos.includes("find"));
        assert.deepEqual(
          [...new Set(jogo.comandos)].filter(
            (comando) => !["find", "getMore", "killCursors"].includes(comando),
          ),
          [],
        );
      },
    );
  },
);
