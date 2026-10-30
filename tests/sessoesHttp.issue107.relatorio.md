# Issue #107 — Integração HTTP das sessões de jogo

Execução em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
Routes, Controllers, Services, Models, middlewares e padrões HTTP/persistência
existentes. Produção preservada; ajuste de compatibilidade restrito à suíte #62.

## Resultados após o ajuste autorizado da suíte #62

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| `erros.issue62.test.js`, isoladamente | 329 | 0 | 0 |
| HTTP sem banco: 49 cenários e agrupador | 50 | 0 | 0 |
| HTTP/MongoDB isolado: 49 cenários e agrupador | 50 | 0 | 0 |
| Regressão completa sem MongoDB | 1004 | 0 | 44 |

Os 49 cenários foram registrados, executaram requisições HTTP reais e passaram
em cada modo. As duas suítes específicas retornaram código 0. O agrupador é
contado pelo runner, por isso cada suíte informa 50 aprovações. Os específicos
sem banco já estão incluídos na regressão; não somar novamente.

A regressão descobriu 1.048 testes, sem cancelamentos ou TODOs. Todos os
comandos finais retornaram código 0. As sete falhas foram corrigidas com o
contrato aprovado, sem novas falhas ou regressões identificadas. Não houve
erro de carregamento de módulos nesta rodada. As 44 integrações
opt-in ficaram ignoradas na execução sem banco; a integração HTTP foi executada
separadamente, somente no banco de testes.

Histórico: antes da correção dos imports, as duas suítes novas falhavam no
bootstrap (0 aprovados e 1 falha em cada), e a regressão tinha 523 aprovados,
8 falhas e 42 ignorados. Os módulos voltaram a registrar seus testes internos;
a suíte #62 também descobre funções e códigos novos automaticamente. Isso
explica a mudança de quantidade, sem remoção ou alteração de testes.

Na rodada seguinte à correção dos imports, a regressão apresentou 997 aprovados
e sete falhas de expectativa na #62. Na execução isolada anterior, a #62 teve
322 aprovados e sete falhas. Após o ajuste atual, permanecem os mesmos 329 casos
da #62 e os mesmos 1.048 da regressão, sem casos removidos ou ignorados para
obter aprovação. Os 329 da #62 e os 50 HTTP sem banco já estão na regressão;
não somar suas contagens novamente.

## Erro anterior de carregamento — corrigido

O Controller atual mantém as cinco operações de jogos salvos no import de
`jogoSalvoService.js` e importa de `tempoJogoService.js` as quatro funções de sessão:

- `iniciarSessaoJogo`;
- `renovarSessaoJogo`;
- `pausarSessaoJogo`;
- `encerrarSessaoJogo`.

Na rodada anterior, as funções de sessão eram importadas do módulo errado e
o carregamento do Controller e do router falhava com:

```text
SyntaxError: The requested module '../services/jogoSalvoService.js'
does not provide an export named 'encerrarSessaoJogo'
```

A correção manual foi conferida e os routers reais agora carregam. O import
de sessão observado é:

```js
import {
  iniciarSessaoJogo,
  renovarSessaoJogo,
  pausarSessaoJogo,
  encerrarSessaoJogo,
} from "../services/tempoJogoService.js";
```

Nenhum import foi substituído em memória nas suítes HTTP. O caminho real
Routes → middlewares → Controllers → Services → Models foi executado; na
integração, a persistência também foi real. Nenhuma mudança de produção foi
feita pelo Codex.

## Sete falhas anteriores da #62 — corrigidas nos testes

Comparação histórica das sete divergências em `tests/erros.issue62.test.js`,
para `jogoSalvoController.js`. O status obtido abaixo agora é também o esperado:

| Caso | Esperado pela #62 | Obtido |
|---|---:|---:|
| `iniciarSessao`: sucesso preservado | 200 | 201 |
| `SESSAO_INVALIDA` | 400 | 409 |
| `SESSAO_INATIVA` | 403 | 409 |
| `SESSAO_EXPIRADA` | 400 | 409 |
| `SESSAO_JA_ATIVA` | 400 | 409 |
| `CONFLITO_SESSAO` | 400 | 409 |
| `LIMITE_TEMPO_ATINGIDO` | 400 | 403 |

