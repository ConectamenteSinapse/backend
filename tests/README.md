# Testes do backend

Use Node.js 24 ou superior e as dependências do projeto instaladas.

## Issue #103 — desvinculação de criança do responsável

`DELETE /responsaveis/minhas-criancas/:criancaId/vinculo` recebe `Crianca._id`,
exige JWT de responsável e retorna HTTP 200 com a confirmação. A operação
altera apenas `responsavelId: null` e `permissaoAtiva: false`.

- `desvinculacao.issue103.test.js`: 17 testes HTTP, com Router, middlewares,
  Controller e Service reais e persistência simulada. Verifica filtro de
  propriedade, atualização restrita e listagem após desvincular.
- `desvinculacao.issue103.mongo.test.js`: 15 cenários e um agrupador, com
  persistência e populate reais. Uma conexão independente compara documentos
  completos de usuários, responsáveis e crianças, antes e depois das requisições.
- `helpers/desvinculacaoIssue103.js`: servidor HTTP local, JWT temporário e
  dados comuns. Não importa index.js nem carrega `.env` automaticamente.
- `erros.issue62.test.js`: contratos específicos de Controller e DELETE HTTP
  da desvinculação, preservando os testes de HTTP 204 das outras rotas DELETE.

A cobertura inclui sucesso com permissão ativa/inativa e limite numérico/null,
preservação do usuário e demais campos, saída da listagem, preservação das outras
crianças, criança de outro responsável, já desvinculada, inexistente e segunda
tentativa após sucesso. Inclui IDs inválidos na URL/JWT, uso indevido de
`Usuario._id`, responsável sem perfil, ausência de JWT e perfis não autorizados.
Campos enviados no body não podem alterar outros dados.

Execução sem banco, sem carregar `.env`:

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/desvinculacao.issue103.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

Integração isolada, somente em `conectamente_testes` via `MONGO_TEST_URI`,
respeitando todas as guardas de `atlasSeguro.js`:

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/desvinculacao.issue103.mongo.test.js
```

Fixtures possuem IDs registrados antes das inserções. A limpeza usa somente
esses IDs e confirma zero resíduos por conexão independente. JWTs são assinados
com segredo temporário no teste; o fluxo de login possui cobertura própria.

Resultados em 28/10/2026, Node.js 24.22.1: específicos sem banco **17 aprovados,
0 reprovados, 0 ignorados**; integração **16 aprovados (15 cenários + agrupador),
0 reprovados, 0 ignorados**; suíte completa sem banco **620 aprovados,
0 reprovados, 38 ignorados**. Os específicos sem banco estão incluídos na
regressão; as integrações opt-in ficam ignoradas nessa execução.

A regressão inicial revelou a suposição antiga da #62 de que todo DELETE
retornaria 204 e usaria perfil infantil. Foi acrescentado o contrato específico
da nova rota (200 e perfil responsável), também no teste genérico do Controller.
A integração emitiu aviso do Mongoose sobre a opção `new: true` obsoleta,
sem falhas. Código de produção e dependências permaneceram intactos.

## Issue #101 — limite de tempo diário por criança

`PATCH /responsaveis/minhas-criancas/:criancaId/limite-tempo` recebe o ID
do perfil `Crianca._id`, com `{ limiteTempoDiario: inteiroPositivoOuNull }`.

- `limiteTempo.issue101.test.js`: 28 testes HTTP com persistência simulada;
  Router, JWT, autorização, Controller e Service reais. Confere também filtro
  de propriedade, atualização restrita e ausência de consultas nas rejeições iniciais.
- `limiteTempo.issue101.mongo.test.js`: 27 cenários e um agrupador, com
  Models/queries reais e leitura por conexão independente. Confere persistência,
  preservação integral das fixtures nas rejeições e alteração somente do limite
  nos sucessos, inclusive quando outros campos são enviados no body.
- `helpers/limiteTempoIssue101.js`: servidor HTTP local, JWT temporário e matriz
  compartilhada de entradas inválidas. Não importa index.js nem carrega ambiente.
- `erros.issue62.test.js`: fixture e expectativa específicas para o retorno
  do novo controller, descoberto automaticamente pela regressão existente.

As duas suítes cobrem inteiros positivos, remoção com null, valores negativos,
zero, frações, strings, campo/body ausente, tipos indevidos, IDs inválidos,
ausência de JWT, perfil infantil, responsável sem perfil e crianças de outro
responsável, sem vínculo ou inexistentes. Também verificam que `Usuario._id`
não substitui `Crianca._id` e que campos extras não alteram outros dados.

Sem MongoDB, sem carregar `.env`:

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/limiteTempo.issue101.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

Integração isolada, usando as guardas de `atlasSeguro.js` e somente
`MONGO_TEST_URI` apontando para `conectamente_testes`:

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/limiteTempo.issue101.mongo.test.js
```

