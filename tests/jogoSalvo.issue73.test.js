import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import {
  preparar,
  barreira,
  id,
  Crianca,
  Perfil,
  Jogo,
  Historico,
  Tarefa,
  Comodo,
} from "./helpers/jogoSalvoMock.js";
import { verificarDificuldadeConcluida } from "../services/validarProgressaoService.js";

const igual = (a, b) => assert.equal(String(a), String(b));
const endpoints = (jogo) => [
  ["POST", "", { perfilJogoId: String(jogo.perfilJogoId), nomeJogo: "Novo" }],
  ["GET", ""],
  ["GET", `/${jogo._id}`],
  ["GET", `/${jogo._id}/progresso`],
  ["GET", `/${jogo._id}/historico`],
  ["PATCH", `/${jogo._id}`, { nomeJogo: "Alterado" }],
  ["DELETE", `/${jogo._id}`],
];
function concluir(
  j,
  jogo,
  comodo,
  dificuldades = ["facil", "medio", "dificil"],
) {
  for (const tarefa of j.tarefas[j.comodos.indexOf(comodo)]) {
    for (const dificuldade of dificuldades)
      j.inserir(Historico, {
        ...j.bodyResposta(jogo, tarefa, true, dificuldade),
        criancaId: j.crianca._id,
        comodoId: comodo._id,
        acertou: true,
        tentativa: 1,
        pontuacaoGanha: 1,
      });
  }
}

