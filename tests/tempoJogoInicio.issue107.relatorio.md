# Issue #107 — Regras de preparação do início da sessão

Execução em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
`tempoJogoService.js`, `jogoSalvoService.js`, Models de criança/personagem/partida
e os padrões dos testes existentes. Preservada a divisão: aluno implementa
produção; Codex testa e relata.

## Resultados

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Novos testes de início e sessão ativa | 39 | 0 | 0 |
| Regressão completa sem MongoDB | 850 | 0 | 41 |

Os 39 novos testes estão incluídos na regressão. Foram descobertos 891 testes,
sem cancelamentos ou TODOs. Os 811 testes anteriormente aprovados continuam
aprovados. Ambos os comandos retornaram código 0. As 41 integrações opt-in
permaneceram desativadas; nenhuma integração MongoDB foi executada nesta etapa.

Não houve falha automatizada ou regressão nas regras de preparação existentes.
Há uma lacuna demonstrada na entrega do consumo quando ocorre bloqueio,
descrita abaixo. Um teste diagnóstico caracteriza essa lacuna; sua aprovação
confirma a observação, não a completude do controle de tempo.

## Regras verificadas

| Regra | Evidência obtida |
|---|---|
| Permissão ativa e tempo disponível | Retorna `crianca`, `jogoSalvo`, `novoConsumo` e `agora` |
| Permissão false ou null | `PERMISSAO_INATIVA` antes da consulta da partida |
| Criança inexistente | `CRIANCA_NAO_ENCONTRADA` |
| Identificador da partida inválido ou ausente | `ID_INVALIDO`, sem executar queries |
| Partida inexistente ou de outro usuário | `JOGO_SALVO_NAO_ENCONTRADO`, usando a validação original do Service de partidas |
| Personagem arquivado ou ausente | `JOGO_SALVO_NAO_ENCONTRADO` |
| Sessão ativa com expiração futura | `SESSAO_JA_ATIVA`, tanto para a mesma partida quanto para outra partida da criança |
| Exatamente na expiração e depois dela | Permite preparar novamente se o consumo reconciliado estiver abaixo do limite |
| Sessão pausada ou encerrada com expiração futura | Não bloqueia preparação e não acrescenta novos segundos |
| Consumo pendente de sessão expirada | Calculado até a expiração antes de verificar o limite |
| Saldo reconciliado igual ou superior ao limite | `LIMITE_TEMPO_ATINGIDO` |
| Limite null | Permite consumo elevado, mantendo a proibição de outra sessão válida |
| Meia-noite de São Paulo | Renova o saldo do dia anterior |
| Sessão expirada que atravessou meia-noite | Preserva os 20 segundos do novo dia, mesmo com primeira operação após expiração |
| Consumo já registrado no novo dia | Soma o trecho pendente antes de verificar se o limite foi atingido |
| Preparação e rejeições | Zero gravações, conexões ou sessões/transações MongoDB; documentos lidos preservados |

`possuiSessaoAtiva()` foi exercitada um milissegundo antes, exatamente no
instante e um milissegundo após a expiração. Também foram verificados estado
ausente/pausado/encerrado, expiração ausente/null/Date inválida/string e uso do
relógio padrão do servidor. Expiração precisa ser uma Date válida e
estritamente posterior ao instante da consulta.

## Consumo pendente no bloqueio

Caso reproduzido com a função pública `iniciarSessaoJogo()` e as consultas
simuladas, mantendo a lógica original de ambos os Services:

```js
// Criança hidratada pelo Model, permissão ativa, partida própria e ativa:
{
  limiteTempoDiario: 1,
  tempoUsadoHoje: 30,
  dataReferenciaTempo: "2026-10-29",
  sessaoJogoEstado: "ativa",
  sessaoJogoContabilizadoEm: new Date("2026-10-29T15:00:00Z"),
  sessaoJogoExpiraEm: new Date("2026-10-29T15:00:30Z")
}
// Relógio do servidor: 2026-10-29T15:00:40Z.
```

Esperado nesta etapa: rejeitar o início porque 30 segundos registrados +
30 pendentes atingem 60 segundos; não gravar nada no MongoDB.

