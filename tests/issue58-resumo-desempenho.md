> Registro histórico: as seções originais abaixo descrevem a revisão de
> 21/10/2026. As contagens e pendências dessa revisão são atualizadas na seção
> "Validação final — 23/10/2026", acrescentada ao fim do documento.

# Issue #58 — testes do resumo de desempenho

Validação em 21/10/2026, Node.js v24.21.0.

## Arquivos criados

- `tests/resumoDesempenho.issue58.test.js`: 18 testes HTTP e 5 unitários.
- `tests/helpers/resumoDesempenhoMock.js`: dados fictícios, execução de queries
  simulada, JWT temporário e servidor HTTP local com encerramento automático.
- `tests/issue58-resumo-desempenho.md`: este relatório.

Nenhum arquivo de produção, configuração ou credencial foi alterado por este
trabalho. As alterações de produção que já estavam no workspace foram mantidas.
Não foram executados Prettier, commit, push ou merge.

## Execução e resultados

```sh
env RUN_ATLAS_TESTS=0 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=0 node --test --test-reporter=tap tests/resumoDesempenho.issue58.test.js
env RUN_ATLAS_TESTS=0 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=0 npm test -- --test-reporter=tap
```

| Escopo | Aprovados | Falhos | Ignorados |
| --- | ---: | ---: | ---: |
| Issue #58, isolada | 23 | 0 | 0 |
| Regressão completa, incluindo #58 | 99 | 0 | 16 |

Os 16 testes/suítes ignorados exigem MongoDB real: 5 suítes Atlas, 10 testes de
concorrência e 1 suíte de commit real. Subtestes dentro das suítes ignoradas não
são executados nem contados individualmente pelo runner.

A primeira execução no sandbox falhou ao abrir o servidor local, com
`listen EPERM` (18 testes HTTP impedidos; 5 unitários aprovados). A repetição
autorizada fora do sandbox passou. Nenhuma expectativa foi afrouxada para isso.
Não houve falha de implementação nos cenários executados.

As três flags de banco permaneceram em zero. A suíte nova também bloqueia
`mongoose.connect` e `mongoose.createConnection` e intercepta todas as queries,
rejeitando Models ou operações inesperados. Não importa `index.js`, não carrega
`.env` e não usa MongoDB real. O JWT usa segredo fictício temporário no processo,
restaurado após cada teste; nenhum arquivo de credenciais é lido ou escrito.

## Cobertura dos cenários obrigatórios

| Cenário | Validação |
| --- | --- |
| 1 | Criança consulta seu resumo: 200 e corpo completo |
| 2 | Responsável vinculado: 200 e mesmos indicadores |
| 3 | Criança consulta outra criança: 403 sem ler histórico |
| 4 | Responsável sem vínculo: 403 sem ler histórico |
| 5 | Três formatos de ID inválido: 400 sem consultas |
| 6 | Criança inexistente: 404 sem ler histórico |
| 7 | Sem JWT: 401 sem consultas; também JWT/formato inválidos |
| 8 | Sem histórico: todos os indicadores zero, última interação null |
| 9 | 3 tentativas, 2 acertos, 1 erro e 66,67%; também extremos 0% e 100% |
| 10 | Soma 3 + 2 + 0 + 1 = 6 estrelas; legado sem pontuação vale zero |
| 11 | ObjectIds equivalentes e dificuldades diferentes não duplicam conclusão; erro não conclui tarefa |
| 12 | Inclui várias partidas/perfis; exclui outra criança e verifica filtro exato |
| 13 | Inclui referência a partida ausente e vínculo null, sem consultar partidas |
| 14 | Maior data em dados inseridos fora de ordem; verifica sort descendente |
| 15 | Falhas em criança, responsável e histórico: 500 genérico sem detalhes internos |

Os unitários também verificam a distinção entre Usuario._id e Crianca._id e
rejeições de usuário ausente, perfil inesperado, responsável inexistente e
criança sem vínculo.

## Pontos de atenção no código de produção, sem correções

1. A URL recebe Usuario._id, mas o resumo devolve Crianca._id em `criancaId`.
   Histórico e progresso devolvem o ID recebido. Essa diferença de contrato pode
   confundir o consumidor. Os testes registram o comportamento atual; não há
   requisito explícito nesta issue que determine qual ID deve ser retornado.
2. `validarAcessoCrianca` busca a criança antes de conferir a autorização.
   Um usuário autenticado sem vínculo pode diferenciar um usuário com perfil de
   criança existente (403) de um inexistente (404). Revisar se essa distinção é
   desejada na política da API.
3. O resumo carrega e ordena todo o histórico em memória. O schema apresentado
   não declara índice para `{ criancaId: 1, dataHora: -1 }`. Há risco de custo
   crescente com volume; os índices efetivos do banco não foram inspecionados.
