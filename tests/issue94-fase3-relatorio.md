# Issue #94 — Fase 3: jornada integrada do jogo

Data: 25/10/2026, America/Sao_Paulo. Node.js 24.22.1.
Branch: `94-test-validar-fluxos-completos-e-integracao-da-api-conectamente`.
Base: `18f2b39`, preservando as alterações ainda não commitadas das Fases 1/2.

**Conclusão: Fase 3 aprovada no escopo validado.** Nenhuma falha funcional foi
identificada nos cenários executados. A jornada real gerou 11 históricos pelo
endpoint de respostas, confirmou commit e consistência dos indicadores por
conexão independente, e terminou com zero resíduos.

## Preparação e reaproveitamento

Consultados os documentos de contexto/arquitetura, tests/README.md, Routes de
catálogo, histórico, progresso e desempenho, seus Services e as suítes anteriores.

Reaproveitados:

- atlasSeguro.js: destino exclusivo conectamente_testes, conexão/Models,
  preparação aditiva de coleções/índices e limpeza restrita às fixtures.
- Fases 1/2: estratégia de cadastro/login HTTP, propriedade por e-mails exclusivos,
  descoberta dos IDs gerados pelos endpoints, snapshots, encerramento HTTP,
  limpeza e leitura independente. Os testes dessas fases ficaram intactos.
- historicoJogo.test.js e comodos.test.js: contratos de ordem, dificuldade,
  desbloqueio de cômodos e códigos de erro. A nova suíte conecta esses contratos
  às consultas sobre os mesmos históricos efetivamente gravados após commit.
- transacaoResposta.test.js e concorrenciaPersonagens.mongo.test.js: continuam
  cobrindo commit/concorrência real na regressão; não foram duplicadas suas
  matrizes de corridas e instrumentações na nova jornada.
- progresso.test.js, historicoConsulta.test.js e suítes #58: contratos de IDs,
  cálculos, agrupamentos e autorização. Agora também são verificados após
  respostas HTTP reais, em vez de apenas históricos preparados por fixtures.
- #52/#90: contratos de alternativas ordenadas, mídia e gabarito oculto.

Novo arquivo: tests/jornadaIntegrada.issue94.mongo.test.js. Usa Routers,
Controllers, Services, Models, bcrypt/JWT e transações reais, sem mocks.
O app de teste monta os prefixos na ordem de index.js, sem importar o bootstrap
que carrega ambiente e conecta ao banco da aplicação.

Contas, perfis, vínculo, permissão, personagens e partidas são criados por HTTP.
Todos os tokens vêm do login real. As únicas inserções diretas são **dois
cômodos, três tarefas e seis alternativas**, necessárias às restrições de ordem,
dificuldade e cômodo. Os cômodos temporários ficam antes do catálogo existente,
sem editá-lo. Não há histórico inserido diretamente nem seed permanente.

## Novos cenários e resultados individuais

| Nº | Cenário | Resultado |
| --- | --- | --- |
| 01 | Cadastro/login e vínculos reais de responsável e duas crianças | Aprovado |
| 02 | Personagens e três partidas criados pelos endpoints | Aprovado |
| 03 | Catálogo mínimo com IDs registrados antes da inserção | Aprovado |
| 04 | Ativação e consulta da permissão da criança principal | Aprovado |
| 05 | Consultas de cômodos e recuperação de IDs HTTP | Aprovado |
| 06 | Tarefas por cômodo, globais e por ID | Aprovado |
| 07 | Alternativas por tarefa/globais/ID ocultam correta e preservam mídia | Aprovado |
| 08 | Cinco consultas iniciais zeradas e última interação null | Aprovado |
| 09 | Bloqueios de tarefa, dificuldade e cômodo preservam codigo/estado | Aprovado |
| 10 | Resposta incorreta: tentativa 1, zero pontos, commit visível | Aprovado |
| 11 | Indicadores após erro: nenhuma conclusão | Aprovado |
| 12 | Erro não libera a próxima tarefa | Aprovado |
| 13 | Resposta correta: tentativa 2, um ponto | Aprovado |
| 14 | Cinco consultas concordam sobre erro/acerto e última interação | Aprovado |
| 15 | Acerto repetido aumenta tentativas/estrelas sem duplicar conclusão | Aprovado |
| 16 | Acerto na segunda tarefa conclui fácil e salva posição | Aprovado |
| 17 | Médio liberado; progresso e desempenho distinguem suas métricas | Aprovado |
| 18 | Próximo cômodo permanece bloqueado antes de concluir difícil | Aprovado |
| 19 | Concluir difícil libera o segundo cômodo por respostas reais | Aprovado |
| 20 | Agregados finais da partida e desempenho por cômodo | Aprovado |
| 21 | Outra partida não herda desbloqueio/contador e não altera a principal | Aprovado |
| 22 | Geral agrega duas partidas; consultas por partida continuam isoladas | Aprovado |
| 23 | Outra criança: permissão false bloqueia; dados posteriores isolados | Aprovado |
| 24 | Criança alheia não acessa partida/histórico/progresso/desempenho | Aprovado |
| 25 | Revogação bloqueia novas respostas sem alterar estado anterior | Aprovado |
| 26 | Novo login e conexão de leitura reaberta confirmam persistência final | Aprovado |