Os IDs são registrados antes das inserções. A limpeza remove somente fixtures
da execução e uma segunda conexão confirma zero resíduos. Os JWTs são assinados
no teste; login/cadastro não fazem parte desta issue.

Execução em 28/10/2026, Node.js 24.22.1: específicos sem banco **28 aprovados,
0 falhas**; integração **28 aprovados (27 cenários + agrupador), 0 falhas,
0 ignorados**; suíte completa sem banco **599 aprovados, 0 falhas, 37 ignorados**.
As integrações opt-in ficam ignoradas na regressão sem banco.

A primeira regressão apontou uma expectativa genérica desatualizada da #62 para
o novo controller; foi acrescentado seu contrato específico. A tentativa inicial
de integração no sandbox falhou na conexão antes das fixtures; a execução com
acesso de rede fora do sandbox passou e confirmou limpeza. Nenhuma alteração
de produção ou dependência foi necessária.

## Issue #94 — fase 4 e regressão final

`catalogo.issue94.mongo.test.js` contém 18 cenários e um agrupador. Complementa
#52/#62/#90 e a Fase 3 com catálogo HTTP real em MongoDB: coleções/relacionamentos
vazios, inexistentes, mídia presente/omitida/null, associação, projeção de correta,
ordenação declarada e escrita pública bloqueada.

Usa somente fixtures de catálogo: dois cômodos, três tarefas e quatro alternativas,
com IDs registrados antes de inserir. O index.js real é importado com somente
dotenv.config, listen e a chamada de conexão do bootstrap isolados. A conexão
real é aberta antes, por atlasSeguro.js. Services, Models e queries não são
substituídos. O JWT temporário para consultas é assinado no teste; a jornada
de login HTTP real permanece nas Fases 1/2/3 reexecutadas.

As três verificações de listagens globais vazias só executam quando a respectiva
coleção já está vazia, antes das fixtures. Se houver dados preexistentes, o caso
fica explicitamente ignorado; nunca se esvazia a coleção. Vazio por cômodo e por
tarefa é exercitado com fixtures próprias, independentemente de dados externos.

Alternativas por tarefa têm sort por ordem no Service. Consultas de tarefas e
cômodos não declaram sort: não tratar a ordem incidental do MongoDB como garantia.
O caso de tarefas verifica associação e valores do campo ordem, sem impor regra
nova. A monitoração de comandos reais confirma ausência de insert/update/delete/
findAndModify durante consultas e tentativas de escrita pública desativada.

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/catalogo.issue94.mongo.test.js
```

Executar uma integração por vez, exclusivamente em conectamente_testes, conforme
as guardas abaixo. Consolidação e limites: `issue94-relatorio-final.md`.
Evidências locais issue94-*.tap/log estão ignoradas pelo Git e não devem entrar
no PR; os testes, este README e os relatórios Markdown devem permanecer revisáveis.

## Issue #94 — fase 3: jornada integrada do jogo

`jornadaIntegrada.issue94.mongo.test.js` contém 26 cenários e um agrupador.
Percorre cadastro/login, vínculo/permissão, personagem/partida, catálogo,
respostas e as cinco consultas de histórico/progresso/desempenho por HTTP real.
Todos os Services, Models, sessões e commits são reais; não importa index.js,
não gera JWTs artificialmente nem insere históricos diretamente.

Reutiliza atlasSeguro.js e os procedimentos das Fases 1/2 de propriedade,
descoberta de IDs HTTP, snapshots e limpeza verificada em conexão independente.
O catálogo usa somente dois cômodos, três tarefas e seis alternativas novos,
com IDs registrados antes de inserir, sem alterar o catálogo preexistente.
Os IDs usados para jogar são recuperados nas respostas HTTP. A fixture conhece
a alternativa correta por sua ordem, mas as consultas públicas não expõem correta.

A jornada gera 11 históricos por HTTP: nove na partida principal, um em outra
partida da mesma criança e um de outra criança. Verifica erros de progressão,
tentativas, commit, última posição, cinco consultas, agrupamento por dificuldade
versus tarefa distinta, ausência de sincronização automática de estrelas do
avatar e revogação da permissão. Consulta também a partida por HTTP e compara
sua posição aos dados lidos pela conexão independente.

Executar isoladamente, com banco exclusivo validado e sem outra integração
simultânea, seguindo as precauções de segurança abaixo:

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/jornadaIntegrada.issue94.mongo.test.js
```

