# Issue #107 — Heartbeat, pausa e encerramento

Execução em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
Service e Model atuais, testes de tempo e helpers de persistência e isolamento.
Produção implementada pelo aluno e preservada nesta etapa.

## Resultados da revalidação após a correção manual

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Unitários existentes do ciclo: 79 testes | 79 | 0 | 0 |
| Integração existente: 72 cenários e um agrupador | 73 | 0 | 0 |
| Regressão completa sem MongoDB: 978 testes | 935 | 0 | 43 |
| Cinco suítes de tempo sem banco, TZ=UTC: 268 testes | 268 | 0 | 0 |
| Cinco suítes de tempo sem banco, TZ=Asia/Tokyo: 268 testes | 268 | 0 | 0 |
| Integração estendida em memória: 73 testes existentes + 15 cenários adicionais | 88 | 0 | 0 |

As três falhas anteriores foram corrigidas, sem novas falhas ou regressões.
Não somar repetições nem a auditoria complementar à contagem da regressão:
ela foi executada separadamente, em memória, sem modificar arquivos de teste.
Não houve cancelamentos ou TODOs. Todos os comandos retornaram código 0.

Comparação histórica: a rodada anterior teve 76 aprovados e 3 falhas nos
unitários, 69 aprovados e 4 falhas na integração (três cenários e seu agrupador),
e 932 aprovados, 3 falhas e 43 ignorados na regressão. Os 43 ignorados continuam
sendo integrações opt-in. As demais integrações antigas não foram reexecutadas
com banco nesta etapa. Nenhuma expectativa ou arquivo de teste foi alterado.

## Falha anterior corrigida — encerramento sem origem válida do consumo

Na rodada anterior, a ausência ou invalidade de `sessaoJogoContabilizadoEm`
permitia renovar sem somar segundos. A implementação atual identifica essa
situação antes do cálculo normal, encerra condicionalmente e retorna
`SESSAO_INVALIDA`. A persistência foi confirmada por conexão independente.

Entrada comum dos três casos, além dos IDs próprios das fixtures:

```js
{
  permissaoAtiva: true,
  limiteTempoDiario: 1,
  tempoUsadoHoje: 12,
  dataReferenciaTempo: "2026-10-29",
  sessaoJogoEstado: "ativa",
  sessaoJogoId: "sessao-ciclo-107",
  sessaoJogoVersao: 0,
  sessaoJogoExpiraEm: new Date("2026-10-29T15:00:30Z")
}
// Operação em 15:00:10Z.
```

| Último instante na entrada | Esperado | Obtido e persistido nesta revalidação |
|---|---|---|
| Propriedade fisicamente ausente | Encerrar condicionalmente sem inventar consumo | `SESSAO_INVALIDA`; estado encerrado, expiração null, consumo 12; marcador continua fisicamente ausente |
| null | Mesma proteção | `SESSAO_INVALIDA`; estado encerrado, expiração null, consumo 12 e marcador null |
| String `data-invalida` no BSON | Mesma proteção | `SESSAO_INVALIDA`; estado encerrado, expiração null, consumo 12; string legada preservada |

Nos três casos, uma escrita bem-sucedida incrementa a versão exatamente uma
vez, preservando consumo, referência diária, identidade, vínculos e demais
campos. O caso de origem ausente também foi exercitado com versão fisicamente
ausente: cria versão 1. Repetir o heartbeat retorna `SESSAO_INATIVA` e não muda
nenhum campo. Não há renovação da expiração nem atribuição de segundos fictícios.

A correção foi conferida no ramo após a validação do estado da sessão: valida a origem e usa
filtro com `_id`, identificador, estado ativo e versão. Quando não encontra o
snapshot, continua o laço e relê. Depois de gravar o encerramento, lança o erro.

Os três testes de robustez existentes aceitam qualquer Error e retornam sem
verificar o documento após a rejeição. Portanto, sua aprovação isolada não
comprovaria o encerramento persistido. Para cumprir a validação sem alterar
testes, uma auditoria complementar com `node:test` foi executada via stdin,
inteiramente em memória. Ela exigiu a mensagem exata, leu o documento completo
por cliente independente e induziu conflitos reais antes do driver original.

## Conflitos no novo ramo de encerramento

Para cada origem ausente, null e string inválida, foram executados cinco
cenários complementares. A última execução estendeu em memória o agrupador
existente com esses 15 casos, totalizando 88 testes, todos aprovados:

| Situação | Resultado confirmado |
|---|---|
| Sem conflito | Encerra, limpa expiração, preserva 12 segundos e lança `SESSAO_INVALIDA`; repetir não altera o documento |
| Um escritor concorrente incrementa a versão antes da primeira escrita | Primeira escrita perde; nova consulta e segunda escrita encerram com versão 2 e consumo preservado |
| Conflito antes de cada uma das três tentativas | `CONFLITO_SESSAO`, exatamente três envios; permanecem somente os incrementos do concorrente; não concede nova validade nem altera consumo |
| Outra sessão substitui identificador e instantes antes da escrita | Filtro antigo não encontra; releitura retorna `SESSAO_INVALIDA` e a sessão substituta fica integralmente preservada |
| Concorrente corrige a origem para 15:00:00Z e incrementa versão | Releitura abandona o ramo inconsistente, calcula 12 + 10 = 22 segundos e renova validamente; versão 2 |