São **26 cenários mais um agrupador: 27 aprovações** na contagem do Node.
Nenhum cenário da Fase 3 foi ignorado. Os IDs enviados para jogar vêm das
respostas HTTP de criação e das consultas de cômodos/tarefas/alternativas.
A fixture define a alternativa correta pela ordem, porém nenhum cliente recebe
o campo correta nas consultas verificadas.

## Consistência numérica observada

| Checkpoint da criança principal | Tentativas | Acertos | Erros | Conclusões no progresso | Tarefas distintas no desempenho | Estrelas | % acertos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Primeiro erro | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| Erro e primeiro acerto | 2 | 1 | 1 | 1 | 1 | 1 | 50 |
| Acerto repetido na primeira tarefa | 3 | 2 | 1 | 1 | 1 | 2 | 66,67 |
| Duas tarefas no fácil | 4 | 3 | 1 | 2 | 2 | 3 | 75 |
| Duas tarefas também no médio | 6 | 5 | 1 | 4 | 2 | 7 | 83,33 |
| Difícil concluído e primeira tarefa do segundo cômodo | 9 | 8 | 1 | 7 | 3 | 14 | 88,89 |
| Geral, somando um acerto em outra partida | 10 | 9 | 1 | 7 | 3 | 15 | 90 |

Na partida principal permanecem nove históricos e 14 estrelas. A segunda
partida da mesma criança tem um histórico, tentativa 1 e uma estrela. O
progresso geral agrupa a mesma tarefa/dificuldade entre partidas, enquanto os
históricos e as consultas por partida mantêm seu isolamento. O grupo da primeira
tarefa no fácil contém quatro tentativas, três acertos e um erro no geral.

O desempenho por cômodo foi comparado explicitamente após as nove respostas
da partida principal: primeiro cômodo com oito tentativas, sete acertos, um erro,
87,5% e duas tarefas distintas; segundo com uma tentativa, um acerto, 100% e
uma tarefa distinta. A agregação geral de totais foi também conferida depois
da resposta na segunda partida; não se afirma uma matriz exaustiva de todos
os agrupamentos possíveis.

A outra criança tem um histórico de erro, zero estrelas e nenhuma tarefa
concluída. Sua inclusão no banco não altera os dez históricos/indicadores da
criança principal. Ao final existem **11 históricos reais**, todos produzidos
por POST /historico-jogo/responder.

Em todos os checkpoints de consulta, a suíte verifica:

- Histórico de partida e geral: mesmos IDs e campos dos documentos visíveis
  na conexão independente; datas em ordem decrescente, sem exigir ordem entre
  registros com data igual.
- Progresso de partida e geral: tentativas, acertos, erros, conclusões e última
  interação conforme os números conhecidos da jornada.
- Resumo: percentuais arredondados, estrelas, tarefas distintas e última
  interação; resposta usa Crianca._id enquanto a URL geral recebe Usuario._id.
- GET da partida: posição, dificuldade, estrelas e atualizadoEm iguais aos
  dados persistidos após a resposta.
- Nenhuma consulta altera o snapshot dos documentos próprios.

