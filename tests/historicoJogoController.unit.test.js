import test from "node:test";
import assert from "node:assert/strict";
import controller from "../controllers/historicoJogoController.js";
import service from "../services/historicoJogoService.js";
import Crianca from "../models/criancaModel.js";

const usuarioId = "111111111111111111111111";
const bodyValido = {
  perfilJogoId: "222222222222222222222222",
  tarefaId: "333333333333333333333333",
  respostaEscolhidaId: "444444444444444444444444",
  dificuldade: "facil",
};

async function executar(body) {
  const resposta = {
    status(codigo) {
      this.codigo = codigo;
      return this;
    },
    json(dados) {
      this.dados = dados;
      return this;
    },
  };
  await controller.registrarResposta(
    { usuario: { id: usuarioId }, body },
    resposta,
  );
  return { status: resposta.codigo, dados: resposta.dados };
}

test("Controller envia os cinco parâmetros e preserva o contrato HTTP 201", async (t) => {
  const chamada = t.mock.method(service, "registrarResposta", async () => ({
    acertou: true,
    tentativa: 2,
    pontuacaoGanha: 1,
    dificuldade: "facil",
    perfilJogoId: bodyValido.perfilJogoId,
  }));
  assert.deepEqual(await executar(bodyValido), {
    status: 201,
    dados: {
      acertou: true,
      tentativa: 2,
      pontuacaoGanha: 1,
      dificuldade: "facil",
    },
  });
  assert.deepEqual(chamada.mock.calls[0].arguments, [
    usuarioId,
    bodyValido.perfilJogoId,
    bodyValido.tarefaId,
    bodyValido.respostaEscolhidaId,
    bodyValido.dificuldade,
  ]);
});

test("Controller rejeita personagem ausente antes de chamar o Service: HTTP 400", async (t) => {
  const chamada = t.mock.method(service, "registrarResposta", async () => {
    assert.fail("Service não deve ser chamado sem personagem");
  });
  for (const perfilJogoId of [undefined, null, ""]) {
    assert.deepEqual(await executar({ ...bodyValido, perfilJogoId }), {
      status: 400,
      dados: {
        mensagem: "Personagem, tarefa, resposta e dificuldade são obrigatórias",
      },
    });
  }
  assert.equal(chamada.mock.callCount(), 0);
});

test("Service real rejeita formato inválido e Controller retorna HTTP 400 sem consultar banco", async (t) => {
  const consulta = t.mock.method(Crianca, "findOne", () => {
    assert.fail("ID inválido não deve consultar o banco");
  });
  for (const perfilJogoId of ["invalido", "123", "z".repeat(24), {}, [], 42]) {
    assert.deepEqual(await executar({ ...bodyValido, perfilJogoId }), {
      status: 400,
      dados: { mensagem: "ID inválido" },
    });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Controller traduz PERFIL_JOGO_NAO_ENCONTRADO para HTTP 404", async (t) => {
  t.mock.method(service, "registrarResposta", async () => {
    throw new Error("PERFIL_JOGO_NAO_ENCONTRADO");
  });
  assert.deepEqual(await executar(bodyValido), {
    status: 404,
    dados: { mensagem: "Registro não encontrado" },
  });
});

test("Controller rejeita dificuldade inválida antes do Service: HTTP 400", async (t) => {
  const chamada = t.mock.method(service, "registrarResposta", async () => {
    assert.fail("Service não deve ser chamado com dificuldade inválida");
  });
  assert.deepEqual(
    await executar({ ...bodyValido, dificuldade: "impossivel" }),
    {
      status: 400,
      dados: { mensagem: "Dificuldade inválida" },
    },
  );
  assert.equal(chamada.mock.callCount(), 0);
});

test("Controller rejeita body ausente antes do Service: HTTP 400", async (t) => {
  const chamada = t.mock.method(service, "registrarResposta", async () => {
    assert.fail("Service não deve ser chamado sem body");
  });
  assert.deepEqual(await executar(undefined), {
    status: 400,
    dados: { mensagem: "Body da requisição obrigatório" },
  });
  assert.equal(chamada.mock.callCount(), 0);
});
