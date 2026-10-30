import test from "node:test";
import assert from "node:assert/strict";
import { preparar, id, Crianca, Perfil, Jogo, Historico, Comodo, Tarefa, Resposta } from "./helpers/jogoSalvoMock.js";
import { casosEstados, prepararCasoEstados, conferirEstados, conferirAcessoEstados, instanteEstado } from "./helpers/estadosComodosIssue107.js";

async function fixture(t) {
  const j = await preparar(t), comodos = [...j.comodos], tarefas = j.tarefas.map(lista => [...lista]);
  for (const [i, ativo, quantidade] of [[2, true, 2], [3, false, 1], [4, true, 0], [5, true, 1]]) {
    comodos.push(j.inserir(Comodo, { nome: `C${i + 1}`, descricao: "Fixture estados", imagemCenario: "teste.png",
      ordem: i + 1, ativo, dificuldadesDisponiveis: ["facil", "medio", "dificil"] }));
    tarefas.push(Array.from({ length: quantidade }, (_, p) => {
      const tarefa = j.inserir(Tarefa, { comodoId: comodos[i]._id, titulo: "Fixture", enunciado: "Escolha",
        descricao: "Fixture estados", imagemObjeto: "teste.png", posicao: { x: 0, y: 0, largura: 1, altura: 1 },
        ordem: p + 1, ativo: i !== 5 });
      for (const correta of [true, false]) j.inserir(Resposta, { tarefaId: tarefa._id, texto: String(correta), correta, ordem: correta ? 1 : 2 });
      return tarefa;
    }));
  }
  return { j, comodos, tarefas, usuarioId: j.usuarioId, crianca: j.crianca, perfil: j.perfil, jogo: j.novaPartida() };
}
function harness(f) {
  const { j } = f;
  const json = valor => JSON.parse(JSON.stringify(valor));
  return {
    mudarComodo: async (alvo, i, valores) => { Object.assign(alvo.comodos[i], valores);
      Object.assign(j.dados.get(Comodo).get(String(alvo.comodos[i]._id)), valores); },
    mudarTarefa: async (alvo, c, t, valores) => Object.assign(j.dados.get(Tarefa).get(String(alvo.tarefas[c][t]._id)), valores),
    outraPartida: async alvo => ({ ...alvo, jogo: j.novaPartida() }),
    outraCrianca: async alvo => {
      const crianca = j.inserir(Crianca, { usuarioId: id(), permissaoAtiva: true });
      const perfil = j.inserir(Perfil, { criancaId: crianca._id, nomeAvatar: "Outra", imagemAvatar: "teste.png" });
      return { ...alvo, crianca, perfil, jogo: j.novaPartida({ perfilJogoId: perfil._id }) };
    },
    historicos: async (alvo, registros) => {
      let estrelas = 0;
      for (const [i, [c, p, dificuldade, acertou]] of registros.entries()) {
        const tarefa = alvo.tarefas[c][p], resposta = j.linhas(Resposta).find(r => String(r.tarefaId) === String(tarefa._id) && r.correta === acertou);
        const pontuacaoGanha = acertou ? { facil: 1, medio: 2, dificil: 3 }[dificuldade] : 0;
        estrelas += pontuacaoGanha;
        const tentativa = j.linhas(Historico).filter(h => String(h.jogoSalvoId) === String(alvo.jogo._id)
          && String(h.tarefaId) === String(tarefa._id) && h.dificuldade === dificuldade).length + 1;
        j.inserir(Historico, { criancaId: alvo.crianca._id, perfilJogoId: alvo.perfil._id, jogoSalvoId: alvo.jogo._id,
          tarefaId: tarefa._id, comodoId: tarefa.comodoId, respostaEscolhidaId: resposta._id,
          acertou, tentativa, dificuldade, pontuacaoGanha, dataHora: instanteEstado(i) });
      }
      j.dados.get(Jogo).get(String(alvo.jogo._id)).estrelasTotal = estrelas;
    },
    catalogoAtivo: async () => j.linhas(Comodo).filter(c => c.ativo).sort((a, b) => a.ordem - b.ordem),
    estado: async alvo => json({ jogo: j.dados.get(Jogo).get(String(alvo.jogo._id)),
      documentos: [...j.dados].map(([Model, linhas]) => [Model.modelName, [...linhas.values()]]) }),
    http: (alvo, jogoId = alvo.jogo._id, auth) => j.chamar("GET", `/${jogoId}/progresso`, undefined,
      auth === null ? null : auth ? `Bearer ${j.token(auth)}` : undefined),
  };
}
for (const caso of casosEstados) test(`#107 estados: ${caso.nome}`, async t => {
  const f = await fixture(t), h = harness(f);
  await prepararCasoEstados(h, f, caso);
  const inicio = f.j.eventos.length;
  await conferirEstados(h, f, caso);
  assert.ok(f.j.eventos.slice(inicio).every(e => ["find", "findOne", "distinct"].includes(e.op)));
  assert.equal(f.j.sessoes.length, 0);
});
test("#107 estados: autenticação, autorização e identificadores na rota existente", async t => {
  const f = await fixture(t); await conferirAcessoEstados(t, harness(f), f);
});
