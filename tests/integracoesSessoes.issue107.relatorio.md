# Issue #107 — Adaptação das integrações MongoDB existentes

Execução em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.
Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
Controller, Services de histórico, tempo, progressão, personagens e partidas,
Models e helpers atuais. Nenhum arquivo de produção foi alterado.

## Inventário e resultados finais

A busca por chamadas diretas de `registrarResposta`, pelo endpoint
`/historico-jogo/responder` e pelos consumidores do helper `prepararJogo`
identificou oito suítes antigas afetadas. Todas foram executadas com MongoDB.

| Suíte afetada | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| `comodos.test.js` | 16 | 0 | 0 |
| `historicoJogo.test.js` | 14 | 0 | 0 |
| `personagemResposta.test.js` | 10 | 0 | 0 |
| `concorrenciaPersonagens.mongo.test.js` | 10 | 0 | 0 |
| `transacaoResposta.test.js` | 5 | 0 | 0 |
| `progressao.issue107.mongo.test.js` | 17 | 0 | 0 |
| `identidadeVinculo.issue94.mongo.test.js` | 29 | 0 | 0 |
| `jornadaIntegrada.issue94.mongo.test.js` | 27 | 0 | 0 |
| **Integrações afetadas** | **128** | **0** | **0** |
| `personagensPartidas.issue94.mongo.test.js`, adicional para exclusão de partidas | 28 | 0 | 0 |
| **Total MongoDB** | **156** | **0** | **0** |
| Regressão completa sem MongoDB | 1.036 | 0 | 45 |
| **Total das execuções finais** | **1.192** | **0** | **45** |

Contagens incluem agrupadores do Node. Não houve cancelamentos ou TODOs.
Os 45 ignorados são integrações opt-in na execução sem banco; nove dessas
suítes foram executadas separadamente com banco, conforme a tabela. Isso
não representa 45 pendências desta tarefa. As demais integrações, que não
registram respostas e não foram afetadas, não foram reexecutadas com banco.
A nova suíte `respostaTempo.issue107.mongo.test.js` já adaptada foi inventariada,
mas suas 36 aprovações da rodada anterior não são somadas a esta execução.

## Adaptações realizadas

- Criado `helpers/sessaoRespostaMongo.js`: preparação de sessões com o ciclo
  real dos Services, troca de partida mediante encerramento e novo início,
  e renovação quando a validade está próxima do fim. Essa preparação ocorre
  antes das respostas concorrentes e dos snapshots das rejeições.
- `helpers/jogo.js`: fornece `sessaoId` e mantém a transação externa real,
  descartada ao terminar. As novas queries de criança e a leitura da partida
  recebem essa mesma sessão. Não substitui resultados de consulta nem regras
  do Service. O teardown agora verifica o descarte também por outro cliente.
  Isso adapta os três consumidores sem alterar suas expectativas originais.
- `transacaoResposta.test.js`: prepara uma sessão por partida antes de lançar
  as requisições concorrentes; preserva commits reais, tentativas 1/2 e estrelas.
  Acrescentada verificação independente da limpeza.
- `concorrenciaPersonagens.mongo.test.js`: passa o sétimo argumento e prepara
  a sessão antes de armar as barreiras. A disputa entre duas respostas passa
  a observar a escrita real da criança, que agora antecede a reserva do perfil.
  Os cenários resposta versus arquivamento continuam observando o perfil.
  Preservados os asserts de espera por commit, abort, histórico e pontuação.
  Acrescentada verificação independente da limpeza.
- `progressao.issue107.mongo.test.js`: sessão efetiva para a partida inicial
  e troca legítima antes dos snapshots da outra partida. Mantidos os asserts
  de ausência de escritas nas rejeições de progressão e de independência por partida.
- `identidadeVinculo.issue94.mongo.test.js`: a fixture inicial com permissão
  false recebe um estado de sessão anteriormente autorizada, inserido somente
  na criança temporária conhecida. Não força o início real a aceitar permissão
  falsa. Após ativar a permissão, o início é feito pelo Service real. Rejeições
  continuam exigindo HTTP 403, nenhuma tentativa e nenhuma estrela adicional.
- `jornadaIntegrada.issue94.mongo.test.js`: cria, renova e troca sessões pelos
  endpoints HTTP reais, preservando os JWTs obtidos por login. O histórico
  continua comparado com todos os campos anteriormente esperados.

