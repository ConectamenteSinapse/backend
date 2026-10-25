# Testes do backend

Use Node.js 24 ou superior e as dependências do projeto instaladas.

## Regressão sem Atlas

Execute com todas as flags de integração desativadas, sem carregar `.env`:

```sh
env RUN_ATLAS_TESTS=0 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=0 node --test --test-concurrency=1 --test-reporter=tap
```

Validação desta infraestrutura em 23/10/2026: **89 aprovados, 0 falhos e
16 ignorados**, em Node.js 24.21.0. Nenhuma integração real foi executada nesta
preparação. A tentativa no sandbox falhou em dois arquivos de testes HTTP;
a repetição autorizada fora dele passou, sem alterar expectativas dos testes.

Os testes unitários, de proteção e HTTP com mocks não acessam MongoDB real.
Os testes HTTP abrem servidores locais em portas livres. As suítes reais ficam
ignoradas. `atlasSeguro.test.js` substitui os pontos de entrada do Mongoose;
seus cenários de ativação usam ambiente fictício, sem sockets MongoDB.

## Contrato de segurança do Atlas

Toda conexão de integração passa por `helpers/atlasSeguro.js` e usa somente
`MONGO_TEST_URI`, com caminho exatamente `/conectamente_testes`. Não há fallback
para `MONGO_URI`, banco aleatório ou carregamento automático de `.env` nos helpers.
Não incluir credenciais em comandos, logs ou arquivos versionados.

- `RUN_ATLAS_TESTS=1`: autorização central, verificada dentro das funções de conexão.
- `RUN_COMMIT_REAL_TESTS=1`: autorização adicional para `transacaoResposta.test.js`.
- `RUN_CONCORRENCIA_REAL_TESTS=1`: autorização adicional para `concorrenciaPersonagens.mongo.test.js`.

As flags adicionais não substituem a central. URI ausente/inválida ou flag
ausente ignora a suíte; chamada direta ao helper é bloqueada antes do driver.
Não são aceitos fragmentos de URI, opção `dbName` na URI ou opções extras de
conexão capazes de substituir o destino autorizado.

O helper fixa `dbName`, desativa `autoCreate`/`autoIndex` e confere estado,
`connection.name`, `db.databaseName` e vínculo dos Models/coleções antes das
operações. Conexão primária preexistente é recusada. Uma conexão independente
de leitura exige primária já validada e também tem seu banco confirmado.
Falhas de conexão/validação fecham a conexão e retornam erro sanitizado.
Os helpers não importam `index.js`; JWTs usam segredos fictícios temporários.

## Preparação e limpeza

A preparação valida os Models antes de criar coleções e índices declarados.
`createIndexes()` é aditivo; não usa `syncIndexes()`. Incompatibilidades de
índice ou duplicatas devem interromper a preparação, sem apagar dados/índices.
Não há exclusão de banco ou coleções, nem limpeza geral de documentos.

`helpers/jogo.js` e `helpers/progresso.js` inserem fixtures em transação externa,
abortam ao terminar e conferem ausência dos IDs fora da transação. No helper
de jogo, funções de sessão são adaptadas para impedir commit; esses cenários
não comprovam commit do Service real. Coleções/índices ficam fora do abort.

Commit e concorrência mantêm transações reais do Service e consultam resultados
por conexão independente. A limpeza centralizada:

- Registra IDs antes das inserções, inclusive em preparação parcial.
- Exclui por `_id: { $in: IDs }`; históricos gerados pelo Service são delimitados
  pelos perfis fictícios exclusivos da execução.
- Valida todos os Models e IDs antes da primeira exclusão; listas vazias não excluem.
- Continua após falhas individuais e denuncia resíduos por erro agregado sanitizado.
- Confere ausência dos documentos; as conexões são encerradas em `finally`.

## Execução real deliberada

Antes de executar, preparar usuário exclusivo limitado a `conectamente_testes`,
acesso de rede do executor e suporte a transações. Confirmar permissões de
criação de coleções/índices e operações nesse banco, sem usar bancos da equipe.

Executar uma suíte por processo, sem outra execução usando o banco. O catálogo
fictício consulta a ordenação existente, portanto execuções sobrepostas podem
interferir entre si. Após interrupção forçada, revisar possíveis resíduos por
IDs conhecidos; nunca esvaziar banco ou coleções.

O suporte nativo do Node.js disponibiliza `.env` ao processo. Somente em ambiente
autorizado, selecionar explicitamente um dos arquivos abaixo:

```sh
env RUN_ATLAS_TESTS=1 RUN_COMMIT_REAL_TESTS=1 RUN_CONCORRENCIA_REAL_TESTS=0 node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/transacaoResposta.test.js
```

```sh
env RUN_ATLAS_TESTS=1 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=1 node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/concorrenciaPersonagens.mongo.test.js
```

Esses comandos não são parte da regressão offline. Não usar `npm test` com
flags habilitadas como primeira validação de um ambiente.

Os relatórios históricos `issue71-*.md` e `issue72-*.md` podem conter destinos,
comandos e diagnósticos anteriores. Não substituem este contrato de segurança.


## Issue #58 — resumo geral de desempenho

O endpoint `GET /criancas/:criancaId/resumo-desempenho` recebe `Usuario._id`
na URL e devolve `Crianca._id` em `criancaId`. Consulta os históricos da criança,
incluindo históricos preservados após arquivar personagens ou excluir partidas.

- `resumoDesempenho.issue58.test.js`: 29 testes com queries simuladas, incluindo
  cálculos, agrupamento, acesso, dados legados e erros internos.