test("#73: index monta o router sem importar index ou conectar MongoDB", async () => {
  const fonte = await readFile(new URL("../index.js", import.meta.url), "utf8");
  assert.match(
    fonte,
    /import jogoSalvoRoutes from ["']\.\/routes\/jogoSalvoRoutes\.js["']/,
  );
  assert.match(fonte, /app\.use\(["']\/jogos-salvos["'],\s*jogoSalvoRoutes\)/);
});

test("#73: CRUD HTTP, defaults, normalização e retomada de posição salva explicitamente", async (t) => {
  const j = await preparar(t);
  const criado = await j.chamar("POST", "", {
    perfilJogoId: String(j.perfil._id),
    nomeJogo: "  Minha partida  ",
  });
  assert.equal(criado.status, 201);
  assert.equal(criado.dados.nomeJogo, "Minha partida");
  assert.equal(criado.dados.estrelasTotal, 0);
  assert.equal(criado.dados.dificuldade, "facil");
  assert.equal(criado.dados.tarefaId, null);
  const caminho = `/${criado.dados._id}`;
  const posicao = {
    comodoId: String(j.comodos[0]._id),
    tarefaId: String(j.tarefas[0][0]._id),
    dificuldade: "facil",
  };
  assert.equal(
    (await j.chamar("PATCH", caminho, { nomeJogo: "  Continuar ", ...posicao }))
      .status,
    200,
  );
  const retomado = await j.chamar("GET", caminho);
  assert.equal(retomado.status, 200);
  for (const [campo, valor] of Object.entries(posicao))
    assert.equal(retomado.dados[campo], valor);
  assert.equal(retomado.dados.nomeJogo, "Continuar");
  assert.equal((await j.chamar("GET")).dados.length, 1);
  assert.deepEqual(await j.chamar("DELETE", caminho), {
    status: 204,
    dados: null,
  });
  assert.equal((await j.chamar("GET", caminho)).status, 404);
  assert.equal((await j.chamar("DELETE", caminho)).status, 404);
});

test("#73: vários personagens e várias partidas por personagem; listagem exclusiva do dono", async (t) => {
  const j = await preparar(t);
  const segundo = j.inserir(Perfil, {
    criancaId: j.crianca._id,
    nomeAvatar: "Outro",
    imagemAvatar: "a.png",
  });
  const alheio = j.inserir(Perfil, {
    criancaId: id(),
    nomeAvatar: "Alheio",
    imagemAvatar: "a.png",
  });
  const arquivado = j.inserir(Perfil, {
    criancaId: j.crianca._id,
    nomeAvatar: "Arquivo",
    imagemAvatar: "a.png",
    status: "arquivado",
  });
  j.novaPartida({ atualizadoEm: new Date(1000) });
  j.novaPartida({ atualizadoEm: new Date(2000) });
  const maisNova = j.novaPartida({
    perfilJogoId: segundo._id,
    atualizadoEm: new Date(3000),
  });
  j.novaPartida({ perfilJogoId: alheio._id });
  j.novaPartida({ perfilJogoId: arquivado._id });
  const lista = await j.chamar("GET");
  assert.equal(lista.status, 200);
  assert.equal(lista.dados.length, 3);
  igual(lista.dados[0]._id, maisNova._id);
  for (const perfil of [alheio, arquivado])
    assert.equal(
      (
        await j.chamar("POST", "", {
          perfilJogoId: String(perfil._id),
          nomeJogo: "Negado",
        })
      ).status,
      404,
    );
});

test("#73: sete endpoints exigem JWT válido e perfil criança", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  const autenticacoes = [
    null,
    "token",
    "Basic x",
    "Bearer invalido",
    `Bearer ${j.token({}, { expiresIn: -1 })}`,
  ];
  for (const [method, url, body] of endpoints(jogo)) {
    for (const auth of autenticacoes)
      assert.equal(
        (await j.chamar(method, url, body, auth)).status,
        401,
        `${method} ${url}`,
      );
    for (const perfil of ["responsavel", "admin"])
      assert.equal(
        (await j.chamar(method, url, body, `Bearer ${j.token({ perfil })}`))
          .status,
        403,
      );
  }
  assert.equal(j.eventos.length, 0);
});

test("#73: JWT_SECRET ausente produz 500 antes da persistência", async (t) => {
  const j = await preparar(t);
  const auth = `Bearer ${j.token()}`;
  delete process.env.JWT_SECRET;
  assert.equal((await j.chamar("GET", "", undefined, auth)).status, 500);
  assert.equal(j.eventos.length, 0);
});

for (const motivo of [
  "outra criança",
  "personagem arquivado",
  "personagem ausente",
  "partida ausente",
]) {
  test(`#73: proprietário é verificado em leitura/edição/exclusão/progresso/histórico: ${motivo}`, async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const perfil = j.dados.get(Perfil).get(String(j.perfil._id));
    if (motivo === "outra criança") perfil.criancaId = id();
    if (motivo === "personagem arquivado") perfil.status = "arquivado";
    if (motivo === "personagem ausente") j.dados.get(Perfil).clear();
    if (motivo === "partida ausente") j.dados.get(Jogo).clear();
    for (const [method, url, body] of endpoints(jogo).slice(2))
      assert.equal((await j.chamar(method, url, body)).status, 404);
  });
}

test("#73: formatos inválidos, corpo vazio, nome e posição inconsistentes produzem 400", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  for (const nomeJogo of [undefined, null, "", "  ", 42, {}])
    assert.equal(
      (
        await j.chamar("POST", "", {
          perfilJogoId: String(j.perfil._id),
          nomeJogo,
        })
      ).status,
      400,
    );
  for (const perfilJogoId of ["invalido", null, 42])
    assert.equal(
      (await j.chamar("POST", "", { perfilJogoId, nomeJogo: "Nome" })).status,
      400,
    );
  for (const [method, url, body] of endpoints(jogo).slice(2))
    assert.equal(
      (await j.chamar(method, url.replace(String(jogo._id), "invalido"), body))
        .status,
      400,
    );
  for (const body of [
    {},
    { estrelasTotal: 99 },
    { nomeJogo: " " },
    { dificuldade: "impossivel" },
    { tarefaId: String(j.tarefas[0][0]._id) },
    { comodoId: "invalido" },
    { tarefaId: "invalido" },
    { comodoId: String(id()) },
    {
      comodoId: String(j.comodos[0]._id),
      tarefaId: String(j.tarefas[1][0]._id),
    },
  ]) {
    assert.equal(
      (await j.chamar("PATCH", `/${jogo._id}`, body)).status,
      400,
      JSON.stringify(body),
    );
  }
  assert.equal(j.linhas(Jogo)[0].nomeJogo, "Partida");
  assert.equal(j.linhas(Jogo)[0].comodoId, null);
});

test("#73: PATCH ignora injeção de proprietário, estrelas e datas", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  assert.equal(
    (
      await j.chamar("PATCH", `/${jogo._id}`, {
        nomeJogo: "Seguro",
        perfilJogoId: String(id()),
        estrelasTotal: 999,
        criadoEm: new Date(0),
      })
    ).status,
    200,
  );
  const salvo = j.linhas(Jogo)[0];
  igual(salvo.perfilJogoId, j.perfil._id);
  assert.equal(salvo.estrelasTotal, 0);
  assert.notEqual(salvo.criadoEm.getTime(), 0);
});

