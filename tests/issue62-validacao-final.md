# Validação final da issue #62

## Confirmação após as duas últimas correções — 25/10/2026

**Resultado atual: issue #62 aprovada no escopo validado.** As duas pendências
da rodada abaixo foram corrigidas manualmente e seus testes agora passam.
Não foi identificada regressão nas suítes executadas nesta confirmação.

Foram novamente consultados os documentos de contexto/arquitetura, o código
atual e este relatório. Conferido no código: o PUT usa
`dadosTarefa.ordem == null`; o handler de SyntaxError/URIError está depois dos
Routers e da rota principal, antes do fallback 404.

| Cenário solicitado | Resultado observado | Estado |
| --- | --- | --- |
| JSON malformado | 400, application/json, erro:true e mensagem pública | Aprovado |
| GET /tarefas/%ZZ | 400, application/json, erro:true, sem stack/caminhos internos | Aprovado |
| Rota inexistente | 404, application/json, erro:true e mensagem pública | Aprovado |
| PUT de tarefa sem ordem | 400 antes de chamar o Service | Aprovado |
| PUT com ordem null | 400 antes de chamar o Service | Aprovado |
| PUT com ordem 0 | Aceito e encaminhado ao Service sem alteração | Aprovado |

Os testes HTTP importam o index.js real, substituindo apenas conexão, dotenv
e porta fixa. A manutenção pública de tarefas continua desativada: os casos
de PUT são chamadas internas do Controller, sem ativar Routes de produção.
Não foi necessário alterar ou flexibilizar testes; os testes existentes da
rodada anterior já reproduziam as duas pendências.

| Execução desta confirmação | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Específicos da #62, sem MongoDB | 299 | 0 | 0 |
| Suíte completa sem MongoDB | 521 | 0 | 32 |
| Dez suítes MongoDB, sequenciais | 114 | 0 | 0 |

Os 299 específicos estão incluídos nos 521 da suíte completa. As contagens
incluem agrupadores do Node. Os 32 ignorados sem banco **não foram aprovados
nessa execução**; os arquivos correspondentes foram depois executados com
integração habilitada. Nenhuma suíte MongoDB ficou sem execução nesta rodada.

Integrações: cômodos 16; consulta de histórico 16; histórico do jogo 14;
progresso 14; resposta por personagem 10; transação 5; concorrência real 10;
resumo 12; preservação 3; mídia 14. Todas com zero falhas e zero ignorados.
Antes de executar, o helper confirmou o banco exclusivo conectamente_testes e
suporte a transações. Foram preservados os procedimentos de isolamento,
abort/limpeza restrita às fixtures e verificação de resíduos de tests/README.md.
Não houve falha de teardown nem acesso a banco de desenvolvimento/produção.

Continuam aprovados os cenários de erro 400/401/403/404/409/500, os sucessos
200/201, os DELETEs públicos 204 sem corpo e os sete testes fixos de codigo
de progressão. As respostas de erro verificadas seguem
`{ erro: true, mensagem: string }`, preservando codigo onde aplicável.
Isso não constitui uma garantia sobre todas as entradas possíveis da API.

`git diff --check` e `npm.cmd run format:check`: **aprovados**. O segundo
inicialmente apontou somente index.js; o Codex aplicou exclusivamente Prettier
nesse arquivo, conforme autorização de formatação da rodada anterior. A suíte
completa foi reexecutada após a formatação. Nenhuma lógica de produção, Service,
Model, Route ou teste foi alterado pelo Codex nesta confirmação. Foram atualizados
este relatório e criadas evidências `issue62-confirmacao-*.tap` e
`issue62-confirmacao-*.log`. Não houve commit, push ou PR.

Evidências atuais: `issue62-confirmacao-especificos.tap`,
`issue62-confirmacao-completa.tap`, `issue62-confirmacao-mongo-*.tap`,
`issue62-confirmacao-diff-check.log` e `issue62-confirmacao-formatacao.log`.

## Registro histórico da rodada anterior (superado pela confirmação acima)

Data: 25/10/2026, America/Sao_Paulo. Node.js 24.22.1.

**Resultado: issue #62 ainda pendente.** As pendências anteriores foram
resolvidas, mas há uma regressão na validação de ordem do PUT de tarefa e um
400 do roteamento fora do contrato, com exposição de stack em desenvolvimento.
Nenhuma dessas duas lógicas foi corrigida pelo Codex.

## Escopo e comparação

Consultados `../CONTEXTO_DESENVOLVIMENTO.md`,
`../ANALISE_ARQUITETURA_BACKEND.md`, `tests/README.md` e o relatório anterior
`tests/issue62-validacao.md`, preservado como evidência da primeira rodada.

Revisados os 12 Controllers, 54 funções exportadas, dois middlewares, index.js
e 11 Routers (33 endpoints de negócio; 34 com GET /). As funções internas
com rotas desativadas também participam dos testes de Controller.

