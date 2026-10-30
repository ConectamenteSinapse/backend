# Issue #107 — Atualização condicional do consumo diário

Execução em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
Service e Model atuais, suítes de tempo e helpers de isolamento e concorrência.
Produção permanece implementada pelo aluno; esta etapa acrescenta somente
testes e diagnóstico.

## Resultados efetivos

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Unitários de atualização condicional | 14 | 0 | 0 |
| MongoDB isolado: 16 cenários e um agrupador | 17 | 0 | 0 |
| Regressão completa sem MongoDB | 811 | 0 | 41 |

As contagens incluem agrupadores. Os 14 unitários já estão nos 811 da
regressão; não somar novamente. A regressão descobriu 852 testes, sem
cancelamentos ou TODOs. Os 797 testes anteriormente aprovados continuam
aprovados. O novo agrupador de integração acrescenta um ignorado à execução
sem banco, que antes tinha 40.

A primeira tentativa de integração no ambiente com rede restrita falhou
durante a abertura da conexão: 0 aprovados, 1 falha no agrupador, nenhum cenário
de negócio executado. Mensagem: `Conexão de integração recusada para
conectamente_testes`. A execução autorizada fora da restrição de rede concluiu
com código 0 e os 17 testes aprovados. Essa falha inicial de infraestrutura
não demonstrou defeito no Service.

## Comportamentos comprovados

| Cenário | Resultado |
|---|---|
| Versão fisicamente ausente, snapshot simples | Atualiza e cria versão 1 |
| Versão ausente no BSON, documento hidratado com default zero | Atualiza e cria versão 1 |
| Versão zero | Atualiza e retorna versão 1 |
| Versão positiva 7 | Atualiza e retorna versão 8 |
| Atualizações consecutivas válidas | Cada sucesso incrementa a versão exatamente uma vez |
| Duas propostas concorrentes com a mesma versão ausente/zero/7 | Exatamente um documento retornado e um `null`; persistência contém integralmente a proposta vencedora |
| Reenvio da proposta perdedora ou versão zero desatualizada | Retorna `null`, preservando consumo, marcador, versão e todos os demais campos |
| Releitura após conflito e novo cálculo | Soma somente o intervalo novo: 10 s, depois 20 s no total |
| Novo cálculo no mesmo instante após releitura | Mantém 20 s, sem duplicar; sucesso ainda incrementa a versão |
| Consumo negativo -1 ou -0.001 | `ValidationError` no campo `tempoUsadoHoje`; documento persistido integralmente preservado |
| Consumo zero e fracionário | Aceitos; frações verificadas com Mongoose real e driver simulado no unitário |
| Campos extras no argumento de consumo | Não alteram identidade, vínculos, permissão, limite ou estado da sessão |
| Outra criança | Documento permanece integralmente preservado durante atualização e conflito da fixture alvo |
| Limite de 1 minuto, consumo 59 + 10 segundos | Persiste 69 segundos sem truncamento nem bloqueio |
| Limite null, consumo 59 + 10 segundos | Persiste 69 segundos normalmente |

Nas disputas reais, ambos os snapshots são lidos antes de iniciar as duas
escritas com `Promise.all`. As propostas usam totais diferentes (22 e 32 s)
e marcadores diferentes, permitindo identificar o vencedor sem pressupor a
ordem de execução. O documento lido pela segunda conexão é comparado por
inteiro com a proposta vencedora; uma nova tentativa perdedora também é
comparada com o estado anterior ao conflito.

## Documentos antigos sem campos de sessão

As fixtures legadas são inseridas pelo driver nativo, sem aplicar defaults.
Antes de chamar o Service, a leitura bruta confirma a ausência física dos
campos. Isso evita confundir o default zero hidratado pelo Mongoose com o
estado realmente armazenado no MongoDB.