No esgotamento dos conflitos, o estado antigo pode continuar ativo porque
nenhuma escrita do heartbeat venceu. Isso é falha de concorrência sinalizada,
não sucesso de encerramento; o caller deve tratar `CONFLITO_SESSAO` sem assumir
que houve gravação. Nenhuma expiração é ampliada nesse cenário.

As escritas concorrentes, comparações de documentos e limpeza usaram somente
fixtures próprias em `conectamente_testes`. O teardown da auditoria confirmou
zero resíduos por conexão independente. O código complementar não foi salvo
como nova suíte e não faz parte dos 978 testes da regressão.

## Comportamentos corretos preservados

- Heartbeat aos dez segundos soma exatamente dez e renova por até trinta.
  Heartbeats repetidos no mesmo instante e sequências fracionárias não duplicam
  segundos. Limite null mantém a contabilização e a validade máxima.
- A expiração é reduzida ao saldo restante. Quando restam cinco segundos após
  contabilizar o intervalo, a nova validade é agora + cinco segundos.
- Sessão expirada não é reativada. O consumo é persistido somente até a antiga
  expiração, seguido de estado encerrado, expiração null e `SESSAO_EXPIRADA`.
- Limite atingido com sessão ainda válida contabiliza e encerra antes de
  retornar `LIMITE_TEMPO_ATINGIDO`. Se o limite foi reduzido e o intervalo real
  ultrapassa o saldo, o consumo observado pode ultrapassar o limite; não é
  truncado artificialmente.
- Quando limite e expiração ocorrem juntos, o estado fica encerrado e o saldo
  correto é salvo, mas a mensagem tem precedência de `SESSAO_EXPIRADA`. Trata-se
  do contrato atual; não foi considerado falha porque a continuidade é bloqueada.
- Permissão revogada impede heartbeat, contabiliza o pendente e encerra. Pausa
  e encerramento continuam permitidos para interromper uma sessão já existente.
- Meia-noite em São Paulo renova o saldo. O trecho do novo dia é preservado,
  inclusive se a primeira operação ocorrer depois da expiração anterior.
- Pausa e encerramento contabilizam até agora ou até a expiração, o que ocorrer
  antes, limpam a expiração e interrompem o consumo. Repetições retornam
  `SESSAO_INATIVA`, preservando integralmente o documento.
- Sessões de outra criança, identificadores inválidos, sessões antigas ou
  estados inativos não alteram a sessão atual. A troca de identificador entre
  leitura e escrita também foi testada no banco real.
- Ausência física de versão é aceita nas operações exercitadas; o primeiro
  sucesso grava versão 1. Novos erros de validação do identificador acontecem
  antes de consultar ou escrever nos unitários.
- Ausência, null ou invalidade da expiração impede heartbeat e encerra com
  `SESSAO_EXPIRADA`, sem criar consumo fictício. Pausa/encerramento também param
  sessões com datas ausentes/inválidas sem produzir NaN. Nesses dados defeituosos,
  não foi comprovada reconstrução do intervalo desconhecido. Um marcador
  inválido pode permanecer no BSON após finalizar, embora não haja continuidade.
- Pausar e iniciar outra sessão cria um novo UUID. Vinte segundos de pausa não
  entram no consumo; dez segundos na nova sessão entram normalmente. Heartbeat
  do identificador antigo é rejeitado sem tocar na nova sessão.

## Concorrência e retries comprovados no MongoDB

Não há transação externa nem resultados de persistência simulados. Barreiras
antes do driver garantem que as propostas concorrentes partem da mesma versão.
Depois da barreira, o driver original executa a operação no MongoDB.

Dois heartbeats simultâneos obtêm sucesso, com um conflito e recálculo: o total
final é 22 (12 + 10), versão 2, e não 32.

Heartbeat contra pausa e heartbeat contra encerramento foram exercitados nas
duas ordens de gravação:

- Se heartbeat grava primeiro, a finalização relê e conclui sem acrescentar
  novamente os dez segundos; ambas as operações obtêm sucesso, versão 2.
- Se finalização grava primeiro, heartbeat perde a condição, relê e retorna
  `SESSAO_INATIVA`; total 22, versão 1.

O estado final é sempre pausado ou encerrado, com expiração null. Nenhum
heartbeat reativa a sessão finalizada.

Para cada uma das três operações, outra conexão modifica somente a fixture
antes da primeira escrita: total 18, marcador 15:00:05Z e versão incrementada.
A releitura às 15:00:10Z resulta em 23 segundos, e não no total antigo 22. Os
unitários também avançam o relógio durante o conflito para confirmar que ele
é novamente obtido. Três conflitos consecutivos terminam em `CONFLITO_SESSAO`
sem quarto envio; somente incrementos do escritor concorrente ficam gravados.

