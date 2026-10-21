import test from "node:test";
import { opcoesTesteAtlas } from "./helpers/bancoTeste.js";
import assert from "node:assert/strict";
import { prepararJogo } from "./helpers/jogo.js";

test(
  "Desbloqueio dos cômodos no Atlas (transação descartada)",
  opcoesTesteAtlas,
  async (t) => {
    const jogo = await prepararJogo(t, { catalogoTemporario: true });
    const {
      quarto,
      banheiro,
      cozinha,
      inativo,
      vazio,
      soInativas,
      tarefaOrfa,
    } = jogo.catalogo;
    let estrelas = 0;
    let historicos = 0;

    async function acertar(tarefa, dificuldade) {
      const pontos = { facil: 1, medio: 2, dificil: 3 }[dificuldade];
      assert.deepEqual(await jogo.responder(tarefa, dificuldade), {
        status: 201,
        dados: {
          acertou: true,
          tentativa: 1,
          pontuacaoGanha: pontos,
          dificuldade,
        },
      });
      estrelas += pontos;
      historicos++;
      await jogo.verificarEstado(estrelas, historicos);
    }

    async function rejeitar(tarefa, dificuldade, status, dados) {
      assert.deepEqual(await jogo.responder(tarefa, dificuldade), {
        status,
        dados,
      });
      // Uma rejeição não registra tentativa nem altera as estrelas.
      await jogo.verificarEstado(estrelas, historicos);
    }

    async function bloqueado(comodo, dificuldade = "facil") {
      await rejeitar(comodo.tarefas[0], dificuldade, 403, {
        mensagem: "Conclua o cômodo anterior para continuar!",
        codigo: "COMODO_BLOQUEADO",
      });
    }

    await t.test(
      "Quarto disponível inicialmente: primeira atividade retorna HTTP 201",
      async () => {
        await jogo.verificarEstado(0, 0);
        await acertar(quarto.tarefas[0], "facil");
      },
    );

    await t.test(
      "Banheiro bloqueado nas três dificuldades enquanto o Quarto está pendente",
      async () => {
        for (const dificuldade of ["facil", "medio", "dificil"]) {
          await bloqueado(banheiro, dificuldade);
        }
      },
    );

    await t.test(
      "Cozinha bloqueada inicialmente, com Banheiro e Quarto pendentes",
      async () => {
        await bloqueado(cozinha);
      },
    );

    await t.test(
      "Banheiro continua bloqueado após concluir somente o Quarto fácil",
      async () => {
        await acertar(quarto.tarefas[1], "facil");
        await bloqueado(banheiro);
      },
    );

    await t.test(
      "Banheiro continua bloqueado após concluir Quarto fácil e médio",
      async () => {
        for (const tarefa of quarto.tarefas) await acertar(tarefa, "medio");
        await bloqueado(banheiro);
      },
    );

    await t.test(
      "Banheiro continua bloqueado com a última tarefa do Quarto difícil pendente",
      async () => {
        await acertar(quarto.tarefas[0], "dificil");
        await bloqueado(banheiro);
      },
    );

    await t.test(
      "Banheiro liberado após concluir todas as tarefas do Quarto nas três dificuldades",
      async () => {
        await acertar(quarto.tarefas[1], "dificil");
        await acertar(banheiro.tarefas[0], "facil");
      },
    );

    await t.test(
      "Cozinha continua bloqueada com Quarto completo e somente Banheiro fácil concluído",
      async () => {
        await acertar(banheiro.tarefas[1], "facil");
        await bloqueado(cozinha);
      },
    );

    await t.test(
      "Cozinha continua bloqueada após concluir Banheiro fácil e médio",
      async () => {
        for (const tarefa of banheiro.tarefas) await acertar(tarefa, "medio");
        await bloqueado(cozinha);
      },
    );

    await t.test(
      "Cozinha continua bloqueada com a última tarefa do Banheiro difícil pendente",
      async () => {
        await acertar(banheiro.tarefas[0], "dificil");
        await bloqueado(cozinha);
      },
    );

    await t.test(
      "Cozinha liberada após concluir todas as tarefas do Banheiro nas três dificuldades",
      async () => {
        await acertar(banheiro.tarefas[1], "dificil");
        await acertar(cozinha.tarefas[0], "facil");
      },
    );

    await t.test(
      "Tarefa ativa vinculada a cômodo inexistente retorna HTTP 403 COMODO_INDISPONIVEL",
      async () => {
        await rejeitar(tarefaOrfa, "facil", 403, {
          mensagem: "Cômodo indisponível no momento",
          codigo: "COMODO_INDISPONIVEL",
        });
      },
    );

    await t.test(
      "Cômodo inativo com tarefa ativa retorna HTTP 403 COMODO_INDISPONIVEL",
      async () => {
        await rejeitar(inativo.tarefa, "facil", 403, {
          mensagem: "Cômodo indisponível no momento",
          codigo: "COMODO_INDISPONIVEL",
        });
      },
    );

    await t.test(
      "Cômodo sem tarefas: listagem vazia e resposta sem tarefa cadastrada retorna HTTP 404",
      async () => {
        assert.deepEqual(await jogo.listarTarefas(vazio._id), {
          status: 200,
          dados: {
            mensagem: "Este cômodo ainda não possui tarefas cadastradas",
            tarefas: [],
          },
        });
        // A API aceita tarefaId, não comodoId. Sem tarefa não é possível
        // alcançar COMODO_INDISPONIVEL; o Service rejeita a tarefa antes disso.
        await rejeitar(vazio.tarefaAusente, "facil", 404, {
          mensagem: "Registro não encontrado",
        });
      },
    );

    await t.test(
      "Cômodo sem tarefas ativas: tarefa inativa retorna HTTP 403 antes da validação do cômodo",
      async () => {
        await rejeitar(soInativas.tarefa, "facil", 403, {
          mensagem: "Tarefa indisponível",
        });
      },
    );
  },
);
