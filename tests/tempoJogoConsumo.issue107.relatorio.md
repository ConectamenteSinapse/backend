# Issue #107 — Reconciliação do consumo diário

Execução em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
`services/tempoJogoService.js`, `models/criancaModel.js` e os testes existentes.
Preservada a divisão de trabalho: produção implementada pelo aluno; testes e
diagnóstico pelo Codex.

## Resultados da reexecução após a correção manual

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| `calcularNovoConsumo`: 57 testes, execução isolada | 57 | 0 | 0 |
| Auxiliares: 73 testes, execução isolada | 73 | 0 | 0 |
| Duas suítes específicas, TZ=UTC | 130 | 0 | 0 |
| Duas suítes específicas, TZ=Asia/Tokyo | 130 | 0 | 0 |
| Regressão completa sem MongoDB | 797 | 0 | 40 |

As repetições de fuso não devem ser somadas. A regressão descobriu 837 testes,
sem cancelamentos ou TODOs. Todos os 740 testes anteriores continuam aprovados,
incluindo os 73 auxiliares. As duas falhas de robustez foram corrigidas; não
foram identificadas novas falhas ou regressões. As 40 integrações opt-in ficaram
desativadas, sem acesso ao MongoDB. Todos os comandos retornaram código 0.

Comparação histórica: a execução anterior apresentou 55 aprovados e 2 falhas
nos 57 testes de consumo, e 795 aprovados, 2 falhas e 40 ignorados na regressão.
Nesta reexecução, nenhum arquivo de teste ou expectativa foi alterado.

## Verificação das duas falhas anteriores — corrigidas

Em ambos os casos, a entrada é um objeto simples sem a propriedade
`tempoUsadoHoje`, com os demais campos:

```js
{
  limiteTempoDiario: 1,
  dataReferenciaTempo: "2026-10-29",
  sessaoJogoEstado: "ativa", // ou "pausada" no segundo caso
  sessaoJogoContabilizadoEm: new Date("2026-10-29T15:00:00.000Z"),
  sessaoJogoExpiraEm: new Date("2026-10-29T15:00:30.000Z")
}
// agora: new Date("2026-10-29T15:00:10.000Z")
```

| Estado | Esperado | Obtido anteriormente | Obtido nesta reexecução |
|---|---|---|---|
| `ativa` | Rejeição explícita ou base zero + 10 s, retornando consumo 10 e marcador 15:00:10Z | Consumo `NaN` | Consumo 10, referência 2026-10-29 e marcador 15:00:10Z |
| `pausada` | Rejeição explícita ou consumo zero, mantendo marcador 15:00:00Z | Consumo `undefined` | Consumo zero, referência 2026-10-29 e marcador 15:00:00Z |

A alteração manual foi conferida no Service: a base do dia atual agora usa
`crianca.tempoUsadoHoje ?? 0`. Isso elimina as duas falhas sem alterar os testes.
O teste separado com `Crianca.hydrate()` também continua aprovado.

O operador trata null e undefined por inspeção do código; os dois casos de
regressão acima exercitam especificamente a propriedade ausente. Não foram
acrescentados casos novos nesta reexecução. Valores numéricos já inválidos,
como NaN ou Infinity na base de consumo, não são normalizados por `??` e
continuam fora da cobertura desses casos; isso não é uma nova falha detectada
nesta rodada.

## Meia-noite, expiração e repetição

Não foi encontrada perda do trecho do dia atual nos casos solicitados.
Com último instante em `2026-10-29T02:59:50Z` (23:59:50 de São Paulo),
expiração em `03:00:20Z`, referência `2026-10-28`, consumo anterior 100 e
reconciliação em `04:00:00Z`, o retorno é:

```js
{
  dataReferenciaTempo: "2026-10-29",
  tempoUsadoHoje: 20,
  sessaoJogoContabilizadoEm: new Date("2026-10-29T03:00:20.000Z")
}
```

Os 10 segundos anteriores à meia-noite pertencem ao dia anterior e não são
carregados para o saldo diário atual. O formato de retorno não contém um
arquivo histórico dos consumos anteriores, o que é distinto de perder
segundos do saldo do dia atual.

