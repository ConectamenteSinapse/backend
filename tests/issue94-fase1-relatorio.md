# Issue #94 — fase 1: identidade, vínculo e permissão

## Revalidação após correção manual — 25/10/2026

**Resultado atual: Fase 1 aprovada no escopo validado.** A pendência do primeiro
relatório foi corrigida manualmente e não houve reprovações nesta rodada.

Consultados novamente os documentos de contexto/arquitetura, tests/README.md
e o código atual. Em postCrianca(), a guarda `if (!req.body)` ocorre antes de
criancaService.postCrianca(). O objeto vazio continua aceito; dataNascimento
não se tornou obrigatória. Nenhum Service, Model ou Route foi alterado.

| Cenário verificado nesta rodada | Resultado |
| --- | --- |
| POST /criancas sem body, conta ainda sem perfil | 400, erro:true, mensagem pública exata; nenhum documento alterado |
| POST /criancas com {} | 201; dataNascimento null, vínculo null e permissão false persistidos; GET meu-perfil 200 |
| POST /criancas com data válida | 201; dataNascimento 2018-01-01T00:00:00.000Z na resposta e na conexão independente |
| Cadastro/login HTTP, JWTs, perfis e consultas | Aprovados |
| Duplicidades, proteção das senhas e isolamento | Aprovados |
| Vínculo e disputa concorrente por um vínculo | Aprovados |
| Negar → permitir → revogar → negar com mesmo JWT | Aprovado; resposta permitida com commit persistido |
| Limpeza das fixtures | Zero resíduos confirmados por conexão independente |

| Execução da revalidação | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Fase 1 MongoDB (28 cenários + agrupador) | 29 | 0 | 0 |
| Suíte completa sem MongoDB | 521 | 0 | 33 |
| Dez integrações MongoDB existentes | 114 | 0 | 0 |

Os 33 ignorados na execução sem banco não foram classificados como aprovados
nessa execução. Os onze arquivos de integração correspondentes foram todos
executados sequencialmente nesta rodada. As integrações anteriores mantiveram
16/16/14/14/10/5/10/12/3/14 aprovações, respectivamente para cômodos, consulta
de histórico, histórico do jogo, progresso, personagem/resposta, transação,
concorrência, resumo, preservação e mídia. Total das execuções MongoDB desta
rodada: 143 aprovados, zero reprovados e zero ignorados.

Usou-se exclusivamente MONGO_TEST_URI validada por atlasSeguro.js para
conectamente_testes. A fase revalidou persistência por conexão independente,
hashes, perfis, vínculo, permissão, histórico e estrelas, e confirmou ausência
de resíduos por IDs, e-mails exclusivos e relacionamentos próprios. Nenhum
teardown falhou nas onze suítes. Não houve seed permanente, limpeza geral ou
operações em bancos de desenvolvimento/produção.

`node --check` no teste, `git diff --check` e `npm.cmd run format:check`:
**aprovados**. A formatação inicialmente apontou apenas criancaController.js;
o Codex aplicou somente Prettier nesse arquivo, sem mudar a correção manual.
O script de formatação do projeto continua ignorando tests/.

Arquivos modificados pelo Codex nesta revalidação:

- controllers/criancaController.js: exclusivamente formatação.
- tests/identidadeVinculo.issue94.mongo.test.js: reforçada a comparação da data
  válida persistida e da mensagem do 400; adicionado cenário 28 para {} válido.
- tests/README.md: quantidade atual de cenários e referência à revalidação.
- Este relatório: conclusão atual e registro de resultados; histórico abaixo
  preservado para comparação.
- Evidências novas: tests/issue94-revalidacao-integracao-*.tap,
  tests/issue94-revalidacao-regressao.tap, tests/issue94-revalidacao-diff-check.log
  e tests/issue94-revalidacao-formatacao.log.

Não foram encontrados novos problemas funcionais nos cenários executados.
Nenhuma lógica de produção/dependência foi alterada pelo Codex. Não houve
commit, push ou PR. **A Fase 2 não foi iniciada.**

## Registro histórico da execução inicial (superado pela revalidação acima)