No cenário sem nenhum campo de sessão, o documento hidratado recebe estado
encerrado, versão zero e marcador null. O cálculo mantém o consumo diário
existente de 12 s, e a atualização condicional grava os três campos do consumo
e versão 1. O marcador null passa a existir; estado, identificador da sessão,
partida e expiração continuam fisicamente ausentes. Os demais campos brutos,
inclusive um campo legado fora do schema, são preservados.

O documento retornado pelo Mongoose pode apresentar defaults que continuam
ausentes no BSON. Por isso, a preservação física é verificada com o driver
nativo e por uma conexão independente, não somente pelo objeto retornado.

## Escopo dos unitários e da integração

Os unitários conferem filtro por `_id` e versão, compatibilidade de zero com
campo ausente, `$set` limitado aos três campos, `$inc` de uma unidade,
`new: true`, `runValidators: true`, retorno de `null`, propagação de erros sem
retry e ausência de mutação dos argumentos.

Os testes de valores negativos executam casting e validação de atualização
reais do Mongoose; falham se o driver for alcançado. Para valores válidos,
somente a chamada ao driver é simulada. A atomicidade e a persistência não são
inferidas desses mocks: são verificadas separadamente no MongoDB real.

As funções privadas são expostas apenas na cópia do módulo em memória com
`registerHooks`, seguindo as suítes de tempo existentes. O hook é removido
em `finally`; o corpo original e os imports permanecem intactos. Os exports
públicos são conferidos sem instrumentação. Nos unitários, conexões e sessões
MongoDB são bloqueadas.

## Isolamento e limpeza

A integração exige `RUN_ATLAS_TESTS=1`, `RUN_COMMIT_REAL_TESTS=1` e
`MONGO_TEST_URI` validada pelos helpers existentes, exclusivamente no banco
`conectamente_testes`. Não existe fallback para `MONGO_URI`.

Não usa transação externa que esconderia a disputa real. Os IDs são
registrados antes de inserir; leituras e chamadas de atualização das fixtures
são limitadas a esses IDs. Os vínculos usam identificadores fictícios: esta
suíte valida consumo, não autenticação ou existência de usuários relacionados.
Não cria índices, coleções auxiliares ou dados de catálogo. Não há alteração
de documentos preexistentes.

O teardown remove somente as crianças criadas nesta execução, usando
`limparRegistrosTeste`, e confirma zero resíduos por conexão independente.
As duas conexões usam clientes diferentes e são encerradas. O diagnóstico
`Ausência de resíduos confirmada por conexão independente` foi emitido.

## Problemas e limites restantes

Nenhuma falha funcional foi encontrada nos cenários solicitados. Não houve
necessidade de recomendar correção de produção para aprovar estes testes.

O Mongoose emite aviso de depreciação de `new: true`, já observado no projeto;
`returnDocument: 'after'` é a alternativa indicada pelo aviso. Isso não causou
falha e não foi alterado nesta etapa.

O bloqueio ao atingir o limite continua fora desta função. Persistir 69 s com
limite de 60 s é caracterização do comportamento atual, não validação de uma
autorização para continuar jogando. Autorização, pausa, heartbeat e bloqueio
antes de registrar respostas precisam de integração própria quando esses
fluxos forem implementados.

O controle de versão impede uma segunda escrita baseada na mesma versão;
não faz retry nem recalcula sozinho. Um futuro chamador deve reler o documento
e recalcular após conflito, como simulado no teste de releitura. A função
recebe um novo total calculado, não um delta a incrementar no consumo.

## Reprodução

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoCondicional.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

Integração isolada, com a configuração de testes já existente:

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='1'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoCondicional.issue107.mongo.test.js
```

Arquivos criados: `tempoJogoCondicional.issue107.test.js`,
`tempoJogoCondicional.issue107.mongo.test.js` e este relatório, todos em
`tests/`. Hashes dos arquivos JavaScript preexistentes de produção e testes
conferidos contra o início da etapa. Nenhuma alteração de produção, instalação,
commit ou push. Banco de desenvolvimento não acessado. Logs temporários
removidos após o diagnóstico.