Obtido: exatamente esse bloqueio, com `Error("LIMITE_TEMPO_ATINGIDO")`.
O cálculo independente com `calcularNovoConsumo()` confirma consumo 60 e
marcador 15:00:30Z. Contudo, no ramo de erro de `iniciarSessaoJogo()`, o retorno
com `novoConsumo` não é alcançado; o erro não contém esse cálculo, e o documento
lido continua com consumo 30 e marcador 15:00:00Z.

Isso demonstra o descarte do resultado local da reconciliação. Não demonstra
apagamento de dados no banco: nenhuma gravação é feita e o snapshot original
permanece intacto. O teste repete a tentativa e confirma que os mesmos 30
segundos pendentes continuam recalculáveis enquanto os instantes originais
forem preservados.

Risco potencial para a próxima etapa: um fluxo que apenas encerre o tratamento
ao receber o erro não registra a reconciliação; se substituir ou limpar os
instantes antigos sem contabilizá-los antes, poderá perder o intervalo
pendente. O bloqueio atual usa o total correto, portanto não foi observado
desvio de autorização por ignorar a pendência na verificação.

Recomendação para implementação manual futura: preservar o resultado ou a
possibilidade de recalculá-lo também no caminho de bloqueio e garantir que a
reconciliação seja persistida condicionalmente antes de sobrescrever o estado
antigo. Após conflito, reler e recalcular. Se esta função continuar sendo
somente preparação sem escrita, definir como seu chamador obterá o resultado
da reconciliação em uma rejeição. Nenhum formato novo de erro/retorno foi
imposto como requisito de aprovação dos testes.

## Funcionalidades ainda não implementadas

O retorno atual é preparação; não cria nem persiste uma nova sessão, não gera
um identificador de sessão no fluxo, não renova validade e não chama
`atualizarConsumoCondicional()`. Também não implementa heartbeat, pausa/retomada,
encerramento persistido ou integração HTTP para iniciar sessão nas rotas
inspecionadas.

A verificação de sessão já ativa consulta o snapshot lido, sem reservar uma
sessão atomicamente. A exclusão de duas inicializações concorrentes dependerá
da futura gravação condicional; os testes atuais não comprovam esse fluxo.
Essas ausências são funcionalidades pendentes, não falhas das expectativas
de ausência de gravação nesta etapa.

## Estratégia e isolamento

O arquivo segue o padrão de `registerHooks` das suítes de tempo: acrescenta
exports privados somente à cópia do módulo em memória e remove o hook em
`finally`. Não modifica corpos, imports ou API pública. Confere separadamente
os exports públicos sem instrumentação.

São executadas as funções originais de `tempoJogoService` e
`buscarJogoSalvoPorId` de `jogoSalvoService`, com leitura simulada por
`mongoose.Query.prototype.exec`, como nos testes existentes. As fixtures usam
Models reais e snapshots hidratados. O mock de I/O representa o populate do
personagem e verifica que a query original o solicitou. Não substitui o
Service de autorização por um retorno pré-aprovado.

O relógio é controlado com os timers nativos do runner, com datas UTC explícitas
para as viradas de São Paulo. Os guards bloqueiam conexões, transações, save,
criação em lote e chamadas de escrita do driver. Queries fora das consultas
esperadas falham. O teardown exige zero chamadas aos guards e verifica que
snapshots e documentos lidos não foram mutados, inclusive nas rejeições.

Não carrega `.env` nem importa `index.js`. Não há acesso a banco de
desenvolvimento ou de testes, e os testes não comprovam persistência real,
índices ou isolamento entre processos MongoDB.

## Reprodução e arquivos

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoInicio.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

Criados somente `tests/tempoJogoInicio.issue107.test.js` e este relatório.
Hashes dos arquivos JavaScript preexistentes de produção e testes conferidos
contra o início da etapa. Models, Controllers, Routes, Services e todos os
testes anteriores preservados. Nenhuma dependência instalada, acesso ao
MongoDB, commit ou push. Logs temporários removidos após o diagnóstico.