for (const codigo of [
  "COMODO_BLOQUEADO",
  "DIFICULDADE_BLOQUEADA",
  "TAREFA_FORA_DA_ORDEM",
]) {
  test(`#73: PATCH e resposta bloqueiam ${codigo} com HTTP 403`, async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const tarefa =
      codigo === "COMODO_BLOQUEADO"
        ? j.tarefas[1][0]
        : codigo === "TAREFA_FORA_DA_ORDEM"
          ? j.tarefas[0][1]
          : j.tarefas[0][0];
    const dificuldade = codigo === "DIFICULDADE_BLOQUEADA" ? "medio" : "facil";
    for (const res of [
      await j.chamar("PATCH", `/${jogo._id}`, {
        comodoId: String(tarefa.comodoId),
        tarefaId: String(tarefa._id),
        dificuldade,
      }),
      await j.responder(jogo, tarefa, true, dificuldade),
    ]) {
      assert.equal(res.status, 403);
      assert.equal(res.dados.codigo, codigo);
    }
    assert.equal(j.linhas(Historico).length, 0);
    assert.equal(j.linhas(Jogo)[0].estrelasTotal, 0);
  });
}

test("#73: erros não desbloqueiam tarefa e progresso de outra partida não desbloqueia nada", async (t) => {
  const j = await preparar(t);
  const a = j.novaPartida();
  const b = j.novaPartida();
  assert.equal((await j.responder(b, j.tarefas[0][0], false)).status, 201);
  assert.equal((await j.responder(b, j.tarefas[0][1])).status, 403);
  concluir(j, a, j.comodos[0]);
  assert.equal(
    (await j.responder(b, j.tarefas[0][0], true, "medio")).status,
    403,
  );
  assert.equal((await j.responder(b, j.tarefas[0][1])).status, 403);
  assert.equal((await j.responder(b, j.tarefas[1][0])).status, 403);
  assert.equal((await j.responder(a, j.tarefas[1][0])).status, 201);
});

test("#73: acertos, erros, tentativas, estrelas e consultas independentes em duas partidas", async (t) => {
  const j = await preparar(t);
  const a = j.novaPartida();
  const b = j.novaPartida();
  for (const [jogo, correta, tentativa, pontos] of [
    [a, false, 1, 0],
    [a, true, 2, 1],
    [b, true, 1, 1],
  ]) {
    const res = await j.responder(jogo, j.tarefas[0][0], correta);
    assert.equal(res.status, 201);
    assert.deepEqual(res.dados, {
      acertou: correta,
      tentativa,
      pontuacaoGanha: pontos,
      dificuldade: "facil",
    });
  }
  for (const [jogo, total, erros] of [
    [a, 2, 1],
    [b, 1, 0],
  ]) {
    const progresso = await j.chamar("GET", `/${jogo._id}/progresso`);
    assert.equal(progresso.status, 200);
    assert.equal(progresso.dados.estrelasTotal, 1);
    assert.equal(progresso.dados.resumo.totalTentativas, total);
    assert.equal(progresso.dados.resumo.erros, erros);
    assert.equal(progresso.dados.resumo.tarefasConcluidas, 1);
    const historico = await j.chamar("GET", `/${jogo._id}/historico`);
    assert.equal(historico.status, 200);
    assert.equal(historico.dados.totalTentativas, total);
    assert.ok(
      historico.dados.tentativas.every(
        (h) => h.jogoSalvoId === String(jogo._id),
      ),
    );
  }
  assert.equal(j.linhas(Perfil)[0].estrelasTotal, 0);
  assert.ok(j.sessoes.every((s) => s.encerrada));
});

for (const [dificuldade, estrelas] of [
  ["facil", 1],
  ["medio", 2],
  ["dificil", 3],
]) {
  test(`#73: pontuação ${dificuldade}, tentativas reiniciam por dificuldade`, async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    if (dificuldade !== "facil")
      concluir(
        j,
        jogo,
        j.comodos[0],
        dificuldade === "medio" ? ["facil"] : ["facil", "medio"],
      );
    const res = await j.responder(jogo, j.tarefas[0][0], true, dificuldade);
    assert.equal(res.status, 201);
    assert.equal(res.dados.tentativa, 1);
    assert.equal(res.dados.pontuacaoGanha, estrelas);
    assert.equal(j.linhas(Jogo)[0].estrelasTotal, estrelas);
  });
}

