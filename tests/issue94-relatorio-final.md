# Issue #94 — catálogo e regressão final da API

Data: 25/10/2026, America/Sao_Paulo. Node.js 24.22.1.
Branch: `94-test-validar-fluxos-completos-e-integracao-da-api-conectamente`.
Base Git: `18f2b39` (merge da #62), com as alterações locais das quatro fases.

**Avaliação final: issue #94 aprovada no escopo funcional validado.** Não houve
reprovação nas execuções finais, e nenhuma integração ficou sem execução.
Todos os teardowns encerraram sem falha; a Fase 4 confirmou zero resíduos por
conexão independente. Não houve alteração de lógica de produção nesta rodada.
Não foram realizados commit, push ou PR, nem iniciada a documentação da #63.

## Preparação e lacunas efetivamente complementadas

Consultados CONTEXTO_DESENVOLVIMENTO.md, ANALISE_ARQUITETURA_BACKEND.md,
tests/README.md e o código atual de Routes, Controllers, Services e Models do
catálogo. Revisadas as suítes das Fases 1/2/3 e das issues #52, #62 e #90.

Já existia cobertura de ordenação/associação de alternativas e mídia por HTTP
com queries simuladas, persistência de mídia por Services reais e consultas
básicas com MongoDB na Fase 3. As lacunas restantes eram os contratos de vazio,
inexistência, presença/omissão/null de mídia e bloqueio das escritas, todos
conectados aos endpoints reais com MongoDB e sem simular o retorno das queries.

Reaproveitados atlasSeguro.js, os contratos/asserções das issues #52/#90 e a
estratégia de bootstrap isolado da #62. As suítes existentes não foram alteradas.
As matrizes de manutenção de mídia da #90 e erros genéricos da #62 não foram
duplicadas. A regressão executou cada arquivo necessário uma vez, separando as
contagens; a Fase 4 específica não foi repetida na sequência MongoDB posterior.

## Fase 4 — cenários implementados e executados

Novo arquivo: tests/catalogo.issue94.mongo.test.js.

| Nº | Cenário | Resultado |
| --- | --- | --- |
| 01 | GET /comodos com coleção inicialmente vazia retorna [] | Aprovado |
| 02 | GET /tarefas com coleção inicialmente vazia retorna [] | Aprovado |
| 03 | GET /respostas com coleção inicialmente vazia retorna [] | Aprovado |
| 04 | Preparar somente 2 cômodos, 3 tarefas e 4 alternativas | Aprovado |
| 05 | Confirmar documentos completos e gabaritos por conexão independente | Aprovado |
| 06 | Listar cômodos e preservar campos cadastrados | Aprovado |
| 07 | Consultar cômodo por ID, cenário e dificuldades | Aprovado |
| 08 | Tarefas por cômodo: associação e valores de ordem | Aprovado |
| 09 | Tarefas globais e por ID: imagem/áudio presente, omitido e null | Aprovado |
| 10 | Alternativas por tarefa: sort crescente e mídia sem correta | Aprovado |
| 11 | Respostas globais e por ID ocultam gabarito real e preservam demais campos | Aprovado |
| 12 | Alternativas de outra tarefa permanecem isoladas | Aprovado |
| 13 | Cômodo sem tarefas e tarefa sem alternativas mantêm contratos de vazio | Aprovado |
| 14 | IDs inexistentes: 404 JSON nas cinco consultas por recurso/relação | Aprovado |
| 15 | IDs malformados: 400 JSON nas mesmas consultas | Aprovado |
| 16 | POST/PUT/PATCH/DELETE de cômodos, tarefas e respostas: 404 sem escrita | Aprovado |
| 17 | Oito consultas exigem JWT: ausente/inválido retorna 401 | Aprovado |
| 18 | Integridade do catálogo e contagens após consultas/escritas bloqueadas | Aprovado |

São **18 cenários mais o agrupador: 19 aprovações**. As três coleções estavam
realmente vazias antes das fixtures, portanto os cenários 01–03 foram executados
e aprovados; não houve limpeza global para fabricar esse estado. A suíte
ignora explicitamente esses casos em futuras execuções se houver registros
preexistentes. Um caso ignorado não deve ser classificado como aprovado.

O contrato de vazio atual é preservado:

- Listas globais vazias: 200 com [].
- Cômodo existente sem tarefas: 200 com mensagem e tarefas: [].
- Tarefa existente sem alternativas: 200 com [].
- Recurso inexistente: 404 com erro:true e mensagem pública.

### Ordenação e mídia

Alternativas por tarefa possuem sort explícito por ordem no Service. As três
alternativas da tarefa principal foram inseridas nas ordens 30, 10 e 20 e
retornaram 10, 20 e 30.

Consultas de tarefas/cômodos usam find sem sort. As tarefas foram preparadas
nas ordens 30, 10 e 20; nesta execução, a consulta por cômodo retornou 10, 20 e
30. **Essa ordem observada não foi transformada em garantia da API.** O teste
verifica associação, IDs e valores de ordem, sem impor um requisito de ordenação
que não existe no Service. Se for desejado sort garantido de tarefas futuramente,
isso exige uma decisão específica; não foi modificado nesta issue.

Comparações completas com documentos lidos da segunda conexão confirmaram
imagemCenario, imagemObjeto, textos, referências e áudio/imagens opcionais.
Campos omitidos permaneceram omitidos e null permaneceu null. correta persistiu
no banco tanto com true quanto com false e foi omitido nas consultas públicas
globais, por ID e por tarefa. A suíte não mascara o gabarito no cliente.

### HTTP, autenticação e monitoramento real

O index.js real é importado após abrir a conexão segura. Apenas dotenv.config,
listen (porta local livre) e a chamada de conexão do bootstrap são isolados.
Nenhum Service, Model, query, schema ou resultado MongoDB é substituído. Assim,
as rotas desativadas usam o fallback JSON 404 real da aplicação.

Para esta suíte de consultas, o JWT é assinado com segredo temporário e validado
pelo middleware real; não é um teste de cadastro/login. O login HTTP real foi
novamente exercitado nas Fases 1, 2 e 3 na regressão desta rodada.

A monitoração de commandStarted no client principal registra apenas nomes de
comandos. Durante consultas e as 12 tentativas de escrita pública bloqueadas,
não houve insert/update/delete/findAndModify. Snapshots das fixtures também
permaneceram iguais. Os POSTs de escrita desativada usam IDs candidatos próprios
registrados antes da requisição, para cobrir inclusive uma eventual regressão
que criasse documento indevidamente. Nenhuma rota administrativa foi habilitada.

## Resultados consolidados desta rodada

| Execução | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Fase 1 — identidade, vínculo e permissão | 29 | 0 | 0 |
| Fase 2 — personagens e partidas | 28 | 0 | 0 |
| Fase 3 — jornada integrada | 27 | 0 | 0 |
| Fase 4 — catálogo | 19 | 0 | 0 |
| Dez integrações MongoDB anteriores | 114 | 0 | 0 |
| **Total MongoDB desta rodada** | **217** | **0** | **0** |
| Suíte completa sem banco | 521 | 0 | 36 |

As contagens do Node incluem agrupadores e não representam quantidade de
defeitos ou porcentagem de cobertura. Não somar novamente o total MongoDB às
linhas individuais. Não foram reutilizados resultados históricos como se
fossem novas execuções; os quatorze arquivos MongoDB foram executados nesta
rodada, sequencialmente e sem sobreposição.

Os 36 ignorados da execução sem banco **não foram aprovados nessa execução**.
Todos os arquivos de integração correspondentes foram executados separadamente,
incluindo os cenários que se expandem apenas quando o agrupador opt-in roda.
Não restou integração sem execução. A suíte sem banco também executou os testes
existentes de autenticação/autorização da #62 e isolamento/progressão com mocks.

| Integração anterior | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| comodos.test.js | 16 | 0 | 0 |
| historicoConsulta.test.js | 16 | 0 | 0 |
| historicoJogo.test.js | 14 | 0 | 0 |
| progresso.test.js | 14 | 0 | 0 |
| personagemResposta.test.js | 10 | 0 | 0 |
| transacaoResposta.test.js | 5 | 0 | 0 |
| concorrenciaPersonagens.mongo.test.js | 10 | 0 | 0 |
| resumoDesempenho.issue58.mongo.test.js | 12 | 0 | 0 |
| resumoDesempenhoPreservacao.issue58.mongo.test.js | 3 | 0 | 0 |
| midia.issue90.mongo.test.js | 14 | 0 | 0 |

## Isolamento, persistência e limpeza

Exclusivamente MONGO_TEST_URI em conectamente_testes, validada por atlasSeguro.js,
foi utilizada. A conexão do bootstrap foi bloqueada antes da importação para
evitar acesso ao destino da aplicação. As conexões real e independente usam
clients diferentes e seus bancos/Models foram confirmados pelos helpers.

Cada fixture foi registrada por ID antes de salvar. A preparação usa o mecanismo
aditivo já existente de coleções/índices; não usa syncIndexes, dropDatabase,
drop de coleção ou exclusão geral. Nenhum documento de desenvolvimento/produção
foi acessado. Os dados de catálogo próprios foram confirmados integralmente
pela conexão independente antes e depois das consultas.

O teardown encerra HTTP, remove somente os IDs próprios via limparRegistrosTeste,
fecha as conexões e reprova qualquer falha de limpeza. A segunda conexão confere
ausência por IDs e pelos relacionamentos comodoId/tarefaId próprios.

**Zero resíduos da Fase 4 confirmados por conexão independente.** As Fases
1/2/3 também confirmaram sua limpeza e nenhuma das dez integrações anteriores
teve falha de teardown. O ambiente vazio observado antes das fixtures não foi
obtido apagando registros preexistentes.

## Arquivos revisados e preparação para o PR

Criados nesta rodada:

- tests/catalogo.issue94.mongo.test.js.
- tests/issue94-relatorio-final.md.
- Evidências locais issue94-fase4-especificos.tap,
  issue94-fase4-sem-banco.tap, issue94-fase4-regressao-*.tap,
  issue94-fase4-diff-check.log e issue94-fase4-formatacao.log.

Modificados nesta rodada:

- tests/README.md: instruções da Fase 4 e referência a esta consolidação.
- .gitignore: regras específicas tests/issue94-*.tap e tests/issue94-*.log.

Preservados: testes/relatórios das Fases 1/2/3 e a correção manual anterior de
criancaController.js. Os hashes dos três testes de fase e do Controller foram
comparados antes/depois e permaneceram iguais. As evidências locais anteriores
não foram apagadas.

O diff de produção da branch contém somente a guarda de body em
postCrianca(), implementada manualmente e aprovada na revalidação da Fase 1.
Nenhum Service, Model, Route, middleware ou outro arquivo de produção foi
modificado. Não houve instalação nem mudança em package.json/package-lock.json.

Arquivos de código/documentação que compõem a entrega revisável da issue:

- controllers/criancaController.js (correção manual).
- .gitignore e tests/README.md.
- Os quatro arquivos de teste novos das Fases 1/2/3/4.
- Os relatórios Markdown das Fases 1/2/3 e este relatório final.

Foram identificados **78 arquivos temporários locais issue94-*.tap/log** ao
final da regressão. Eles não devem entrar no PR: todos ficam ignorados pelas
novas regras e preservados localmente como evidência. git check-ignore confirmou
os padrões e git ls-files não retornou nenhum .tap/.log rastreado. Os temporários
da #62 já tinham regras próprias. Não se deve usar inclusão forçada desses logs.

## Qualidade, limites e avaliação

| Verificação | Resultado |
| --- | --- |
| node --check no novo teste | Aprovado |
| git diff --check | Aprovado, saída vazia |
| npm.cmd run format:check | Aprovado |
| Hashes dos testes das Fases 1/2/3 e Controller anterior | Preservados |
| Arquivos .tap/.log rastreados pelo Git | Nenhum |

O Prettier do projeto ignora tests/; o script aprovado não equivale a uma
verificação de estilo interno dos testes. Nenhum formatador com escrita foi
executado nesta rodada.

Não foram encontrados novos problemas funcionais. Permanecem limites já
declarados: não há garantia de ordenação de tarefas/cômodos sem sort, não se
mede cobertura percentual de linhas e não se certificam todas as entradas,
carga, falhas/retries de rede, reinício do processo ou todos os entrelaçamentos
de concorrência. As regras de tempo, nível e quantidade de partidas não foram
ampliadas. O DELETE de partida continua físico com histórico preservado, conforme
decisão explícita do usuário, sem implementação de exclusão lógica.

**Issue #94 aprovada para preparação de commit/PR no escopo validado.** A entrega
continua sem commit, push ou PR. Nenhuma funcionalidade adicional ou documentação
da issue #63 foi iniciada.
