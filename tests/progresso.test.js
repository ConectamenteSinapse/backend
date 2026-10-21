import test from "node:test";
import { opcoesTesteAtlas } from "./helpers/bancoTeste.js";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { prepararProgresso } from "./helpers/progresso.js";

const negado = {
  status: 403,
  dados: { mensagem: "Você não tem permissão para consultar este progresso" },
};

test(
  "Consulta de progresso no Atlas (dados fictícios e transação descartada)",
  opcoesTesteAtlas,
  async (t) => {
    const jogo = await prepararProgresso(t);
    const usuarioId = String(jogo.usuarios[0]._id);
    const estadoInicial = await jogo.estado();
    const tarefaId = String(jogo.tarefas[0]._id);

    await t.test(
      "Criança existente com histórico retorna HTTP 200",
      async () => {
        const { status, dados } = await jogo.consultar();
        assert.equal(status, 200);
        assert.equal(dados.criancaId, usuarioId);
        assert.equal(dados.resumo.totalTentativas, 5);
        assert.equal(dados.tarefas.length, 3);
      },
    );

    await t.test(
      "Criança existente sem histórico retorna resumo zerado",
      async () => {
        assert.deepEqual(await jogo.consultar(jogo.usuarios[1]._id, 1), {
          status: 200,
          dados: {
            criancaId: String(jogo.usuarios[1]._id),
            resumo: {
              totalTentativas: 0,
              acertos: 0,
              erros: 0,
              tarefasConcluidas: 0,
              ultimaInteracao: null,
            },
            tarefas: [],
          },
        });
      },
    );

    await t.test("Criança inexistente retorna HTTP 404", async () => {
      assert.deepEqual(await jogo.consultar(new mongoose.Types.ObjectId()), {
        status: 404,
        dados: { mensagem: "Criança não encontrada" },
      });
    });

    await t.test("Identificador inválido retorna HTTP 400", async () => {
      for (const id of ["invalido", "123", "z".repeat(24)]) {
        assert.deepEqual(await jogo.consultar(id), {
          status: 400,
          dados: { mensagem: "ID da criança inválido" },
        });
      }
    });

    await t.test("Requisição sem JWT retorna HTTP 401", async () => {
      assert.deepEqual(await jogo.consultar(usuarioId, null), {
        status: 401,
        dados: { mensagem: "Token nao informado" },
      });
    });

    await t.test("Criança pode consultar o próprio progresso", async () => {
      assert.equal((await jogo.consultar(usuarioId, 0)).status, 200);
    });

    await t.test(
      "Criança consultando outra criança retorna HTTP 403",
      async () => {
        assert.deepEqual(await jogo.consultar(jogo.usuarios[1]._id, 0), negado);
      },
    );

    await t.test("Responsável pode consultar criança vinculada", async () => {
      assert.deepEqual(
        await jogo.consultar(usuarioId, 2),
        await jogo.consultar(),
      );
    });

    await t.test(
      "Responsável consultando criança não vinculada retorna HTTP 403",
      async () => {
        assert.deepEqual(await jogo.consultar(usuarioId, 3), negado);
      },
    );

    await t.test(
      "API recebe usuarioId e histórico referencia Crianca._id",
      async () => {
        assert.notEqual(usuarioId, String(jogo.criancas[0]._id));
        assert.equal((await jogo.consultar()).dados.resumo.totalTentativas, 5);
        assert.equal((await jogo.consultar(jogo.criancas[0]._id)).status, 404);
      },
    );

    await t.test(
      "Calcula tentativas, acertos, erros e última interação cronológica",
      async () => {
        const { dados } = await jogo.consultar();
        assert.deepEqual(dados.resumo, {
          totalTentativas: 5,
          acertos: 3,
          erros: 2,
          tarefasConcluidas: 2,
          ultimaInteracao: "2026-01-05T10:00:00.000Z",
        });
        assert.deepEqual(
          dados.tarefas.find(
            (tarefa) =>
              tarefa.tarefaId === tarefaId && tarefa.dificuldade === "facil",
          ),
          {
            tarefaId,
            dificuldade: "facil",
            concluida: true,
            tentativas: 3,
            acertos: 2,
            erros: 1,
            ultimaInteracao: "2026-01-03T10:00:00.000Z",
          },
        );
      },
    );

    await t.test(
      "Agrupa por tarefa e dificuldade sem duplicar conclusões por acertos repetidos",
      async () => {
        const { dados } = await jogo.consultar();
        assert.deepEqual(dados.tarefas, [
          {
            tarefaId: String(jogo.tarefas[1]._id),
            dificuldade: "facil",
            concluida: false,
            tentativas: 1,
            acertos: 0,
            erros: 1,
            ultimaInteracao: "2026-01-05T10:00:00.000Z",
          },
          {
            tarefaId,
            dificuldade: "medio",
            concluida: true,
            tentativas: 1,
            acertos: 1,
            erros: 0,
            ultimaInteracao: "2026-01-04T10:00:00.000Z",
          },
          {
            tarefaId,
            dificuldade: "facil",
            concluida: true,
            tentativas: 3,
            acertos: 2,
            erros: 1,
            ultimaInteracao: "2026-01-03T10:00:00.000Z",
          },
        ]);
        assert.equal(dados.resumo.tarefasConcluidas, 2);
      },
    );

    await t.test(
      "Consultas preservam documentos e enviam apenas comandos de leitura ao MongoDB",
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