test("#73: exclusão preserva personagem e histórico, bloqueia resposta posterior e mantém consulta geral", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  assert.equal((await j.responder(jogo)).status, 201);
  const perfisAntes = JSON.stringify(j.linhas(Perfil));
  const historicosAntes = JSON.stringify(j.linhas(Historico));
  assert.equal((await j.chamar("DELETE", `/${jogo._id}`)).status, 204);
  assert.equal((await j.responder(jogo)).status, 404);
  assert.equal(JSON.stringify(j.linhas(Perfil)), perfisAntes);
  assert.equal(JSON.stringify(j.linhas(Historico)), historicosAntes);
  const historico = await j.chamar("GET", `/criancas/${j.usuarioId}/historico`);
  assert.equal(historico.status, 200);
  assert.equal(historico.dados.totalTentativas, 1);
  assert.equal((await j.chamar("GET", `/${jogo._id}/historico`)).status, 404);
});

test("#73: registros antigos sem jogoSalvoId permanecem nas consultas gerais e não liberam partida nova", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  const antigo = {
    ...j.bodyResposta(jogo),
    criancaId: j.crianca._id,
    comodoId: j.comodos[0]._id,
    acertou: true,
    tentativa: 4,
    pontuacaoGanha: 1,
  };
  delete antigo.jogoSalvoId;
  const doc = j.inserir(Historico, antigo);
  assert.equal(doc.jogoSalvoId, null);
  // Também simula documento BSON antigo onde o campo nem existe.
  delete j.dados.get(Historico).get(String(doc._id)).jogoSalvoId;
  for (const rota of ["historico", "progresso"]) {
    const res = await j.chamar(
      "GET",
      `/criancas/${j.usuarioId}${rota === "historico" ? "/historico" : ""}`,
    );
    assert.equal(res.status, 200);
    assert.equal(
      rota === "historico"
        ? res.dados.totalTentativas
        : res.dados.resumo.totalTentativas,
      1,
    );
    const porJogo = await j.chamar("GET", `/${jogo._id}/${rota}`);
    assert.equal(porJogo.status, 200);
    assert.equal(
      rota === "historico"
        ? porJogo.dados.totalTentativas
        : porJogo.dados.resumo.totalTentativas,
      0,
    );
  }
  assert.equal((await j.responder(jogo, j.tarefas[0][1])).status, 403);
  assert.equal((await j.responder(jogo)).dados.tentativa, 1);
});

for (const tipo of ["ValidationError", "CastError", "inesperado"]) {
  test(`#73: erros ${tipo} são traduzidos pelos sete endpoints`, async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    t.mock.method(Crianca, "findOne", async () => {
      const erro = new Error("Detalhe privado de persistência");
      erro.name = tipo;
      throw erro;
    });
    for (const [method, url, body] of endpoints(jogo)) {
      const res = await j.chamar(method, url, body);
      assert.equal(
        res.status,
        tipo === "inesperado" ? 500 : 400,
        `${method} ${url}`,
      );
      assert.ok(!JSON.stringify(res.dados).includes("Detalhe privado"));
    }
  });
}

test("#73: criança ausente produz 404 nos sete endpoints", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  j.dados.get(Crianca).clear();
  for (const [method, url, body] of endpoints(jogo))
    assert.equal((await j.chamar(method, url, body)).status, 404);
});

test("#73: resposta rejeita partida de outro personagem e criança sem permissão", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida({ perfilJogoId: id() });
  assert.equal((await j.responder(jogo)).status, 404);
  j.dados.get(Crianca).get(String(j.crianca._id)).permissaoAtiva = false;
  assert.equal((await j.responder(jogo)).status, 403);
});