Nas quatro verificações de permissão, a expectativa antiga de imutabilidade
integral da criança foi atualizada para o contrato temporal aprovado: consumo
pendente e encerramento devem ser confirmados mesmo com HTTP 403. O novo helper
compara o snapshot completo de todos os Models com um resultado esperado exato:
somente referência diária, consumo, marcador, versão, estado e expiração da
criança alvo podem mudar. Usa um intervalo controlado de um segundo e verifica
explicitamente o consumo esperado, preservando todos os campos não temporais,
históricos, estrelas, posição, perfis e demais crianças. Nenhum campo é ignorado
genericamente na comparação. As demais rejeições mantêm os asserts de zero escrita.

## Incompatibilidade encontrada durante a adaptação

A primeira rodada conjunta apresentou 143 aprovações e 13 falhas, todas na
jornada: 12 subtestes e seu agrupador. Ao acrescentar `sessaoId` ao body, a
fixture passou a incluí-lo também na lista de campos que deveriam existir no
histórico. Esperava uma string e recebia `undefined`, pois esse campo não faz
parte do `HistoricoJogoModel`. A interrupção dos loops provocou falhas em cascata
nos totais e desbloqueios posteriores.

Correção exclusivamente de teste: separar o parâmetro de autorização dos
campos de histórico, sem remover nenhuma comparação anterior. A jornada foi
reexecutada isoladamente: 27 aprovações, nenhuma falha. Os outros 129 testes
MongoDB já haviam passado e permaneceram inalterados funcionalmente. O total
final de 156 usa o resultado final de cada suíte, sem somar a rodada com falhas
nem contar repetições. A regressão sem banco foi repetida após o ajuste final.

Nenhuma falha funcional de produção foi identificada. Não há pendências nas
oito integrações solicitadas. Permanecem verificadas respostas corretas e
incorretas, progressão por tarefa/dificuldade/cômodo, histórico de erros e
tentativas, estrelas por partida, isolamento entre crianças e personagens,
permissão, exclusão de partidas, commits, rollbacks e concorrência real.

## Arquivos modificados nesta etapa

1. `helpers/jogo.js`
2. `transacaoResposta.test.js`
3. `concorrenciaPersonagens.mongo.test.js`
4. `progressao.issue107.mongo.test.js`
5. `identidadeVinculo.issue94.mongo.test.js`
6. `jornadaIntegrada.issue94.mongo.test.js`

Criados: `helpers/sessaoRespostaMongo.js` e este relatório.
`personagensPartidas.issue94.mongo.test.js` foi executado sem modificação.
Os relatórios anteriores foram preservados como registros das rodadas anteriores;
as pendências de adaptação apontadas no relatório de respostas estão resolvidas
por esta execução.

## Isolamento e reprodução

Usados os helpers existentes que exigem `MONGO_TEST_URI` exclusivamente para
`conectamente_testes`, sem fallback para `MONGO_URI`. Somente IDs e chaves
exclusivas das fixtures desta execução foram usados na limpeza. Não houve
limpeza global de coleções, `dropDatabase` ou alteração de registros preexistentes.

Todas as suítes confirmaram zero resíduos por conexão independente, inclusive
as três que descartam a transação externa e as duas de concorrência/commit
que antes só verificavam a limpeza pela conexão principal. O descarte também
foi confirmado na rodada inicial com falhas de fixture.

```powershell
# A partir de backend. Ambiente aponta exclusivamente para conectamente_testes.
$env:RUN_ATLAS_TESTS = "1"
$env:RUN_COMMIT_REAL_TESTS = "1"
$env:RUN_CONCORRENCIA_REAL_TESTS = "1"
$integracoes107 = @(
  "tests/historicoJogo.test.js", "tests/comodos.test.js",
  "tests/personagemResposta.test.js", "tests/concorrenciaPersonagens.mongo.test.js",
  "tests/transacaoResposta.test.js", "tests/progressao.issue107.mongo.test.js",
  "tests/identidadeVinculo.issue94.mongo.test.js", "tests/jornadaIntegrada.issue94.mongo.test.js",
  "tests/personagensPartidas.issue94.mongo.test.js"
)
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap @integracoes107

# Reexecução após a correção da comparação do histórico na fixture.
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/jornadaIntegrada.issue94.mongo.test.js

# Regressão completa sem banco; não carrega .env.
$env:RUN_ATLAS_TESTS = "0"
$env:RUN_COMMIT_REAL_TESTS = "0"
$env:RUN_CONCORRENCIA_REAL_TESTS = "0"
node --test --test-concurrency=1 --test-reporter=tap
```

Comparação SHA-256 com o início da tarefa: somente seis arquivos JavaScript
de testes existentes foram alterados e um helper de testes foi criado.
Models, Services, Controllers e Routes permaneceram intactos, preservando as
alterações anteriores do usuário. Nenhuma dependência instalada; nenhum acesso
ao banco de desenvolvimento; nenhum commit ou push.