Resultados, checkpoints numéricos e limites: `issue94-fase3-relatorio.md`.

## Issue #94 — fase 2: personagens e partidas

`personagensPartidas.issue94.mongo.test.js` contém 27 cenários e um agrupador.
Executa os Routers, Controllers, Services, Models e MongoDB reais, com JWTs
obtidos pelo login HTTP. Cria contas, perfis infantis, personagens e partidas
pelos endpoints. Não instala dependências nem usa mocks ou index.js.

Reutiliza atlasSeguro.js, catalogo.js e a estratégia de propriedade da fase 1:
e-mails exclusivos registrados antes do cadastro; descoberta de IDs por esses
e-mails → usuarioId → criancaId → perfilJogoId. Isso inclui documentos gerados
por HTTP com resposta incerta. IDs conhecidos não são esquecidos após DELETE,
e fixtures internas têm seus IDs registrados antes de inserir. A limpeza usa
somente IDs e relacionamentos próprios; a segunda conexão confirma zero resíduos.

Os históricos sentinela são fixtures apenas para verificar preservação após
DELETE/arquivamento; não se testam endpoints de histórico, progresso ou desempenho.
O comportamento atual de partida, confirmado pelo usuário, é remoção física
de jogos_salvos com histórico preservado. Personagem usa arquivamento lógico.
Partidas de personagem arquivado persistem, mas ficam inacessíveis nos endpoints.
São permitidas várias partidas para o mesmo personagem.

A retomada confere GET após novo login e reabertura da conexão de leitura;
não simula reinício do processo da API. A suíte verifica populate real,
campos permitidos, isolamento e ausência de escrita em rejeições.

Após validar o ambiente, executar uma suíte por vez conforme as guardas abaixo:

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/personagensPartidas.issue94.mongo.test.js
```

Resultados e limitações: `issue94-fase2-relatorio.md`.

## Issue #94 — fase 1: identidade, vínculo e permissão

`identidadeVinculo.issue94.mongo.test.js` contém 28 cenários HTTP reais e um
agrupador. Não substitui Services, Models, queries, bcrypt, JWT ou transações.
Usuários, perfis infantis/responsáveis e vínculos são criados pelos endpoints;
todos os JWTs vêm de `POST /usuarios/auth`. Não importa `index.js` nem carrega
`.env` automaticamente. Reutiliza `atlasSeguro.js` e `catalogo.js`.

Usa somente `MONGO_TEST_URI` em `conectamente_testes`, com `RUN_ATLAS_TESTS=1`.
As flags adicionais continuam reservadas às suítes anteriores indicadas abaixo.
Uma segunda conexão verifica hashes, perfis, vínculo, permissão, histórico e
estrelas persistidos. Atividade, personagem e partida são fixtures mínimas de
suporte à prova negar → permitir → revogar; não constituem a próxima fase de
testes do CRUD desses recursos.

Como as APIs geram seus próprios IDs, a suíte registra e confere ausência dos
e-mails exclusivos da execução **antes** de enviar cadastros. Depois recupera
IDs por esses e-mails exatos e perfis por `usuarioId` dos usuários próprios,
inclusive após resposta HTTP incerta. Fixtures internas têm IDs registrados
antes de inserir. No teardown, encerra HTTP, descobre IDs e usa a limpeza por
IDs existente, sem filtros gerais. Continua tentando limpar IDs conhecidos se
a descoberta falhar; qualquer falha de descoberta/limpeza reprova a suíte.
Outra conexão confere ausência por IDs, e-mails e relacionamentos próprios.

Os dois pedidos concorrentes de vínculo usam `Promise.all`, sem barreira ou
substituição de query: verificam um 200, um 409 e proprietário único persistido.
Isso não força uma ordem específica de execução interna no MongoDB.

Após validar o ambiente e seguindo as precauções deste README, executar
isoladamente, sem outra suíte usando o mesmo banco:

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/identidadeVinculo.issue94.mongo.test.js
```

Os resultados, a falha inicial e sua revalidação estão em
`issue94-fase1-relatorio.md`. A suíte diferencia body ausente (400), objeto
vazio válido (201, dataNascimento null) e data de nascimento válida persistida.

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
