# Issue #107 — Registro de respostas com controle de tempo

Validação em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.
Consultados os documentos de contexto e arquitetura, Controller de histórico,
Services de histórico, tempo e progressão, Models, Routes e testes existentes.

## Resultados efetivamente executados

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Novos testes sem banco: `respostaTempo.issue107.test.js` | 26 | 0 | 0 |
| Novos testes com MongoDB: 35 cenários e um agrupador | 36 | 0 | 0 |
| Regressão completa sem MongoDB | 1.036 | 0 | 45 |
| Novos testes sem banco com `TZ=UTC` | 26 | 0 | 0 |
| Novos testes sem banco com `TZ=Asia/Tokyo` | 26 | 0 | 0 |

A execução específica inicial, reunindo a nova suíte sem banco e a issue #73,
teve 64 aprovações. A regressão final contou 1.081 testes, sem cancelamentos ou
TODOs. Os 26 novos testes locais já estão incluídos nas 1.036 aprovações;
repetições por fuso não devem ser somadas como cenários distintos.
As integrações opt-in são ignoradas na regressão sem banco. A nova integração
foi executada separadamente, habilitada exclusivamente para `conectamente_testes`.

## Cobertura e evidências

Os mesmos 24 casos básicos são executados com persistência simulada e real:

- Acerto válido: HTTP 201, uma tentativa, uma estrela na dificuldade fácil;
  erro válido: HTTP 201, tentativa preservada e nenhuma estrela.
- Ausência de `sessaoId`, identificador inexistente e vínculo com outra partida:
  HTTP 409, sem gravar consumo, histórico, perfil ou partida.
- Sessões pausada e encerrada: HTTP 409 `SESSAO_INATIVA`, sem alterações.
- Sessão expirada: HTTP 409 `SESSAO_EXPIRADA`; consumo confirmado somente
  até a expiração, com sessão encerrada e nenhuma tentativa ou estrela.
- Limite previamente esgotado e limite alcançado durante a reconciliação:
  HTTP 403 `LIMITE_TEMPO_ATINGIDO`, confirmando o consumo e o encerramento.
- Permissão revogada: HTTP 403, consumo pendente confirmado, sem tentativa.
- Limite `null`: aceita a resposta e continua contabilizando segundos.
- Meia-noite de São Paulo: renova a referência diária, contabilizando somente
  o trecho do novo dia, inclusive quando a primeira operação ocorre após expirar.
- Origem futura, origem/expiração ausentes, `null` ou inválidas: HTTP 409
  `SESSAO_INVALIDA`, encerramento sem inventar segundos e sem resultados `NaN`.
- Ordem de tarefas, pré-requisito da dificuldade média e desbloqueio do próximo
  cômodo continuam bloqueando respostas; esses erros de progressão permanecem
  anteriores à abertura da transação, como no código atual.

Exemplos de entradas e resultados reais, com referência inicial de 29/10/2026:

| Entrada e instante da resposta | Esperado e obtido |
|---|---|
| Consumo 12 s; origem 15:00:00Z; expiração 15:00:30Z; resposta 15:00:10Z | 22 s, HTTP 201, expiração preservada |
| Mesma sessão; resposta 15:00:40Z | 42 s, HTTP 409, encerrada, nenhum histórico |
| Consumo 50 s; limite 1 min; resposta após 10 s | 60 s persistidos, HTTP 403, encerrada, nenhuma estrela |
| Consumo 60 s; validade ainda futura; mais 10 s pendentes | 70 s persistidos, HTTP 403; o consumo observado não é truncado ao limite |
| Permissão falsa; consumo 12 s; mais 10 s pendentes | 22 s persistidos, HTTP 403, encerrada |
| Origem 30/10 02:59:50Z; expiração 03:00:20Z; resposta 03:00:10Z | Referência 30/10, consumo 10 s |
| Mesmo intervalo; resposta 04:00:00Z | Referência 30/10, consumo 20 s, HTTP 409 |
| Origem ou expiração ausente/inválida; consumo anterior 12 s | Preserva 12 s, encerra e rejeita |

Os 11 cenários reais adicionais verificam:

1. Sessão de outra criança rejeitada, preservando integralmente ambas as crianças.
2. Erro seguido de acerto: tentativas 1 e 2, uma estrela e consumo de 27 s,
   sem repetir os dez segundos já reconciliados.
3. Um e dois conflitos reais provocados por outra conexão: o MongoDB emite
   conflito de escrita e o driver repete o callback com leitura atualizada.
   Consumo concorrente de 18 s, contabilizado até o segundo 5, resulta em
   23 s no segundo 10; apenas um histórico e uma estrela são confirmados.
4. Resposta concorrente com heartbeat, pausa e encerramento, nas duas ordens
   de gravação, usando barreiras e operações reais do banco. Em todos os casos
   o consumo final é 22 s. Se pausa/encerramento vencerem, a resposta retorna
   409 e não gera histórico ou estrelas; se a resposta vencer, sua tentativa
   é preservada e a interrupção posterior é respeitada.
5. Falha inesperada na criação do histórico, após atualizar criança, perfil
   e partida: HTTP 500 sanitizado e rollback integral de consumo, versão,
   marcador, última interação do perfil, posição da partida e estrelas.

Cada resposta que alcança a persistência chama `mongoose.startSession()` uma
vez e `withTransaction()` uma vez, sem transação aninhada. Nos conflitos,
o callback foi executado duas ou três vezes pelo driver; isso representa
novas tentativas transacionais, não uma segunda transação criada pelo Service.
As sessões MongoDB foram encerradas. O teste local também força retorno `null`
da atualização condicional e confirma HTTP 409 `CONFLITO_SESSAO`, sem gravações.
O mock não é usado como prova de rollback ou de isolamento real.

