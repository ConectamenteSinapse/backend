# Issue #94 — Fase 2: personagens e partidas

Data: 25/10/2026, America/Sao_Paulo. Node.js 24.22.1.
Branch: `94-test-validar-fluxos-completos-e-integracao-da-api-conectamente`.
Base: `18f2b39`, mantendo as alterações ainda não commitadas da Fase 1.

**Conclusão: Fase 2 aprovada no escopo validado.** Nenhum problema funcional
foi encontrado nos cenários executados. Não houve alteração de produção,
dependências, commit, push ou PR.

## Contratos conferidos e reaproveitamento

Consultados CONTEXTO_DESENVOLVIMENTO.md, ANALISE_ARQUITETURA_BACKEND.md,
tests/README.md, Routes, Controllers, Services e Models de personagens e
partidas, perfilJogo.test.js, jogoSalvo.issue73.test.js e a suíte da Fase 1.

O usuário confirmou durante esta rodada que o DELETE de partida deve validar
o **comportamento atual**: remove o documento de jogos_salvos e preserva seus
históricos. Não foi criada expectativa de soft delete nem exigência de uma
partida por personagem. O personagem, por sua vez, é arquivado logicamente.

Reaproveitamento:

- atlasSeguro.js: validação exclusiva de conectamente_testes, conexão, Models,
  preparação aditiva de índices/coleções e limpeza restrita aos IDs próprios.
- catalogo.js: fixtures temporárias com IDs registrados antes da escrita,
  posicionadas antes do catálogo existente sem modificá-lo.
- Fase 1: mesma estratégia de cadastro/login HTTP, rastreamento de e-mails
  exclusivos antes do POST, descoberta dos IDs gerados pela API, leitura por
  conexão independente, snapshots de estado e verificação de zero resíduos.
- #71/#73: reaproveitados contratos e expectativas de defaults, campos
  permitidos, isolamento, retomada e arquivamento/exclusão. Essas suítes com
  mocks permaneceram intactas e foram executadas na regressão. Seus helpers
  de persistência simulada não foram usados na nova jornada real.

A nova suíte concentra-se na lacuna de HTTP com persistência real, populate,
consultas entre requisições e efeitos sobre documentos relacionados. Não
repete todas as combinações de tipos/erros já cobertas nos testes isolados.

## Novos cenários executados

Arquivo: tests/personagensPartidas.issue94.mongo.test.js.

| Nº | Cenário | Resultado |
| --- | --- | --- |
| 01 | Duas crianças e responsável preparados por cadastro/login HTTP reais | Aprovado |
| 02 | Listas iniciais vazias de personagens e partidas | Aprovado |
| 03 | Criar personagem: defaults, normalização e proprietário seguro | Aprovado |
| 04 | Segundo personagem da mesma criança e personagem de outra criança | Aprovado |
| 05 | Listagem exclusiva do dono e consulta por ID | Aprovado |
| 06 | PATCH altera apenas nome/imagem e persiste | Aprovado |
| 07 | PATCH inválido não grava alterações parciais | Aprovado |
| 08 | Criança alheia não lê, edita ou arquiva personagem | Aprovado |
| 09 | Criar partida: defaults, proprietário e nome normalizado | Aprovado |
| 10 | Várias partidas por personagem e por diferentes personagens | Aprovado |
| 11 | Listagem/GET com populate real e isolamento por criança/personagem | Aprovado |
| 12 | PATCH ignora troca de personagem, estrelas e datas protegidas | Aprovado |
| 13 | Salvar cômodo/tarefa/dificuldade permitidos; confirmar no banco | Aprovado |
| 14 | Retomar por GET após novo login e reabertura da conexão de leitura | Aprovado |
| 15 | Outra criança não lê, altera, exclui nem cria partida em personagem alheio | Aprovado |
| 16 | JWT ausente e perfil responsável bloqueados nas dez operações da fase | Aprovado |
| 17 | IDs inválidos/inexistentes: 400/404 sem escrita | Aprovado |
| 18 | Posição inconsistente não salva nem alteração parcial do nome | Aprovado |
| 19 | Bloqueios de dificuldade/tarefa/cômodo preservam estado e codigo | Aprovado |
| 20 | Históricos sentinela persistidos somente como fixtures de preservação | Aprovado |
| 21 | DELETE da partida: 204 sem corpo; somente ela removida; históricos preservados | Aprovado |
| 22 | Partida excluída ausente da lista; GET/DELETE repetido 404 | Aprovado |
| 23 | Partidas irmãs e dados da outra criança continuam acessíveis | Aprovado |
| 24 | DELETE do personagem: 204; status arquivado sem apagar relacionados | Aprovado |
| 25 | Arquivado fora da lista; consulta/edição/DELETE/novo save bloqueados | Aprovado |
| 26 | Partidas do arquivado persistem, mas ficam inacessíveis | Aprovado |
| 27 | Personagem ativo restante e outra criança continuam operacionais | Aprovado |

O agrupador também passou: **28 aprovações** na contagem do Node, referentes
aos 27 cenários acima mais seu agrupador. Nenhum teste específico foi ignorado.