Base Git: `f662fe4b2d0ed22f7971ccaeada6123c9fcf63b5`, na branch
`62-padronizar-validações-e-respostas-de-erro-da-api`. A implementação permanece
em alterações locais. Foram comparados diff atual, trechos do relatório anterior
e comportamento executado. Não houve fetch, commit, push ou PR.

## Pendências anteriores versus estado atual

| Pendência do primeiro relatório | Estado atual | Evidência |
| --- | --- | --- |
| Auth: quatro retornos sem erro:true | Resolvida | Ausência/formato/assinatura/expiração de JWT e segredo ausente seguem contrato. |
| autorizarPerfil: dois retornos sem erro:true | Resolvida | 401 sem usuário e 403 de perfil negado aprovados. |
| historicoJogo: ID_INVALIDO e fallback 500 | Resolvida | Ambos padronizados; testes com Service real de ID inválido também passam. |
| progresso por partida: fallback 500 | Resolvida | Exceção técnica simulada gera 500 genérico padronizado. |
| responsavel: fallback 500 compartilhado | Resolvida | Sete funções testadas com exceção inesperada. |
| tarefa: 404 de consulta por ID | Resolvida | Registro ausente retorna erro:true e mensagem. |
| resposta: cinco 404 e três validações 400 | Resolvida | Consultas, POST, PUT, PATCH e DELETE cobertos. |
| PUT de usuário sem req.body | Resolvida | Retorna 400 antes de chamar o Service. |
| Login sem req.body | Resolvida | Retorna 400 antes de consultar credenciais. |
| Duplicidade de ordem de tarefa | Resolvida | Erro 11000 traduzido em 409 sem detalhes internos. |
| JSON malformado com resposta HTML/stack | Resolvida | Handler real do index retorna 400 JSON; nenhum stack/caminho no cenário de desenvolvimento. |
| Rota inexistente em HTML | Resolvida | Fallback real do index retorna 404 JSON. |
| Formatação dos arquivos alterados | Resolvida pelo Codex | Prettier e git diff --check aprovados após formatação. |

Os sete primeiros itens somam os 19 pontos de retorno do relatório inicial.
A aprovação desses pontos não cobre o novo caso URIError descrito abaixo.

## Resultados desta rodada

| Execução | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Suíte existente sem MongoDB | 222 | 0 | 32 |
| Específicos da #62 (unitários e HTTP isolados) | 295 | 4 | 0 |
| Suíte completa sem MongoDB | 517 | 4 | 32 |
| Dez suítes MongoDB sequenciais | 114 | 0 | 0 |

Não somar os específicos e existentes novamente à suíte completa. Os quatro
reprovados correspondem a **três cenários e um agrupador**: PUT sem ordem,
PUT com ordem null e URL malformada; o agrupador HTTP reprova por esse último.
Os 32 ignorados na execução sem banco não foram classificados como aprovados.
Todos os arquivos de integração correspondentes foram executados na rodada
MongoDB; não ficou suíte de integração sem execução.

| Integração MongoDB | Aprovados | Reprovados | Ignorados |
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

Antes das integrações, o helper validou o destino `conectamente_testes`, abriu
a conexão e confirmou suporte a transações. A execução autorizada fora do
sandbox usou MONGO_TEST_URI, sem fallback para MONGO_URI, um arquivo por
processo e sem sobreposição. Foram preservados os helpers de abort/limpeza
restrita às fixtures e suas verificações de ausência de resíduos. Não houve
falha de teardown. Nenhum banco de desenvolvimento/produção foi utilizado.

## Cobertura e comportamento preservado

- 400: bodies, IDs, validações Mongoose, regras e JSON malformado aprovados;
  pendências novas: ordem no PUT e parâmetro de URL malformado.
- 401: credenciais e JWT ausente, formato inválido, assinatura e expiração
  aprovados, incluindo HTTP nos 31 endpoints protegidos.
- 403: autorização, acesso e regras de progressão aprovados.
- 404: inexistência de registros e caminhos desconhecidos aprovados.
- 409: traduções de duplicidade e conflitos de domínio aprovadas.
- 500: exceções simuladas nas 54 funções e configuração JWT ausente retornam
  mensagens públicas sem detalhes técnicos injetados.
- 200/201: os 41 caminhos 200 e oito caminhos 201 de Controller continuam
  aprovados, além da rota raiz real. Payloads, JWT, senha oculta, indicadores,
  mídia, isolamento e persistência mantiveram a cobertura existente.
- 204: os cinco métodos de exclusão usam sendStatus(204). Os dois DELETEs
  públicos foram conferidos via HTTP real: corpo vazio e sem Content-Type.
- Sete testes fixos de progressão preservam status 403, mensagens e codigo:
  quatro do histórico e três da edição de partida. As integrações de progressão
  também passaram. Nenhum campo codigo foi removido.

A confirmação do contrato vale para os cenários aprovados acima. **Não há
conformidade integral da API**, devido ao URIError restante. Esta validação é
funcional; não mede porcentagem de cobertura de linhas nem certifica todos os
possíveis erros do Express ou segurança global dos logs.