for (const correta of [true, false]) {
  test(`#73: resposta ${correta ? "correta" : "incorreta"} salva automaticamente última tarefa, cômodo e dificuldade`, async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const outra = j.novaPartida();
    const tarefa = j.tarefas[0][1];
    concluir(j, jogo, j.comodos[0], ["facil"]);
    // Respostas salvam a posição sem PATCH; a seguinte deve substituir a anterior.
    assert.equal(
      (await j.responder(jogo, j.tarefas[0][0], true, "medio")).status,
      201,
    );
    assert.equal(
      (await j.responder(jogo, tarefa, correta, "medio")).status,
      201,
    );
    const retomada = await j.chamar("GET", `/${jogo._id}`);
    assert.equal(retomada.status, 200);
    igual(retomada.dados.tarefaId, tarefa._id);
    igual(retomada.dados.comodoId, tarefa.comodoId);
    assert.equal(retomada.dados.dificuldade, "medio");
    assert.equal(retomada.dados.estrelasTotal, correta ? 4 : 2);
    const intacta = await j.chamar("GET", `/${outra._id}`);
    assert.equal(intacta.dados.tarefaId, null);
    assert.equal(intacta.dados.comodoId, null);
    assert.equal(intacta.dados.dificuldade, "facil");
    assert.equal(intacta.dados.estrelasTotal, 0);
  });
}

test("#73: novas respostas substituem a última tarefa e bloqueios preservam a posição salva", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  assert.equal((await j.responder(jogo)).status, 201);
  assert.equal((await j.responder(jogo, j.tarefas[0][1], false)).status, 201);
  const antes = await j.chamar("GET", `/${jogo._id}`);
  igual(antes.dados.tarefaId, j.tarefas[0][1]._id);
  assert.equal((await j.responder(jogo, j.tarefas[1][0])).status, 403);
  const depois = await j.chamar("GET", `/${jogo._id}`);
  assert.deepEqual(depois, antes);
});

test(
  "#73 MOCK: excluir entre pré-leitura e escrita da resposta impede novo histórico",
  { timeout: 5000 },
  async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const entrou = barreira();
    const liberar = barreira();
    j.antesQuery(async (q) => {
      if (q.model === Jogo && q.op === "findOneAndUpdate") {
        entrou.liberar();
        await liberar.promise;
      }
    });
    const resposta = j.responder(jogo);
    try {
      await entrou.promise;
      assert.equal((await j.chamar("DELETE", `/${jogo._id}`)).status, 204);
    } finally {
      liberar.liberar();
    }
    assert.equal((await resposta).status, 404);
    assert.equal(j.linhas(Historico).length, 0);
    assert.equal(j.linhas(Jogo).length, 0);
    assert.ok(j.sessoes.every((s) => s.encerrada));
  },
);

test(
  "#73 MOCK: PATCH carregado antes da resposta preserva incremento de estrelas ao salvar nome",
  { timeout: 5000 },
  async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const entrou = barreira();
    const liberar = barreira();
    j.antesSave(async () => {
      entrou.liberar();
      await liberar.promise;
    });
    const patch = j.chamar("PATCH", `/${jogo._id}`, { nomeJogo: "Renomeada" });
    try {
      await entrou.promise;
      assert.equal((await j.responder(jogo)).status, 201);
    } finally {
      liberar.liberar();
    }
    assert.equal((await patch).status, 200);
    assert.equal(j.linhas(Jogo)[0].estrelasTotal, 1);
    assert.equal(j.linhas(Jogo)[0].nomeJogo, "Renomeada");
  },
);

test(
  "#73 MOCK: regressão — exclusão entre leitura e save do PATCH deve retornar 404",
  { timeout: 5000 },
  async (t) => {
    const j = await preparar(t);
    const jogo = j.novaPartida();
    const entrou = barreira();
    const liberar = barreira();
    j.antesSave(async () => {
      entrou.liberar();
      await liberar.promise;
    });
    const patch = j.chamar("PATCH", `/${jogo._id}`, { nomeJogo: "Renomeada" });
    try {
      await entrou.promise;
      assert.equal((await j.chamar("DELETE", `/${jogo._id}`)).status, 204);
    } finally {
      liberar.liberar();
    }
    assert.equal((await patch).status, 404);
    assert.equal(j.linhas(Jogo).length, 0);
  },
);

test("#73 MOCK: sessão e histórico usam a mesma transação; falha no insert encerra sessão", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  t.mock.method(Historico, "create", async (docs, options) => {
    assert.equal(options.session, j.sessoes[0]);
    throw new Error("Falha de insert simulada");
  });
  assert.equal((await j.responder(jogo)).status, 500);
  assert.ok(j.sessoes[0].encerrada);
  const escritas = j.eventos.filter((e) => e.op === "findOneAndUpdate");
  assert.equal(escritas.length, 2);
  assert.ok(escritas.every((e) => e.opcoes.session === j.sessoes[0]));
  // Não afirma rollback: o mock não implementa transações de banco.
});