## Regressão e verificações

| Execução desta rodada | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Fase 2 específica com MongoDB | 28 | 0 | 0 |
| Fase 1 com MongoDB | 29 | 0 | 0 |
| Suíte completa sem MongoDB | 521 | 0 | 34 |
| Dez integrações MongoDB anteriores | 114 | 0 | 0 |

Os 34 ignorados sem banco não foram contados como aprovados nessa execução.
Os doze arquivos de integração correspondentes foram executados separadamente,
sem sobreposição no MongoDB. Total das execuções MongoDB: **171 aprovados,
zero reprovados e zero ignorados**. Não somar novamente o total às linhas acima.

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
isso não comprova uma verificação de estilo do arquivo novo. Nenhum formatador
com escrita foi executado nesta rodada.

## Persistência e isolamento

Todos os usuários, perfis infantis, personagens e partidas da nova jornada
foram criados pelos endpoints reais, com JWTs obtidos pelo login HTTP. Nenhum
Service, Model, query ou resultado foi substituído por mock.

Uma segunda conexão, com client independente, confirmou documentos completos,
associações de propriedade, defaults, alterações permitidas e posição salva.
As listas e consultas exercitaram populate real de nome/imagem e propriedade.
A retomada usou outro login e uma conexão de leitura reaberta, comparando os
campos devolvidos por HTTP aos persistidos. Não simula reinício do processo.

As tentativas rejeitadas com 400/401/403/404 preservaram snapshots dos documentos
próprios, conferidos mesmo quando uma asserção falha. Tentativas de trocar dono,
personagem, estrelas, nível/status ou datas protegidas não alteraram esses campos.
Excluir uma partida não afetou outra partida do mesmo personagem, outra do
segundo personagem nem a de outra criança. Arquivar o primeiro personagem
preservou o segundo e a outra criança, com acesso normal aos recursos ativos.

Dois históricos sentinela foram inseridos como fixtures com IDs registrados
antes da escrita. A exclusão de partida e o arquivamento preservaram seus
documentos completos, inclusive o jogoSalvoId original. Esses registros não
pretendem simular um fluxo de pontuação consistente; servem somente à prova
de preservação. **Nenhum novo teste de endpoint de histórico, progresso ou
desempenho foi implementado.** As suítes dessas áreas foram apenas reexecutadas
como regressão expressamente solicitada.

O comportamento observado após arquivamento é: personagem permanece no banco,
partida restante permanece no banco, ambos deixam de ser expostos como ativos;
GET/PATCH/DELETE da partida do arquivado retornam 404. Não é tratado como falha,
pois corresponde aos filtros atuais e aos contratos anteriores.

## Segurança do banco e limpeza

Apenas MONGO_TEST_URI, com banco exatamente conectamente_testes, foi utilizada.
As conexões e vínculos de Models foram validados pelos helpers existentes.
Não houve acesso a banco de desenvolvimento/produção, seed permanente ou
limpeza geral de coleções. A preparação criou somente fixtures temporárias e
usou o procedimento aditivo de preparação de coleções/índices já existente.

Como os endpoints geram IDs, e-mails exclusivos foram registrados e tiveram
ausência conferida antes dos cadastros. A descoberta segue exclusivamente
e-mail próprio → Usuario._id → Crianca._id → PerfilJogo._id → partidas/históricos.
IDs descobertos são mantidos mesmo após exclusão, e fixtures internas possuem
IDs registrados antes de gravar. Assim também há recuperação após criação HTTP
com resposta incerta, sem varrer ou excluir registros alheios.

O teardown encerra os handlers HTTP, descobre os IDs e utiliza
limparRegistrosTeste. Mesmo após falha de descoberta, tenta limpar os IDs
conhecidos; qualquer falha de descoberta/limpeza reprova a suíte. A conexão
independente verifica ausência por IDs em todas as coleções envolvidas e por
e-mails/relacionamentos de propriedade.

**Zero resíduos da Fase 2 foram confirmados pela conexão independente.**
A Fase 1 e as integrações anteriores também encerraram sem falha de teardown.

## Arquivos e limites da entrega

Criados:

- tests/personagensPartidas.issue94.mongo.test.js.
- tests/issue94-fase2-relatorio.md.
- Evidências tests/issue94-fase2-especificos.tap,
  tests/issue94-fase2-regressao.tap, tests/issue94-fase2-integracao-*.tap,
  tests/issue94-fase2-diff-check.log e tests/issue94-fase2-formatacao.log.

Modificado: tests/README.md, somente acrescentando instruções da Fase 2.

Preservados por comparação de hashes antes/depois: teste da Fase 1, relatório
da Fase 1 e criancaController.js com a correção manual ainda não commitada.
As demais alterações e evidências anteriores não foram removidas. Nenhum
arquivo de produção ou dependência foi modificado nesta rodada.

A aprovação se limita aos cenários executados, não a todas as combinações
possíveis de entrada. A próxima fase de histórico/progresso/desempenho não foi
iniciada. Entrega apresentada para revisão, sem commit, push ou PR.