As falhas eram asserções incompatíveis, não erros de ligação ESM. A causa era
a inferência de sucesso pelo prefixo da função, que classificava `iniciarSessao`
como 200, e a inferência de erros por expressões regulares. `SESSAO_INATIVA`
caía em 403 por conter INATIVA e os demais códigos citados caíam no padrão 400.

O ajuste autorizado mantém essas heurísticas para os outros Controllers e
códigos. Para `jogoSalvoController.js`, há uma exceção explícita de sucesso
201 para `iniciarSessao` e uma tabela independente de contratos para seis erros:

| Código | Handler exercitado | Status | Mensagem verificada |
|---|---|---:|---|
| `SESSAO_INVALIDA` | `renovarSessao` | 409 | A sessão de jogo não está disponível |
| `SESSAO_INATIVA` | `pausarSessao` | 409 | A sessão de jogo não está disponível |
| `SESSAO_EXPIRADA` | `renovarSessao` | 409 | A sessão de jogo não está disponível |
| `SESSAO_JA_ATIVA` | `iniciarSessao` | 409 | Já existe uma sessão de jogo ativa |
| `CONFLITO_SESSAO` | `encerrarSessao` | 409 | Não foi possível atualizar a sessão |
| `LIMITE_TEMPO_ATINGIDO` | `iniciarSessao` | 403 | O limite de tempo diário foi atingido |

Cada erro exige o corpo completo `{ erro: true, mensagem, codigo }`, com código
exato e sem campos extras. O teste também exige uma única chamada ao Service,
com o ID do usuário e o ID de partida ou sessão apropriado. Esses casos deixam
de usar o fallback que antes escolhia um handler de CRUD para testar o auxiliar
de erros compartilhado.

Os seis códigos explícitos entram na lista de testes mesmo se forem removidos
das comparações textuais do Controller: nesse caso, a resposta 500 ou outro
status reprovará a expectativa, em vez de desaparecer o teste. A tabela não é
gerada a partir do status observado em produção.

Foram preservados os demais contratos: validação 400, autenticação 401,
permissão e progressão 403, registros inacessíveis 404 e erros inesperados
sanitizados 500. Em particular, `PERMISSAO_INATIVA` continua 403; a exceção 409
é de `SESSAO_INATIVA`, sem alterar a classificação genérica dos outros códigos.
Não houve refatoração geral dos mocks, heurísticas ou descoberta de Controllers.

## Cenários executados e aprovados

O helper compartilhado executou 49 casos em cada modo:

- Os quatro endpoints sem JWT, com JWT inválido e com perfil responsável;
  preservação do consumo nas rejeições.
- Início 201, UUID, partida, consumo, validade e segunda inicialização 409.
- Duas inicializações HTTP simultâneas, exigindo uma vencedora e um bloqueio.
- Heartbeat 200 após dez segundos, expiração atualizada e repetição sem duplicar.
- Sessão expirada 409 e persistência do consumo somente até a validade.
- Pausa e encerramento 200, consumo pendente, interrupção e heartbeat posterior
  rejeitado sem novos segundos.
- Body ausente e `sessaoId` ausente, null, número, vazio ou objeto nos três PATCHs.
- Criança tentando alterar sessão de outra, com comparação dos dois documentos.
- Limite atingido e permissão inativa 403 no início e no heartbeat.
- Três conflitos de versão em início, heartbeat, pausa e encerramento, exigindo
  409 `CONFLITO_SESSAO` com mensagem e código padronizados.
- Partida inválida 400, inexistente ou alheia 404.
- GET de lista e por ID, GET de progresso e histórico, POST/PATCH/DELETE antigos,
  verificando que continuam chegando aos handlers corretos.

As expectativas de status e mensagens seguem o Controller e middlewares atuais,
sem substituir o comportamento real por respostas prontas de Service. Os casos
de `sessaoId` inválido esperam o 409 atualmente definido no Controller, não um
400 presumido. Os contratos de resposta foram confirmados com requisições HTTP.

## Rotas, autenticação e autorização — execução confirmada