## Riscos e decisões pendentes, sem falha adicional comprovada

`finalizarSessaoJogo()` foi descrita como interna, porém continua na lista de
exports públicos. Os wrappers fixam os estados corretos, mas um chamador direto da
função exportada pode fornecer `estadoFinal`. Não foi demonstrada uma rota HTTP
que permita esse uso. Recomenda-se confirmar a intenção e manter a função
interna, ou definir e validar um contrato público restrito. Nenhum export foi
alterado pelo Codex.

O Service repete o filtro de versão compatível com legado,
o limite de três tentativas e partes da consulta/atualização em início,
heartbeat, finalização e no auxiliar de consumo. A duração limitada ao saldo
aparece no início e na renovação. Isso aumenta o risco de correções divergentes;
não demonstra, por si só, outro defeito funcional.

A correção de origem temporal funcionou sem refatorar. Em etapa futura
autorizada, pode-se avaliar extração local dos trechos repetidos,
mantendo os filtros de sessão e estado: o auxiliar antigo de atualização só
filtra por ID e versão e não deve substituir cegamente as operações do ciclo.

Não foram identificadas referências às novas operações em Controllers/Routes
na inspeção. Estes testes exercitam Services, não uma API HTTP nova nem o
cronômetro do frontend. A integração com registro de respostas, o disparo
automático de heartbeat, múltiplas abas no cliente e retomada por endpoint
próprio continuam fora da validação. A pausa seguida de novo início foi testada.

O aviso de depreciação de `new: true` permanece; não causou falha. A alternativa
indicada pelo Mongoose é `returnDocument: 'after'`, sem alteração nesta etapa.

## Arquivos, padrões e isolamento

Na rodada anterior, foram criados:

- `tests/tempoJogoCiclo.issue107.test.js`.
- `tests/tempoJogoCiclo.issue107.mongo.test.js`.
- `tests/helpers/tempoJogoCicloIssue107.js`: fixtures e valores esperados literais
  compartilhados entre execução simulada e real; não reproduz os cálculos do Service.
- Este relatório.

Também na rodada anterior, modificados somente nas expectativas dos exports públicos:

- `tests/tempoJogoAuxiliares.issue107.test.js`.
- `tests/tempoJogoConsumo.issue107.test.js`.
- `tests/tempoJogoCondicional.issue107.test.js`.
- `tests/tempoJogoInicio.issue107.test.js`.

Essas quatro asserções antes exigiam que somente `iniciarSessaoJogo` fosse
exportada. Foram atualizadas para os cinco exports reais adicionados pelo
aluno, mantendo a checagem de que a instrumentação em memória não vaza auxiliares
privados. Nenhuma expectativa de negócio anterior foi alterada. Nesta
revalidação, nenhum desses arquivos foi modificado; somente este relatório.

Unitários usam `node:test`, mocks de Query.exec, documentos hidratados e bloqueio
de conexões/driver. A simulação não comprova validadores ou atomicidade; esses
comportamentos são exercitados separadamente no MongoDB real.

Integração usa exclusivamente `conectamente_testes`, `MONGO_TEST_URI` e os
helpers existentes, exigindo as flags de opt-in e commit. Fixtures legadas são
inseridas pelo driver nativo. Leituras independentes comparam o documento
completo, inclusive vínculos, permissão, partida e campo legado fora do schema.
IDs são registrados antes das inserções; limpeza limitada a esses IDs foi
confirmada com zero resíduos por conexão independente.
Conexões são encerradas no teardown. Nenhum dado preexistente foi modificado.

## Reprodução

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoCiclo.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

```powershell
$env:RUN_ATLAS_TESTS='1'
$env:RUN_COMMIT_REAL_TESTS='1'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoCiclo.issue107.mongo.test.js
```

Para os dois fusos, executar sem banco, separadamente com `$env:TZ='UTC'` e
`$env:TZ='Asia/Tokyo'`:

```powershell
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoAuxiliares.issue107.test.js tests/tempoJogoConsumo.issue107.test.js tests/tempoJogoCondicional.issue107.test.js tests/tempoJogoInicio.issue107.test.js tests/tempoJogoCiclo.issue107.test.js
```

Nesta revalidação, o Codex alterou somente este relatório. Hashes confirmaram
que nenhum arquivo JavaScript de teste foi modificado. Nenhuma operação do
Codex escreveu em Models, Services, Controllers ou Routes; nenhuma instalação,
commit ou push. Banco de desenvolvimento não acessado. Logs temporários
removidos após registrar os resultados.

Foi detectada variação externa no hash de `tempoJogoService.js` durante as
execuções. Por isso, as suítes e a auditoria foram repetidas sobre os arquivos
salvos posteriormente, com os mesmos resultados aprovados. A comparação do
AST, usando o parser Babel já instalado com Prettier, entre o conteúdo capturado
antes da última rodada e o arquivo posterior mostrou estrutura sintática
idêntica ao remover comentários e metadados de posição/formatação. Não foi
executado formatador nem reescrito o Service. Não se afirma igualdade do hash
de produção com o início desta etapa.