O Service atual atualiza estrelas da partida, não sincroniza automaticamente
as estrelas do avatar. A suíte confirmou avatar com estrelasTotal 0 e nivelAtual
1 no banco e via HTTP, enquanto partidas somam 15 estrelas. Isso corresponde
ao comportamento atual e não foi tratado como falha. Nenhuma regra nova de
tempo, nível, limite de partidas ou pontuação foi introduzida.

## Persistência, autorização e limpeza

A fase abre dois clients independentes por atlasSeguro.js. Cada resposta 201
é seguida por leitura fora da sessão/transação do Service, confirmando o novo
histórico, tentativa, pontuação, posição e estrelas após commit. Não há troca
de withTransaction por abort ou retorno simulado.

Os códigos TAREFA_FORA_DA_ORDEM, DIFICULDADE_BLOQUEADA e COMODO_BLOQUEADO foram
comparados em respostas 403 e as rejeições preservaram todo o estado próprio.
Outra criança recebeu 404 nos endpoints da partida e 403 nas consultas gerais
alheias; o envio usando personagem/partida alheios também foi rejeitado.
A permissão inativa bloqueou jogar antes da primeira resposta da outra criança
e, após revogação da criança principal, impediu novos históricos/estrelas/posição.

Exclusivamente MONGO_TEST_URI em conectamente_testes foi utilizada. Não houve
fallback para MONGO_URI, acesso a desenvolvimento/produção, limpeza geral ou
execuções MongoDB sobrepostas. A propriedade das fixtures segue os e-mails
exclusivos registrados antes do cadastro e seus relacionamentos; todos os IDs
de catálogo são registrados antes de gravar. Documentos gerados por HTTP são
descobertos também após eventual resposta incerta.

O teardown encerra HTTP, recupera IDs e utiliza limparRegistrosTeste. Mesmo
após erro de descoberta, tenta remover os IDs conhecidos e reprova falhas de
limpeza. Uma conexão independente confere ausência por IDs em todas as coleções
envolvidas e por e-mails/relacionamentos de propriedade.

**Zero resíduos da Fase 3 confirmados por conexão independente.** Nenhum
teardown da regressão MongoDB falhou.

## Regressão desta rodada

| Execução | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Fase 3 específica, versão final | 27 | 0 | 0 |
| Fase 1 MongoDB | 29 | 0 | 0 |
| Fase 2 MongoDB | 28 | 0 | 0 |
| Suíte completa sem banco | 521 | 0 | 35 |
| Dez integrações MongoDB anteriores | 114 | 0 | 0 |

Os 35 ignorados na execução sem banco não foram classificados como aprovados
nessa execução. Todos os treze arquivos de integração foram executados nesta
rodada, um por processo e sequencialmente. Total das execuções MongoDB:
**198 aprovados, zero reprovados e zero ignorados**. Repetições da suíte
específica não foram somadas. Não somar novamente o total às linhas acima.

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

`node --check` no arquivo novo, `git diff --check` e
`npm.cmd run format:check`: **aprovados**. O Prettier do projeto ignora tests/;
não se afirma que seu script analisou o estilo interno da nova suíte.

## Arquivos, limites e conclusão

Criados: tests/jornadaIntegrada.issue94.mongo.test.js e este relatório.
Atualizado: tests/README.md, acrescentando instruções da Fase 3.
Evidências finais: tests/issue94-fase3-integracao-*.tap,
tests/issue94-fase3-regressao.tap, tests/issue94-fase3-diff-check.log e
tests/issue94-fase3-formatacao.log. issue94-fase3-especificos.tap registra a
primeira execução; a versão final inclui a comparação adicional do GET da
partida e do avatar e está no arquivo de integração específico da Fase 3.

Os testes e relatórios das Fases 1/2 foram preservados. A alteração manual
anterior de criancaController.js permanece intacta; nenhum arquivo de produção
foi modificado pelo Codex nesta rodada. Não houve instalação, commit, push ou PR.

Limites: esta jornada não cobre todas as combinações de entrada, dados legados,
falhas/retries de rede, carga, reinício do processo da API ou todas as ordens de
concorrência. A nova suíte não repete exclusão/arquivamento sobre os históricos
desta mesma jornada; esses contratos permanecem nas Fases 2/#58, reexecutadas.
Não foram acrescentados testes de uma fase adicional.

**Entrega para revisão: Fase 3 aprovada nos comportamentos efetivamente testados.**