## Compatibilidade dos testes anteriores

A regressão antes das adaptações apresentou 969 aprovações, 40 falhas,
um cancelamento e 44 ignorados. Foram corrigidos os adapters e contratos
dos testes, preservando suas verificações de progressão, autorização,
tentativas, estrelas e erros sanitizados:

- Fixtures sem `sessaoId` recebiam `SESSAO_INVALIDA` antes de alcançar a regra
  originalmente testada. Agora fornecem uma sessão válida para a partida.
- Mocks antigos não atendiam à leitura `.session(session)` nem à atualização
  condicional de `Crianca`. Foram adaptados ao protocolo atual.
- A issue #73 esperava duas atualizações na transação; agora verifica três:
  consumo, perfil e partida. Mantém a exigência de usar a mesma sessão.
- O caso de permissão da #73 combinava partida alheia e permissão falsa.
  Agora usa partida própria para testar a permissão; a rejeição de partida
  alheia continua sendo verificada separadamente.
- A #62 aplicava heurísticas antigas aos novos erros do Controller de histórico.
  Os seis códigos temporais passaram a ter expectativas explícitas de handler,
  status, mensagem, `codigo` e argumentos. Os contratos antigos permanecem.
- Quatro verificações dos exports esperavam `finalizarSessaoJogo` público.
  O contrato atual mantém esse auxiliar privado e exporta
  `reconciliarSessaoParaResposta`; somente essas listas foram atualizadas.

Arquivos anteriores alterados nesta etapa:

- `helpers/jogoSalvoMock.js`
- `concorrenciaPersonagens.mock.test.js`
- `historicoJogoController.unit.test.js`
- `perfilJogo.test.js`
- `jogoSalvo.issue73.test.js`
- `erros.issue62.test.js`
- `tempoJogoAuxiliares.issue107.test.js`
- `tempoJogoConsumo.issue107.test.js`
- `tempoJogoCondicional.issue107.test.js`
- `tempoJogoInicio.issue107.test.js`

Arquivos criados:

- `respostaTempo.issue107.test.js`
- `respostaTempo.issue107.mongo.test.js`
- `helpers/respostaTempoIssue107.js`
- Este relatório.

## Limitações e recomendações

Nenhuma falha funcional foi reproduzida na integração atual nos cenários executados.

Há fixtures antigas de integração que ainda enviam respostas sem `sessaoId`:
`helpers/jogo.js` (usado pelas suítes antigas), `transacaoResposta.test.js`,
`progressao.issue107.mongo.test.js` e `jornadaIntegrada.issue94.mongo.test.js`.
Essas suítes não foram executadas com MongoDB nesta etapa e não devem ser
consideradas aprovadas com banco. Recomenda-se preparar sessões efetivas,
associadas à partida correta, antes das respostas e renovar/trocar a sessão
quando necessário. As suítes que abrem uma transação externa também precisam
rever suas fixtures para que a consulta do Service enxergue documentos
confirmados, mantendo suas expectativas originais de rollback e concorrência.
Essa é uma incompatibilidade identificada por leitura, não uma falha real
executada nesta rodada.

O Controller mantém mensagens diferentes entre histórico e gerenciamento de
sessões. `PERMISSAO_INATIVA` no histórico retorna o formato anterior, sem
`codigo`; os novos erros temporais retornam `codigo`. Os testes verificam
exatamente esse contrato atual, sem presumir padronização ainda não implementada.

Não é necessária correção de produção com base nas evidências desta rodada.

## Isolamento, execução e preservação

A integração utiliza os helpers de segurança existentes, valida o banco
`conectamente_testes`, registra IDs antes das inserções e limpa somente seus
documentos. A limpeza de criança, perfil, partida, catálogo e históricos foi
confirmada por outra conexão: zero resíduos. Não usa banco de desenvolvimento,
`dropDatabase`, limpeza geral de coleções ou alterações em documentos preexistentes.

Comandos no PowerShell, a partir de `backend`:

```powershell
# Regressão sem banco; não carrega .env.
$env:RUN_ATLAS_TESTS = "0"
$env:RUN_COMMIT_REAL_TESTS = "0"
$env:RUN_CONCORRENCIA_REAL_TESTS = "0"
node --test --test-concurrency=1 --test-reporter=tap

# Nova integração; MONGO_TEST_URI deve apontar para conectamente_testes.
$env:RUN_ATLAS_TESTS = "1"
$env:RUN_COMMIT_REAL_TESTS = "1"
$env:RUN_CONCORRENCIA_REAL_TESTS = "0"
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/respostaTempo.issue107.mongo.test.js

# Repetições específicas sem banco, em processos separados.
$env:RUN_ATLAS_TESTS = "0"
$env:RUN_COMMIT_REAL_TESTS = "0"
$env:TZ = "UTC"
node --test --test-concurrency=1 --test-reporter=tap tests/respostaTempo.issue107.test.js
$env:TZ = "Asia/Tokyo"
node --test --test-concurrency=1 --test-reporter=tap tests/respostaTempo.issue107.test.js
```

A comparação SHA-256 com o início desta tarefa confirmou que nenhum arquivo
JavaScript de produção foi alterado. Alterações locais anteriores do usuário
foram preservadas. Nenhuma biblioteca instalada, nenhum commit ou push.