Reconciliar novamente às 15:00Z com o estado completo atualizado pelos três
campos acima mantém exatamente 20 segundos e o mesmo marcador. Também passam
a repetição no mesmo instante, heartbeats consecutivos, reconciliação antes e
depois da virada, expiração exatamente à meia-noite, expiração antes da virada
e conservação de consumo já registrado para o novo dia.

Se a primeira operação ocorrer no dia seguinte à expiração ou meses depois,
o saldo do dia da operação é zero e o marcador avança somente até a expiração.
Esse resultado corresponde à renovação diária e não a consumo contínuo durante
a inatividade. Referências antigas, futuras, null ou ausentes também foram
exercitadas.

## Outros comportamentos confirmados e limites

- Somente estado ativo acrescenta segundos; pausa, encerramento ou estado
  ausente mantêm o marcador e renovam o saldo quando muda o dia.
- Limite null continua acumulando. Com limite de 1 minuto, consumo anterior
  59 e intervalo de 10 segundos, o retorno é 69 segundos. Isso caracteriza a
  função atual: ela não bloqueia nem trunca o consumo no limite. A autorização
  para continuar jogando deve ser verificada no fluxo correspondente.
- Trocar a partida no estado da mesma criança preserva o acumulado.
- Instantes de sessão ausentes, null ou inválidos não acrescentam consumo;
  `agora` inválido e criança ausente são rejeitados explicitamente.
- Um marcador de sessão inválido recebido na entrada pode ser devolvido
  inalterado no retorno sem intervalo. O teste confirma a ausência de novo
  consumo, não a normalização desse marcador. O futuro fluxo de persistência
  deverá validar os dados antes da gravação.
- Frações até 1 ms e somas consecutivas usam tolerância inferior a 1e-12 s,
  igual à suíte auxiliar existente. A primeira execução revelou uma asserção
  nova excessivamente estrita para `12 + 29.999` (41.998999999999995 em ponto
  flutuante, contra 41.999). A comparação foi corrigida para essa tolerância;
  as duas falhas reais de campos ausentes permaneceram visíveis naquela etapa
  e foram corrigidas manualmente antes desta reexecução.
- A entrada simples, o documento Mongoose e as datas recebidas não são mutados.
  A chamada sem `agora` usa o relógio do servidor controlado no teste.
- A simulação de retomada fornece novos instantes, como deverá fazer o futuro
  fluxo de retomada. Não testa uma operação de retomada já persistida.

A idempotência verificada exige incorporar o resultado ao estado completo
antes da próxima chamada. Isso não comprova exclusão mútua entre requisições
que leram o mesmo estado antigo. Atualizações condicionais no MongoDB,
concorrência real, heartbeat e integração com registro de respostas continuam
fora do escopo desta função e desta execução.

## Isolamento e reprodução

O novo teste reutiliza `node:test`, `assert`, mocks nativos e `registerHooks`
da suíte auxiliar. Acrescenta export privado somente à cópia em memória do
módulo alvo; o corpo da função e os imports são os originais. Remove o hook
em `finally` e confirma os exports públicos sem instrumentação.

Conexões, sessões e queries Mongoose são bloqueadas e verificadas com zero
chamadas no teardown. Não há import de `index.js`, carregamento de `.env` ou
uso de banco nesta suíte. A regressão utiliza as flags de isolamento existentes.

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoConsumo.issue107.test.js tests/tempoJogoAuxiliares.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

Para repetir somente os 57 testes novos, executar em processos separados:

```powershell
$env:TZ='UTC'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoConsumo.issue107.test.js
$env:TZ='Asia/Tokyo'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoConsumo.issue107.test.js
```

Nesta reexecução, somente este relatório foi atualizado. Nenhum arquivo foi
criado permanentemente. Hashes dos arquivos JavaScript de produção e testes
conferidos contra o início da etapa. Código de produção, Models, Controllers,
Routes e todos os testes preservados, incluindo as alterações manuais do aluno.
Nenhuma dependência instalada, acesso ao MongoDB, commit ou push. Logs
temporários de execução removidos após o diagnóstico.