4. O Controller registra o Error completo em console.error. A resposta HTTP
   passou nos testes de sigilo, mas a proteção/redação dos logs internos não é
   validada por esta suíte.

## Validação pendente com MongoDB real

Usar exclusivamente uma instância/banco de testes autorizado, sem produção.

- Confirmar persistência e casting dos vínculos Usuario/Crianca/Responsavel,
  isolamento entre crianças e resultados HTTP com documentos reais.
- Confirmar soma, percentual, deduplicação de ObjectIds e ordenação de Dates
  após inserir tentativas em várias partidas e perfis. O mock verifica a query
  solicitada e os cálculos do Service; não reproduz o motor do MongoDB.
- Criar e excluir uma partida pelo fluxo real e confirmar que o histórico
  permanece persistido e incluído no resumo. O cenário isolado parte de um
  histórico já preservado com referência pendente, sem simular a exclusão.
- Conferir índices/plano de consulta e tempo/memória com histórico volumoso.
- Executar as regressões com banco que ficaram ignoradas, em especial
  persistência após commit, rollback e concorrência.


## Validação final — 23/10/2026

A revisão final anterior à transferência para a branch
`feat/58-resumo-desempenho-crianca` confirmou os seguintes resultados:

| Escopo | Aprovados | Falhos | Ignorados |
| --- | ---: | ---: | ---: |
| Regressão offline completa, flags Atlas desativadas | 118 | 0 | 31 |
| Integração: resumo, isolamento e acesso | 12 | 0 | 0 |
| Integração: preservação do histórico | 3 | 0 | 0 |
| Total das duas suítes reais da issue #58 | 15 | 0 | 0 |

O levantamento atual da suíte com mocks totaliza **29 testes: 23 HTTP e
6 unitários**, ampliando os 23 casos da revisão histórica. Não somar esses 29
novamente aos 118 da regressão: eles já estão incluídos nesse total.

### Cobertura real comprovada

- Seis históricos com datas UTC fora da ordem cronológica: 6 tentativas,
  3 acertos, 3 erros, 50%, 6 estrelas e 2 tarefas distintas concluídas.
- Quarto: 3 tentativas, 2 acertos, 1 erro, 66,67% e 1 tarefa concluída;
  Cozinha: 3 tentativas, 1 acerto, 2 erros, 33,33% e 1 tarefa concluída.
- Criança sem histórico e isolamento entre crianças.
- Acesso da própria criança e do responsável vinculado; rejeição de outra
  criança e responsável sem vínculo; JWT ausente, inválido ou expirado;
  ID malformado e usuário sem cadastro de criança.
- Históricos e indicadores preservados após arquivar personagem pelo Service
  real e excluir partida pelo Service real; inclusão de histórico com vínculo null.
- Segunda conexão independente confirmou os documentos persistidos e a
  **limpeza em todos os 15 cenários reais**. As conexões foram encerradas.

### Contrato e dependências

A URL recebe `Usuario._id`; a autorização resolve `Crianca.usuarioId` e o resumo
filtra o histórico por `Crianca._id`, retornado em `criancaId` na resposta.
Os testes registram esse contrato, sem alterar a lógica de produção.
A exclusão de partida exige personagem ativo no Service atual; o cenário de
exclusão é independente daquele de arquivamento.

A infraestrutura compartilhada foi integrada pelo PR #86 e já pertence à base
`origin/main`. Esta entrega transfere somente a funcionalidade e os testes da
issue #58. A regressão isolada da infraestrutura registrou 89/0/16; a regressão
completa com a #58 registrou 118/0/31. São escopos diferentes.

### Reprodução e preparação da entrega

A regressão offline usa as três flags em zero e não carrega `.env`:

```sh
env RUN_ATLAS_TESTS=0 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=0 node --test --test-concurrency=1 --test-reporter=tap
```

Os comandos para executar deliberadamente cada suíte real estão no README.
Os resultados reais acima pertencem à validação anterior à separação/transferência;
**nenhuma integração real é executada nesta preparação da worktree**.

### Limitações e acompanhamento

Não houve falha funcional nos cenários executados. Permanecem a duplicação do
cenário de resumo completo com o acesso da própria criança e das expectativas
entre suítes; casos legados e erros internos cobertos somente por mocks;
validação de volume, índices efetivos e plano de consulta ainda pendente.
O Mongoose emitiu aviso de depreciação de `new: true` no arquivamento, sem falha.
A diferença entre IDs na URL/resposta e a distinção 403/404 descritas na revisão
histórica permanecem comportamentos existentes, sem correção nesta entrega.