- `resumoDesempenho.issue58.mongo.test.js`: 12 cenários reais de resumo completo,
  criança sem histórico, isolamento, autenticação e autorização.
- `resumoDesempenhoPreservacao.issue58.mongo.test.js`: 3 cenários reais de
  arquivamento, exclusão de partida e histórico com `jogoSalvoId: null`.

O helper específico reutiliza `atlasSeguro.js`, exige `RUN_ATLAS_TESTS=1` e usa
somente `MONGO_TEST_URI` em `conectamente_testes`. Não exige as flags adicionais
reservadas às suítes de commit transacional e concorrência. Os JWTs usam segredo
temporário; cada fixture tem ID registrado antes de inserir. Uma segunda conexão
independente confere documentos completos e a limpeza restrita aos IDs da execução.
Falhas de limpeza reprovam o teste. Não importar `index.js` para executar a suíte.

Após autorização explícita para integração real, selecionar uma suíte por vez:

```sh
env RUN_ATLAS_TESTS=1 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=0 node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/resumoDesempenho.issue58.mongo.test.js
```

```sh
env RUN_ATLAS_TESTS=1 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=0 node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/resumoDesempenhoPreservacao.issue58.mongo.test.js
```

Validação final anterior à transferência para esta worktree, em 23/10/2026:
regressão offline com **118 aprovados, 0 falhos e 31 ignorados**; integração da
issue #58 com **15 aprovados, 0 falhos e 0 ignorados**, executada sequencialmente.
A limpeza foi confirmada nos 15 cenários reais. Os testes reais não são
reexecutados durante esta preparação. Consulte `issue58-resumo-desempenho.md`
para resultados históricos, contrato e limitações. Os 89/0/16 documentados acima
correspondem à infraestrutura isolada do PR #86, sem os arquivos da issue #58.

## Issue #90 — referências de imagem e áudio

Contrato aprovado para `Tarefa.audioEnunciado`, `Resposta.imagem` e
`Resposta.audio`: campo omitido/`undefined` não informa mídia; `null` representa
sua ausência; qualquer string não vazia após `trim()` é aceita, sem exigir URL
ou caminho específico. A implementação não normaliza a string. String vazia,
somente espaços, número, booleano, objeto e array são rejeitados nos Services
com `status = 400`, antes da escrita. Os Controllers traduzem esses erros em
HTTP 400. `imagemObjeto` e os textos continuam obrigatórios.

Arquivos específicos:

- `midia.issue90.test.js`: 96 testes locais. Inclui a matriz dos três campos
  em cadastro/PUT/PATCH, schemas legados e campos obrigatórios, manutenção,
  relacionamentos, consultas HTTP, autenticação, gabarito oculto e escritas
  desativadas. Usa mocks de persistência e bloqueia conexões MongoDB.
- `helpers/midiaIssue90.js`: fixtures e referências aos componentes reais;
  não abre conexões, carrega ambiente ou cadastra rotas de manutenção.
- `midia.issue90.mongo.test.js`: 13 cenários mais o teste agrupador (14 na
  contagem do Node). Usa somente os helpers de segurança existentes e uma
  segunda conexão para conferir documentos persistidos, tipos e limpeza.

PUT exige os campos antigos no Controller, mas o Service usa
`findByIdAndUpdate()` e preserva campos de mídia omitidos. PATCH permite
atualização parcial. Ambos são testados por chamada interna ao Controller ou
Service; as rotas públicas de escrita não são ativadas para os testes.

### Execução específica no PowerShell

Sem banco, sem carregar `.env`:

```powershell
$env:RUN_ATLAS_TESTS = "0"
$env:RUN_COMMIT_REAL_TESTS = "0"
$env:RUN_CONCORRENCIA_REAL_TESTS = "0"
node --test --test-concurrency=1 --test-reporter=tap tests/midia.issue90.test.js tests/midia.issue90.mongo.test.js
```

Integração real, somente após validar as condições de segurança descritas
acima e configurar `MONGO_TEST_URI` exclusivamente para `conectamente_testes`:

```powershell
$env:RUN_ATLAS_TESTS = "1"
$env:RUN_COMMIT_REAL_TESTS = "0"
$env:RUN_CONCORRENCIA_REAL_TESTS = "0"
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/midia.issue90.mongo.test.js
```

A suíte registra IDs antes de criar documentos, nunca altera fixtures de
outras execuções e confere que suas sentinelas permaneçam inalteradas durante
a manutenção. O teardown só exclui IDs próprios e verifica resíduos pela
segunda conexão. Não compara nem modifica o conjunto inteiro de dados
preexistentes. As permissões e os limites dos helpers não são substituídos.

### Evidências de 25/10/2026

Node.js 24.22.1, branch da issue #90, com a implementação local do aluno:

- Específicos locais: 96 aprovados, 0 falhos; integração ignorada nesta etapa.
- Integração específica: 14 aprovados, 0 falhos, 0 ignorados; limpeza confirmada
  por conexão independente.
- Suíte completa sem banco: 222 aprovados, 0 falhos e 32 ignorados.
- Nove suítes reais anteriores, executadas sequencialmente: 100 aprovados,
  0 falhos e 0 ignorados.
- Integrações executadas ao todo: 114 aprovações. Todos os casos inicialmente
  ignorados tiveram execução posterior; nenhum ficou pendente.

Não somar novamente os 96 específicos aos 222 locais: eles já estão incluídos.
As contagens do Node incluem testes agrupadores. Nenhuma regressão foi
identificada. Os arquivos de produção e `.env` foram preservados.
