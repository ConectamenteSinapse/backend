# Issue #107 — Início efetivo da sessão

Execução em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
`tempoJogoService.js`, `criancaModel.js` e os padrões existentes de Services,
fixtures, mocks, concorrência e isolamento MongoDB.

Este relatório substitui, para o código atual, o diagnóstico da etapa de
preparação em `tempoJogoInicio.issue107.relatorio.md`. O relatório anterior foi
preservado como registro histórico: a função agora persiste o início e o
consumo no bloqueio, em vez de apenas retornar a preparação.

## Resultados efetivos

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Testes específicos sem MongoDB, atualizados e ampliados | 45 | 0 | 0 |
| MongoDB isolado: 24 cenários e um agrupador | 25 | 0 | 0 |
| Regressão completa sem MongoDB | 856 | 0 | 42 |

Os 45 específicos estão incluídos nos 856 aprovados da regressão. A regressão
descobriu 898 testes, sem cancelamentos ou TODOs. A contagem de ignorados passou
de 41 para 42 pelo novo agrupador de integração opt-in. Todos os comandos finais
retornaram código 0.

Antes de atualizar os testes da etapa de preparação, os 39 casos antigos
produziram 22 aprovações e 17 falhas. Eram incompatibilidades comprovadas com a
mudança de contrato: o mock proibia qualquer atualização, esperava o retorno
`{ crianca, jogoSalvo, novoConsumo, agora }` e exigia validar permissão antes de
consultar a partida. A implementação atual valida primeiro a partida e retorna
os dados da sessão persistida. O teste diagnóstico que confirmava consumo não
gravado no bloqueio foi substituído pela exigência de persistência desse consumo.

Os casos anteriores de autorização, expiração, calendário e saldo foram
reaproveitados. Foram acrescentados seis casos unitários de saldo curto e
retries. Não houve alteração de expectativas para aceitar defeito de produção.

## Resultados por regra

| Cenário | Resultado comprovado |
|---|---|
| Permissão ativa e partida própria válida | Persiste UUID v4, partida vinculada, estado ativo, instantes, consumo e incremento de versão; retorno corresponde ao documento gravado |
| Criança inexistente | `CRIANCA_NAO_ENCONTRADA`, sem alteração das fixtures existentes |
| Permissão false ou null | `PERMISSAO_INATIVA`, sem atualização |
| Partida inválida, inexistente ou de outra criança | Rejeição antes de alterar consumo; documentos envolvidos preservados |
| Personagem arquivado ou ausente | Continua rejeitado no Service real de partidas, com leitura simulada na suíte unitária |
| Sessão ativa e válida | `SESSAO_JA_ATIVA`, sem substituir sessão nem incrementar versão |
| Sessão expirada | Reconcilia até a expiração, cria nova sessão e incrementa versão uma vez |
| Limite null | Consumo elevado permitido; validade de 30 segundos |
| Consumo já no limite | Grava estado encerrado e expiração null antes de lançar `LIMITE_TEMPO_ATINGIDO` |
| Pendência atinge ou ultrapassa limite | Grava o total reconciliado antes do erro; nova tentativa não duplica segundos |
| Apenas 5 ou 10 segundos disponíveis | Nova expiração é agora + 5 ou + 10 segundos, respectivamente |
| Meia-noite de São Paulo | Renova consumo do dia anterior, permitindo novo início |
| Sessão atravessa meia-noite e já expirou | Conserva os 20 segundos do dia novo, mesmo quando a primeira operação ocorre depois da expiração |
| Documento antigo sem versão e campos de sessão físicos | Filtro aceita ausência real no BSON e cria sessão com versão 1 |
| Duas inicializações simultâneas, versão zero ou ausente | Apenas uma inicia; a outra encontra conflito, relê e retorna `SESSAO_JA_ATIVA` |
| Conflito seguido de releitura | Recalcula a partir do consumo e marcador concorrentes, usando a nova versão |
| Releitura revela limite atingido | Reconcilia e persiste antes de rejeitar, inclusive após conflito |
| Releitura revela sessão válida criada por outra requisição | Interrompe a repetição sem outra tentativa de escrita |
| Três conflitos sucessivos | Retorna `CONFLITO_SESSAO`, sem quarto envio nem início indevido |

## Consumo preservado quando o início é bloqueado

Entrada representativa, com permissão ativa e partida própria:

```js
{
  limiteTempoDiario: 1,
  tempoUsadoHoje: 30,
  dataReferenciaTempo: "2026-10-29",
  sessaoJogoEstado: "ativa",
  sessaoJogoContabilizadoEm: new Date("2026-10-29T15:00:00Z"),
  sessaoJogoExpiraEm: new Date("2026-10-29T15:00:30Z"),
  sessaoJogoVersao: 0
}
// Relógio: 2026-10-29T15:00:40Z.
```