Data: 25/10/2026, America/Sao_Paulo. Node.js 24.22.1.
Branch: `94-test-validar-fluxos-completos-e-integracao-da-api-conectamente`.
Base: `18f2b39` (merge da issue #62). A árvore estava limpa ao iniciar.

**Fase implementada e executada, com uma pendência funcional para correção
manual.** O fluxo principal passou. POST /criancas sem body retorna 500 em vez
de 400 para uma conta infantil ainda sem perfil. Não foi alterada produção.

## Escopo e implementação

Consultados CONTEXTO_DESENVOLVIMENTO.md, ANALISE_ARQUITETURA_BACKEND.md,
tests/README.md, Routes, Controllers, Services e Models atuais antes das
expectativas. O teste novo é `identidadeVinculo.issue94.mongo.test.js`.

- Contas, login, perfis e vínculos usam HTTP e os componentes reais.
- Todos os JWTs são obtidos de POST /usuarios/auth; jwt.verify apenas confere
  as claims/expiração, sem fabricar tokens.
- Nenhum Service, Model, query, sessão, bcrypt ou resultado MongoDB é mockado.
- São montados os Routers reais, com os prefixos de produção, em porta local
  livre. Não importa index.js nem carrega .env automaticamente.
- Não há GET público de perfil responsável. A consulta disponível é
  /responsaveis/minhas-criancas; o documento Responsavel é também confirmado
  pela segunda conexão. Nenhuma rota desativada foi habilitada.
- A atividade, personagem e partida são apenas suporte à prova da permissão:
  criação interna com IDs registrados antes da escrita. Não se iniciou a fase
  de testes do CRUD de personagens/partidas. O catálogo temporário usa o helper
  existente e é removido ao terminar; não houve seed permanente.

## Resultados individuais da versão final

| Nº | Cenário | Resultado |
| --- | --- | --- |
| 01 | Cadastrar responsável por HTTP; conferir hash persistido | Aprovado |
| 02 | Cadastrar criança por HTTP; conferir hash persistido | Aprovado |
| 03 | Login de ambos; JWTs reais com id/perfil e expiração de 5h | Aprovado |
| 04 | Consultar contas próprias com os JWTs do login | Aprovado |
| 05 | Cadastro duplicado retorna 409 sem mudar usuário/hash | Aprovado |
| 06 | Campos obrigatórios/perfil inválido no cadastro: 400 sem escrita | Aprovado |
| 07 | Login inválido/obrigatórios: 401/400 sem escrita | Aprovado |
| 08 | Consulta infantil sem perfil: 404 | Aprovado |
| 09 | Criar perfil responsável e confirmar Usuario relacionado | Aprovado |
| 10 | Criar perfil infantil; ignorar injeção de dono/vínculo/permissão | Aprovado |
| 11 | Consultar perfil infantil e listagem do responsável recém-criado | Aprovado |
| 12 | Perfis duplicados: 409 sem alteração de documentos | Aprovado |
| 13 | JWT ausente e troca de papéis: 401/403 sem escrita | Aprovado |
| 14 | Criar outro responsável e conta infantil sem perfil por HTTP | Aprovado |
| 15 | Vínculo rejeita senha/e-mail/perfil inválidos e criança sem perfil | Aprovado |
| 16 | Vincular criança; confirmar proprietário e permissão false no banco | Aprovado |
| 17 | Listagem de crianças isolada por responsável | Aprovado |
| 18 | Vínculo duplicado pelo mesmo ou outro responsável: 409 | Aprovado |
| 19 | Responsável alheio não altera permissão; criança não assume papel | Aprovado |
| 20 | Permissão exige booleano e Crianca._id, não Usuario._id | Aprovado |
| 21 | Resposta com permissão inicial false: 403 sem efeitos | Aprovado |
| 22 | Ativar permissão; confirmar no banco e no perfil HTTP | Aprovado |
| 23 | Mesmo JWT infantil registra resposta 201; commit persiste | Aprovado |
| 24 | Revogar com false; confirmar persistência | Aprovado |
| 25 | Mesmo JWT é bloqueado após revogação; histórico/estrelas inalterados | Aprovado |
| 26 | Vínculos HTTP concorrentes: um 200, um 409 e proprietário único | Aprovado |
| 27 | Criar perfil infantil sem body: deveria retornar 400 sem escrita | **Reprovado: HTTP 500** |

As asserções de ausência de escrita são executadas em finally, inclusive
quando a expectativa de status falha. Comparações de estado usam documentos
da própria execução e não imprimem seus hashes/senhas em caso de diferença.

## Contagens e regressão

| Execução | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Nova fase 1 com MongoDB, versão final | 26 | 2 | 0 |
| Suíte completa sem MongoDB | 521 | 0 | 33 |
| Dez integrações MongoDB existentes | 114 | 0 | 0 |

A nova fase contém **27 cenários: 26 aprovados e 1 reprovado**. O Node também
reprova o agrupador, resultando em 28 testes contabilizados e 2 reprovações.
Não são duas falhas funcionais distintas. Execuções anteriores repetidas não
foram somadas. A versão final do teardown foi reexecutada com MongoDB e a
suíte sem banco foi repetida após sua alteração.

Os 33 ignorados na suíte sem banco incluem o novo agrupador opt-in e os 32
casos de integração anteriores. Não foram classificados como aprovados nessa
execução. Todos os onze arquivos de integração foram executados separadamente.

| Integração existente | Aprovados | Reprovados | Ignorados |
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

As suítes anteriores de personagens/partidas foram somente reexecutadas como
regressão; não foram ampliadas e não representam início da próxima fase.

`node --check` no arquivo novo, `git diff --check` e
`npm.cmd run format:check`: **aprovados**. tests/ continua ignorado pelo
Prettier do projeto; não se afirma que o script verificou seu estilo interno.

## Persistência, isolamento e limpeza

As duas conexões são abertas pelo atlasSeguro.js e confirmadas em
conectamente_testes, com clients distintos. Nenhum fallback para MONGO_URI.
Execuções reais ocorreram uma por vez, sem sobreposição de suítes MongoDB.

A leitura independente confirmou:

- Usuario criado pelos endpoints, senha diferente do texto informado, bcrypt
  válido com custo 12, sem senha/hash nas respostas de cadastro/login/consulta.
- Perfis ligados aos IDs de Usuario retornados pela API.
- Criança inicialmente sem responsável e com permissaoAtiva false, mesmo com
  tentativa de enviar esses campos no cadastro.
- Vínculo com Responsavel._id, alterações true/false e isolamento das listas.
- Um histórico após a resposta permitida, pontuação 1 e estrelas da partida 1,
  lidos fora da sessão do Service após commit.
- Nenhum histórico/estrela adicional nas rejeições antes e após a permissão.
- Na concorrência, somente o responsavelId da criança alvo mudou; o perdedor
  continuou sem autorização para alterar a permissão.

O teste concorrente envia dois pedidos em Promise.all. Não fabrica respostas
nem força uma intercalação específica dentro do MongoDB. Comprova o resultado
de uma disputa real observada, sem prometer cobrir todas as ordens possíveis.

As APIs não permitem escolher seus IDs. Por isso o teste registra e verifica
ausência dos e-mails exclusivos antes de enviar POST /usuarios, e recupera IDs
por esses e-mails exatos e perfis por usuarioId próprio. Isso cobre criações
mesmo após resposta HTTP incerta. As fixtures internas têm IDs registrados
antes da inserção. O teardown aguarda handlers HTTP, descobre IDs e chama
limparRegistrosTeste apenas com IDs próprios; continua tentando remover IDs
conhecidos mesmo se a descoberta falhar, e reprova qualquer falha.

**A execução final confirmou zero resíduos**, pela conexão independente:
checagem de todas as coleções envolvidas por IDs e também por e-mails,
usuarioId dos perfis e perfilJogoId dos históricos próprios. Não houve falha
de teardown nas execuções. Nenhuma coleção foi esvaziada nem documento de
desenvolvimento/produção foi acessado ou removido.

## Falha funcional e reprodução

1. POST /usuarios com perfil crianca e credenciais fictícias válidas.
2. POST /usuarios/auth; usar o token retornado.
3. Antes de criar perfil infantil, POST /criancas com Authorization Bearer
   desse token e **sem corpo de requisição**.
4. A API retorna **500**, com mensagem genérica; o esperado é 400 por entrada
   ausente. Nenhum perfil é criado e o estado persistido permanece inalterado.

Causa observada: `controllers/criancaController.js:108` passa req.body sem
guarda. `services/criancaService.js:47` acessa dadosCrianca.dataNascimento;
quando undefined, lança TypeError. O Controller captura e traduz em 500.
Não houve exposição do TypeError ao cliente; ele aparece no log interno.

Sugestão para implementação manual: em postCrianca(), antes de chamar o
Service, rejeitar body ausente/null com o contrato da API:

```js
if (!req.body) {
  return res.status(400).json({
    erro: true,
    mensagem: "Body da requisição obrigatório",
  });
}
```

Preservar `{}` como entrada válida se a intenção continuar sendo perfil sem
dataNascimento, que é opcional. Não tornar a data obrigatória apenas para
corrigir essa falha. **Nenhuma correção de produção foi aplicada.**

## Arquivos e próximos passos

- Criado: tests/identidadeVinculo.issue94.mongo.test.js.
- Atualizado: tests/README.md, com execução e rastreamento das fixtures HTTP.
- Criado: este relatório e evidências issue94-fase1-*.tap/log.
- Nenhum arquivo de produção/dependências foi modificado. Nenhum commit,
  push, PR ou instalação foi realizado.

Evidência final da fase: issue94-fase1-integracao-identidadeVinculo.issue94.mongo.test.js.tap.
Regressão: issue94-fase1-regressao.tap e demais issue94-fase1-integracao-*.tap.
O arquivo issue94-fase1-mongo.tap registra a execução inicial; não deve ser
somado ao resultado final.

**Aguardando revisão da fase 1.** Corrigir manualmente a guarda do body e
reexecutar o cenário 27 e a fase antes de aprová-la integralmente. A próxima
fase de personagens/partidas não foi iniciada.