## Problemas restantes e sugestões para correção manual

### 1. Regressão: PUT deixa passar ordem ausente/null

Local: `controllers/tarefaController.js:92`, em putTarefaById().

```js
!dadosTarefa.ordem == null ||
```

A negação transforma o valor em booleano antes de compará-lo com null; a
condição nunca detecta ausência. A base anterior e a primeira versão revisada
usavam a verificação por nulidade sem negação. O Controller agora chama o
Service com ordem ausente ou null; com retorno simulado bem-sucedido, responde
200 em vez de rejeitar com 400. O Service real pode rejeitar null na validação
Mongoose, mas isso não recupera a guarda perdida; atualizações com campo omitido
podem preservar a ordem anterior. A rota pública de PUT permanece desativada,
portanto o achado afeta a operação interna, não uma nova escrita pública.

Correção sugerida, **não aplicada**:

```js
dadosTarefa.ordem == null ||
```

Foram adicionados testes separados para omissão, null e zero. Os dois primeiros
reprovam; `ordem: 0` continua aceita e chega ao Service sem alteração.

### 2. URL malformada gera HTML e expõe stack em desenvolvimento

Reprodução: `GET /tarefas/%ZZ`, com JWT válido, usando o index.js real e
ambiente Express development. O roteador lança URIError ao decodificar o
parâmetro, antes de chamar o Controller. A resposta é HTTP 400 com Content-Type
text/html e stack/caminhos de node_modules. Não foi comprovada exposição de
credenciais. O stack detalhado é dependente do ambiente; em produção o Express
o oculta, mas a resposta padrão continua fora do formato JSON.

Local: `index.js:27`. O handler existente só reconhece SyntaxError de JSON e
está antes dos Routers, por isso não captura um URIError gerado posteriormente.
O fallback 404 de `index.js:59` tem assinatura de handler normal e não trata
esse erro.

Sugestão manual sem biblioteca ou nova abstração: reposicionar o handler
existente depois das rotas e antes do fallback 404, manter sua condição de JSON
e acrescentar uma condição específica para URIError de status 400, devolvendo
mensagem pública, por exemplo:

```js
if (error instanceof URIError && error.status === 400) {
  return res.status(400).json({
    erro: true,
    mensagem: "URL inválida",
  });
}
```

Preservar next(error) para erros que não correspondam às condições. Não foi
criado handler genérico, abstração ou alteração funcional pelo Codex.

## Arquivos modificados pelo Codex nesta rodada

**Somente formatação de produção:** os 12 arquivos de controllers/, index.js,
middleware/Auth.js e middleware/autorizarPerfil.js. A condição defeituosa de
ordem foi preservada para implementação manual. Services, Models, Routes e
regras de negócio não foram modificados.

**Testes:** atualizado apenas `tests/erros.issue62.test.js`. O teste HTTP agora
importa o index.js real sob isolamento: config/db-connection é substituído
antes da importação, dotenv.config é simulado para não carregar .env e listen
usa 127.0.0.1 com porta livre. Os Services continuam substituídos neste processo.
Assim, os tratamentos de JSON/404, a ordem dos handlers e os prefixos são
efetivamente os de produção, sem copiar os handlers para a aplicação de teste
e sem conectar ao banco real. Os testes MongoDB seguem seus helpers próprios.

**Documentação/evidências:** criado este relatório e os arquivos
`tests/issue62-final-*.tap` e `tests/issue62-final-*.log`. Os nove arquivos de
testes existentes modificados na primeira rodada permanecem como estavam.
O relatório e os logs da primeira rodada foram preservados.

## Verificações de formatação e reprodução

| Verificação final | Resultado |
| --- | --- |
| git diff --check | Aprovado, saída vazia |
| npm.cmd run format:check | Aprovado, todos os arquivos correspondentes formatados |
| prettier --debug-check em controllers/, middleware/ e index.js | Aprovado |
| git diff em Services, Models e Routes | Vazio |

Foi necessário normalizar a formatação em duas passagens do Prettier instalado;
a checagem final e a verificação de estabilidade passaram. Não houve edição
manual da lógica de produção. O comando npm.cmd executa o mesmo script npm
solicitado, sem depender da política de execução de npm.ps1 no PowerShell.

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/erros.issue62.test.js
node --test --test-concurrency=1 --test-reporter=tap
git diff --check
npm.cmd run format:check
```

Integrações: seguir os comandos e guardas de tests/README.md, com uma suíte por
processo e exclusivamente conectamente_testes. Evidências finais:
`issue62-final-especificos.tap`, `issue62-final-existentes.tap`,
`issue62-final-completa.tap`, `issue62-final-mongo-*.tap`,
`issue62-final-formatacao.log`, `issue62-final-diff-check.log` e
`issue62-final-prettier-debug.log`.

Após corrigir manualmente os dois pontos restantes, repetir os testes afetados
e a regressão antes de declarar a issue aprovada.
