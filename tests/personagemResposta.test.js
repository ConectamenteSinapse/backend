import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { prepararJogo } from "./helpers/jogo.js";

test("Resposta por personagem selecionado (dados fictícios e transação descartada)", async (t) => {
  const jogo = await prepararJogo(t, { catalogoTemporario: true });
  const primeiro = jogo.perfil;
  const segundo = await jogo.criarPersonagem({ estrelasTotal: 7 });
  const alheio = await jogo.criarPersonagem({
    outraCrianca: true,
    estrelasTotal: 11,
  });
  const arquivado = await jogo.criarPersonagem({
    status: "arquivado",
    estrelasTotal: 5,
  });
  const tarefa = jogo.tarefas[0];

  async function responder(perfilJogoId, atividade = tarefa) {
    return jogo.responder(atividade, "facil", true, true, { perfilJogoId });
  }

  async function rejeitar(perfilJogoId, status, mensagem) {
    const antes = await jogo.estadoPersonagens();
    assert.deepEqual(await responder(perfilJogoId), {
      status,
      dados: { mensagem },
    });
    // Compara todos os documentos, incluindo estrelas, histórico e tentativas
    // dos dois personagens ativos, do arquivado e da outra criança.
    assert.deepEqual(await jogo.estadoPersonagens(), antes);
  }

  await t.test(
    "Dois personagens ativos da mesma criança: registra no segundo selecionado",
    async () => {
      assert.equal(String(primeiro.criancaId), String(segundo.criancaId));
      assert.equal(primeiro.status, "ativo");
      assert.equal(segundo.status, "ativo");
      assert.deepEqual(await responder(String(segundo._id)), {
        status: 201,
        dados: {
          acertou: true,
          tentativa: 1,
          pontuacaoGanha: 1,
          dificuldade: "facil",
        },
      });
      await jogo.verificarEstado(0, 0, primeiro._id);
      await jogo.verificarEstado(8, 1, segundo._id);
    },
  );

  await t.test(
    "Trocar para o primeiro personagem mantém tentativas e estrelas independentes",
    async () => {
      assert.deepEqual(await responder(String(primeiro._id)), {
        status: 201,
        dados: {
          acertou: true,
          tentativa: 1,
          pontuacaoGanha: 1,
          dificuldade: "facil",
        },
      });
      await jogo.verificarEstado(1, 1, primeiro._id);
      await jogo.verificarEstado(8, 1, segundo._id);
    },
  );

  await t.test(
    "Histórico referencia o personagem, a criança, a tarefa e a pontuação corretos",
    async () => {
      const { historicos } = await jogo.estadoPersonagens();
      assert.equal(historicos.length, 2);
      for (const personagem of [primeiro, segundo]) {
        const registros = historicos.filter(
          (h) => String(h.perfilJogoId) === String(personagem._id),
        );
        assert.equal(registros.length, 1);
        const [registro] = registros;
        assert.equal(String(registro.criancaId), String(jogo.crianca._id));
        assert.equal(String(registro.comodoId), String(tarefa.comodoId));
        assert.equal(String(registro.tarefaId), String(tarefa._id));
        assert.equal(
          String(registro.respostaEscolhidaId),
          String(tarefa.correta._id),
        );
        assert.equal(registro.pontuacaoGanha, 1);
        assert.equal(registro.tentativa, 1);
        assert.equal(registro.acertou, true);
        assert.equal(registro.dificuldade, "facil");
      }
      await jogo.verificarEstado(11, 0, alheio._id);
      await jogo.verificarEstado(5, 0, arquivado._id);
    },
  );

  for (const [nome, id] of [
    ["Personagem de outra criança", alheio._id],
    ["Personagem inexistente", new mongoose.Types.ObjectId()],
    ["Personagem arquivado", arquivado._id],
  ]) {
    await t.test(
      `${nome}: HTTP 404 sem criar histórico nem alterar estrelas`,
      async () => {
        await rejeitar(String(id), 404, "Registro não encontrado");
      },
    );
  }

  await t.test(
    "perfilJogoId ausente: HTTP 400 sem efeitos no banco",
    async () => {
      // undefined é omitido por JSON.stringify, removendo o campo do body.
      await rejeitar(
        undefined,
        400,
        "Personagem, tarefa, resposta e dificuldade são obrigatórias",
      );
    },
  );

  await t.test(
    "perfilJogoId com formato inválido: HTTP 400 sem efeitos no banco",
    async () => {
      for (const id of ["invalido", "123", "z".repeat(24), {}, [], 42]) {
        await rejeitar(id, 400, "ID inválido");
      }
    },
  );

  await t.test(
    "Acertos de um personagem não desbloqueiam tarefas para o outro",
    async () => {
      assert.equal(
        (await responder(String(segundo._id), jogo.tarefas[1])).status,
        201,
      );
      const antes = await jogo.estadoPersonagens();
      const resultado = await jogo.responder(tarefa, "medio", true, true, {
        perfilJogoId: String(primeiro._id),
      });
      assert.deepEqual(resultado, {
        status: 403,
        dados: {
          mensagem: "Conclua a dificuldade anterior para continuar!",
          codigo: "DIFICULDADE_BLOQUEADA",
        },
      });
      assert.deepEqual(await jogo.estadoPersonagens(), antes);
      await jogo.verificarEstado(1, 1, primeiro._id);
      await jogo.verificarEstado(9, 2, segundo._id);
    },
  );
});
