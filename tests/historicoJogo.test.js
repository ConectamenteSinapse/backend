import test from "node:test";
import { opcoesTesteAtlas } from "./helpers/bancoTeste.js";
import assert from "node:assert/strict";
import { prepararJogo } from "./helpers/jogo.js";

test(
  "Histórico de jogo no Atlas (transação descartada)",
  opcoesTesteAtlas,
  async (t) => {
    const jogo = await prepararJogo(t);
    const primeira = jogo.tarefas[0];

    await t.test("Sem autenticação retorna HTTP 401", async () => {
      const { status } = await jogo.responder(primeira, "facil", true, false);
      assert.equal(status, 401);
      await jogo.verificarEstado(0, 0);
    });

    await t.test(
      "JWT automático permite validar dificuldade inválida: HTTP 400",
      async () => {
        const { status, dados } = await jogo.responder(primeira, "impossivel");
        assert.equal(status, 400);
        assert.equal(dados.mensagem, "Dificuldade inválida");
        await jogo.verificarEstado(0, 0);
      },
    );

    for (const dificuldade of ["medio", "dificil"]) {
      await t.test(
        `${dificuldade}: bloqueada antes de concluir a anterior`,
        async () => {
          const { status, dados } = await jogo.responder(primeira, dificuldade);
          assert.equal(status, 403);
          assert.equal(dados.codigo, "DIFICULDADE_BLOQUEADA");
          await jogo.verificarEstado(0, 0);
        },
      );
    }

    let estrelas = 0;
    let historicos = 0;
    const dificuldades = ["facil", "medio", "dificil"];

    for (const [indice, dificuldade] of dificuldades.entries()) {
      const atividades = jogo.tarefas;
      const primeira = atividades[0];
      const ultima = atividades.at(-1);
      await t.test(
        `${dificuldade}: impede pular a ordem das tarefas`,
        async () => {
          const { status, dados } = await jogo.responder(ultima, dificuldade);
          assert.equal(status, 403);
          assert.equal(dados.codigo, "TAREFA_FORA_DA_ORDEM");
          await jogo.verificarEstado(estrelas, historicos);
        },
      );

      await t.test(
        `${dificuldade}: erro concede zero estrelas e não conclui a tarefa`,
        async () => {
          const { status, dados } = await jogo.responder(
            primeira,
            dificuldade,
            false,
          );
          assert.equal(status, 201);
          assert.deepEqual(dados, {
            acertou: false,
            tentativa: 1,
            pontuacaoGanha: 0,
            dificuldade,
          });
          historicos++;
          await jogo.verificarEstado(estrelas, historicos);
          const bloqueio = await jogo.responder(ultima, dificuldade);
          assert.equal(bloqueio.status, 403);
          assert.equal(bloqueio.dados.codigo, "TAREFA_FORA_DA_ORDEM");
          await jogo.verificarEstado(estrelas, historicos);
        },
      );

      await t.test(
        `${dificuldade}: acertos concedem ${indice + 1} estrela(s) e acumulam na partida`,
        async () => {
          for (const [posicao, tarefa] of atividades.entries()) {
            const { status, dados } = await jogo.responder(tarefa, dificuldade);
            assert.equal(status, 201);
            assert.deepEqual(dados, {
              acertou: true,
              tentativa: posicao === 0 ? 2 : 1,
              pontuacaoGanha: indice + 1,
              dificuldade,
            });
            estrelas += indice + 1;
            historicos++;
            await jogo.verificarEstado(estrelas, historicos);

            // Um acerto parcial não pode liberar a próxima dificuldade.
            if (posicao === 0 && indice < dificuldades.length - 1) {
              const bloqueio = await jogo.responder(
                primeira,
                dificuldades[indice + 1],
              );
              assert.equal(bloqueio.status, 403);
              assert.equal(bloqueio.dados.codigo, "DIFICULDADE_BLOQUEADA");
              await jogo.verificarEstado(estrelas, historicos);
            }
          }
        },
      );

      // A primeira tarefa da dificuldade seguinte será aceita na próxima
      // iteração, comprovando o desbloqueio após TODOS os acertos anteriores.
    }
  },
);