`routes/jogoSalvoRoutes.js` aplica `router.use(autentificar)` e depois
`router.use(autorizarPerfil("crianca"))` antes das rotas novas e antigas.
Os testes confirmaram que esses middlewares rejeitam falta de JWT, token
inválido e perfil responsável nos quatro endpoints, com os códigos e mensagens
do projeto, preservando o estado da criança nas rejeições.

As rotas de sessão são declaradas antes das rotas por ID. Os PATCHs
`/sessao/heartbeat`, `/sessao/pausar` e `/sessao/encerrar` têm dois segmentos;
o PATCH `/:id` tem apenas um. GETs por ID, progresso e histórico usam verbos
e/ou segmentos distintos do POST `/:id/sessao`. Não foi identificado conflito
de correspondência por inspeção. Os testes com o router real agora confirmaram
que sessões, consultas por ID, progresso, histórico e CRUD antigos chegam aos
handlers corretos nos cenários executados.

O Controller tem os mapeamentos esperados por inspeção: 201 no início, 200 nas
demais operações, 403 para limite/permissão e 409 para conflitos/indisponibilidade
de sessão, com `erro`, `mensagem` e `codigo`. Esses status e corpos foram
confirmados por HTTP. A execução cobriu também apenas uma inicialização
vencedora em duas requisições simultâneas, encerramento de sessão expirada e
interrupção do consumo após pausa/encerramento.

## Padrões, isolamento e limites desta execução

Criados na etapa anterior e reutilizados sem alteração:

- `tests/sessoesHttp.issue107.test.js`.
- `tests/sessoesHttp.issue107.mongo.test.js`.
- `tests/helpers/sessoesHttpIssue107.js`.
- Este relatório, atualizado nesta reexecução.

Nesta etapa foram modificados somente `tests/erros.issue62.test.js` e este
relatório. As suítes HTTP e seus helpers foram reutilizados sem alteração;
nenhum arquivo novo foi criado permanentemente.

A suíte sem banco reaproveita `helpers/jogoSalvoMock.js`, com Services e routers
reais e I/O simulado. Sua extensão trata as atualizações condicionais de versão
da criança, sem modificar o helper antigo. Não comprova atomicidade MongoDB.

A suíte de integração exige `RUN_ATLAS_TESTS=1`, `RUN_COMMIT_REAL_TESTS=1` e
`MONGO_TEST_URI` restrita a `conectamente_testes`, usando as guardas existentes.
Foi concluída com essas flags e configuração, usando somente o banco isolado.
Houve HTTP real, queries, populate, validação e persistência das fixtures.
O diagnóstico `Zero resíduos HTTP confirmados por conexão independente` foi
emitido no teardown. Nenhum documento preexistente foi alterado.

Foram usados JWTs temporários, HTTP local em porta
efêmera, queries/populate/validação reais, leitura por cliente independente,
IDs registrados antes de inserir e limpeza restrita às fixtures. Partidas
geradas pelo endpoint antigo também têm seus IDs registrados antes da escrita.
Conflitos são induzidos por outro cliente somente na fixture alvo, deixando
o driver executar o filtro real. A execução confirmou três conflitos até o
retorno HTTP 409 nos quatro endpoints. As conexões e o servidor foram fechados.

Não foi feita avaliação de frontend nem nova auditoria completa das regras
internas de tempo. O alcance é dos cenários HTTP existentes e da regressão
executada. Não foi identificada nova falha funcional de endpoint ou regressão.
As incompatibilidades de expectativa da #62 foram corrigidas. HTTP com banco
continua separado dos mocks da suíte #62 e comprovou persistência e limpeza.
Não há problema funcional restante identificado no escopo solicitado.

## Reprodução

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/erros.issue62.test.js
node --test --test-concurrency=1 --test-reporter=tap tests/sessoesHttp.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='1'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/sessoesHttp.issue107.mongo.test.js
```

Hashes dos arquivos JavaScript preexistentes conferidos contra o início da
etapa: somente `tests/erros.issue62.test.js` mudou. Models, Services, Controllers,
Routes e demais testes permaneceram intactos. Nenhuma instalação, commit ou push.
Somente o MongoDB isolado de testes foi acessado; o banco de desenvolvimento
não foi acessado. Logs temporários removidos após documentar os resultados.