Esperado e obtido: `LIMITE_TEMPO_ATINGIDO` após gravar consumo 60, marcador
15:00:30Z, estado encerrado, expiração null e versão 1. A conexão independente
confirma a gravação apesar da rejeição. Repetir a tentativa mantém o consumo
60 e incrementa a versão para 2, sem duplicar a pendência.

A lacuna observada na etapa anterior foi resolvida nos cenários executados.
O identificador e a partida antigos permanecem no documento encerrado: não
foi criado outro identificador, e o estado encerrado com expiração null impede
que esses campos representem uma nova sessão ativa.

## Concorrência real e recálculo

Nas duas inicializações simultâneas, uma barreira antes do driver garante que
as duas propostas foram preparadas com a mesma versão antes das escritas.
Depois da barreira, ambas as chamadas alcançam o MongoDB real. Exatamente uma
atualização corresponde ao filtro; a outra relê e detecta a sessão válida.
O documento final tem somente um incremento de versão e o UUID do vencedor.

Para induzir conflito de forma determinística, outro cliente MongoDB modifica
somente a fixture alvo antes de executar a primeira escrita condicional do
Service. Nenhum resultado do driver é falsificado. Exemplo:

- Estado inicial: consumo 12, marcador 15:00:00Z, expiração 15:00:30Z.
- Escrita concorrente: consumo 20, marcador 15:00:10Z e versão incrementada.
- Proposta inicial de 42 segundos perde por versão desatualizada.
- Releitura calcula 20 + 20 = 40 segundos e inicia com a versão seguinte.

Com base concorrente 40 em vez de 20, a releitura calcula 60 e persiste o
bloqueio. Se o código reutilizasse o total inicial ou o snapshot antigo, esses
testes falhariam.

O teste de três conflitos incrementa a versão da fixture por outro cliente
antes de cada uma das três tentativas reais. O Service não inicia a sessão;
consumo e demais campos permanecem iguais. Somente os incrementos do escritor
concorrente ficam persistidos. O unitário também verifica a quantidade de
consultas e que o relógio é novamente obtido após um conflito.

## Estratégia e preservação

`tempoJogoInicio.issue107.test.js` mantém Services originais e leitura/atualização
simuladas na fronteira `Query.exec`, com documentos hidratados e validação de
fixtures. O mock permite somente consulta e atualização condicional da criança,
verifica filtro de versão, `$inc`, opções e lista de campos atualizáveis.
Não simula bloqueios ou transações MongoDB como prova de atomicidade.

`tempoJogoInicio.issue107.mongo.test.js` importa o Service público sem
instrumentação. Executa queries, populate, validadores, filtros e persistência
reais, sem transação externa. As únicas interceptações de I/O são barreiras ou
escritas concorrentes controladas antes do driver, que em seguida executa a
operação original. Datas são controladas com timers nativos.

As fixtures legadas são inseridas pelo driver nativo para não preencher
defaults. Uma leitura bruta confirma ausência física de versão. Comparações
integrais por conexão independente verificam preservação dos demais campos
da criança, inclusive campo legado fora do schema, personagens e partidas.
Nos bloqueios por autorização ou sessão válida, documentos são comparados
antes/depois. JWT/HTTP não foram adicionados nesta etapa de Service; a regressão
existente continua cobrindo autenticação e endpoints já implementados.

Integrações usam exclusivamente `conectamente_testes`, via `MONGO_TEST_URI` e
guardas existentes. IDs são registrados antes de inserir. O teardown remove
somente as crianças, personagens e partidas desta execução e exige zero
resíduos, conferidos por outra conexão/cliente. Não cria índices, não apaga
coleções e não altera dados preexistentes ou banco de desenvolvimento.

## Falhas, avisos e limites

Nenhuma falha funcional encontrada nos cenários executados; nenhuma correção
de produção necessária para esses testes. O Mongoose continua emitindo aviso
de depreciação de `new: true`; `returnDocument: 'after'` é a alternativa indicada
pelo aviso. Trata-se de manutenção futura, sem falha nesta execução.

Heartbeat, pausa/retomada, encerramento por uma operação própria e integração
com o registro de respostas não são validados como funcionalidades completas
por estes testes de início. A contagem de tempo futuro e a renovação posterior
da validade dependem desses fluxos. Não confundir sucesso no início com
validação de todo o ciclo de vida da sessão.

## Reprodução

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoInicio.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='1'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoInicio.issue107.mongo.test.js
```

Arquivo modificado: `tests/tempoJogoInicio.issue107.test.js`.
Criados: `tests/tempoJogoInicio.issue107.mongo.test.js` e este relatório.
Produção e demais arquivos JavaScript de testes conferidos por hashes contra
o início da etapa. Nenhuma dependência instalada, commit ou push. Logs
temporários removidos após a análise.