test("#73: dificuldade vazia ou tarefa inativa não conta como conclusão", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  assert.equal(
    await verificarDificuldadeConcluida(jogo._id, id(), "facil"),
    false,
  );
  const tarefa = j.dados.get(Tarefa).get(String(j.tarefas[0][0]._id));
  tarefa.ativo = false;
  assert.equal((await j.responder(jogo)).status, 403);
  j.dados.get(Comodo).get(String(j.comodos[0]._id)).ativo = false;
  assert.equal(
    (
      await j.chamar("PATCH", `/${jogo._id}`, {
        comodoId: String(j.comodos[0]._id),
      })
    ).status,
    400,
  );
});

test("#73: schemas validam defaults, estrelas negativas e histórico legado sem partida", async () => {
  const jogo = new Jogo({ perfilJogoId: id(), nomeJogo: "  Nome  " });
  await jogo.validate();
  assert.equal(jogo.nomeJogo, "Nome");
  assert.equal(jogo.comodoId, null);
  assert.equal(jogo.tarefaId, null);
  jogo.estrelasTotal = -1;
  await assert.rejects(
    jogo.validate(),
    (erro) => erro instanceof mongoose.Error.ValidationError,
  );
  const historico = new Historico({
    perfilJogoId: id(),
    criancaId: id(),
    comodoId: id(),
    tarefaId: id(),
    respostaEscolhidaId: id(),
    acertou: false,
    tentativa: 1,
    dificuldade: "facil",
  });
  await historico.validate();
  assert.equal(historico.jogoSalvoId, null);
});

test("#73: endpoint de respostas valida campos obrigatórios, IDs e dificuldade", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  const body = j.bodyResposta(jogo);
  for (const campo of Object.keys(body)) {
    const incompleto = { ...body };
    delete incompleto[campo];
    assert.equal(
      (await j.chamar("POST", "/historico-jogo/responder", incompleto)).status,
      400,
    );
  }
  for (const campo of [
    "perfilJogoId",
    "jogoSalvoId",
    "tarefaId",
    "respostaEscolhidaId",
  ]) {
    assert.equal(
      (
        await j.chamar("POST", "/historico-jogo/responder", {
          ...body,
          [campo]: "invalido",
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await j.chamar("POST", "/historico-jogo/responder", {
        ...body,
        dificuldade: "impossivel",
      })
    ).status,
    400,
  );
  assert.equal(
    (await j.chamar("POST", "/historico-jogo/responder", body, null)).status,
    401,
  );
  assert.equal(j.sessoes.length, 0);
});

test("#73: segundo cômodo exige concluir também o difícil do primeiro", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  concluir(j, jogo, j.comodos[0], ["facil", "medio"]);
  const bloqueado = await j.responder(jogo, j.tarefas[1][0]);
  assert.equal(bloqueado.status, 403);
  assert.equal(bloqueado.dados.codigo, "COMODO_BLOQUEADO");
  concluir(j, jogo, j.comodos[0], ["dificil"]);
  assert.equal((await j.responder(jogo, j.tarefas[1][0])).status, 201);
});

test("#73 MOCK: respostas paralelas usam sessões distintas e reservam a partida antes de contar", async (t) => {
  const j = await preparar(t);
  const jogo = j.novaPartida();
  const resultados = await Promise.all([
    j.responder(jogo),
    j.responder(jogo, undefined, false),
  ]);
  assert.ok(resultados.every((r) => r.status === 201));
  assert.equal(j.sessoes.length, 2);
  assert.notEqual(j.sessoes[0], j.sessoes[1]);
  for (const session of j.sessoes) {
    const eventos = j.eventos.filter((e) => e.opcoes?.session === session);
    assert.deepEqual(
      eventos.map((e) => e.op),
      ["findOneAndUpdate", "findOneAndUpdate", "countDocuments", "create"],
    );
    assert.equal(eventos[0].model, Perfil);
    assert.equal(eventos[1].model, Jogo);
    igual(eventos[2].filtro.jogoSalvoId, jogo._id);
    assert.equal(eventos[2].filtro.dificuldade, "facil");
    assert.ok(session.encerrada);
  }
  // Sem asserts de tentativas únicas ou rollback: exigem locks reais do MongoDB.
});
