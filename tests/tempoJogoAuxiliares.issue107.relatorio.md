# Issue #107 — testes das funções auxiliares de tempo

Execução em 29/10/2026, Node.js 24.22.1. Branch:
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

## Escopo e isolamento

`tempoJogoAuxiliares.issue107.test.js` exercita as seis funções existentes de
`services/tempoJogoService.js`. Usa `registerHooks` de `node:module`, já adotado
nos testes da #62, para acrescentar exports somente à cópia carregada em memória
no processo de teste. O corpo das funções e seus imports não são substituídos.
O hook é removido em `finally`. Uma segunda importação sem instrumentação
confirma que a API pública continua exportando somente `iniciarSessaoJogo`.

Conexões Mongoose, queries e sessões MongoDB são bloqueadas e o teardown exige
zero chamadas a esses pontos. Não carrega `.env`, não importa `index.js` e não
consulta nem altera MongoDB. Não testa a implementação inicial de iniciar sessão,
ainda sem persistência, nem presume que heartbeat ou renovação já existam.

Cobertura: calendário de São Paulo, relógio padrão controlado com mock de Date,
minutos versus segundos, limite null, consumo por criança sem dependência de
partida, mudança da data de referência, duração zero/negativa, frações até 1 ms,
ausência de datas, datas inválidas, expiração antes/no/depois de 30 segundos,
sequência de heartbeats de 10 segundos, viradas de mês/ano, ano bissexto,
intervalos em três dias e dias históricos de 23/25 horas. Confirma conservação
da duração ao dividir e ausência de mutação dos argumentos. A soma fracionária
tolera erro de ponto flutuante inferior a 1e-12 segundo.

## Resultados da reexecução após as correções manuais

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Suíte auxiliar: 73 testes | 73 | 0 | 0 |
| Repetição com TZ=UTC | 73 | 0 | 0 |
| Repetição com TZ=Asia/Tokyo | 73 | 0 | 0 |
| Regressão completa sem banco, incluindo a suíte | 740 | 0 | 40 |

As repetições exercitam os mesmos casos; não somar suas contagens. Todos os
processos retornaram código 0. A regressão descobriu 780 testes: 740 aprovados
e 40 integrações opt-in ignoradas, sem acesso ao banco. Não houve testes
cancelados nem marcados como TODO. As expectativas e o arquivo de testes
permaneceram inalterados.

Na execução anterior, a suíte auxiliar tinha 66 aprovados e 7 falhas; a regressão
completa tinha 733 aprovados, 7 falhas e 40 ignorados. As sete falhas foram
corrigidas pelas alterações manuais de produção, sem novas falhas ou regressões
identificadas nesta execução.

## Verificação das sete falhas anteriores

| Função | Caso | Resultado atual | Testes aprovados |
|---|---|---|---:|
| `obterFimIntervalo` | Sessão pausada ou encerrada, com datas ainda preenchidas | Retorna `null`, impedindo intervalo contabilizável | 2 |
| `obterFimIntervalo` | Último instante, expiração ou agora são Date inválida | Retorna `null` após validar timestamps finitos | 3 |
| `calcularSegundosIntervalo` | Início ou fim são Date inválida | Retorna zero, sem produzir `NaN` | 2 |

Os casos de robustez aceitam erro explícito ou ausência de consumo (null/zero),
sem impor classe ou mensagem ainda não especificada. Não aceitam NaN ou Date
inválida. A proteção de pausa foi confirmada no auxiliar; o fluxo de
persistência ainda não existe, portanto estes testes não comprovam o
comportamento de gravação real de consumo. Nenhuma alteração de produção foi
aplicada pelo Codex nesta reexecução.

Os casos normais, as fronteiras de expiração, o cálculo fracionário e a divisão
na meia-noite passaram. A consulta de disponibilidade não zera o documento ao
mudar o dia: apenas ignora logicamente o consumo de outra data. Persistência,
concorrência, renovação de validade e compartilhamento operacional do limite
entre partidas continuam fora do escopo destes testes unitários.

## Reprodução sem banco

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap tests/tempoJogoAuxiliares.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap
```

Para verificar independência do fuso do executor, repetir o primeiro comando
com `$env:TZ='UTC'` e `$env:TZ='Asia/Tokyo'` em processos separados.

Nesta reexecução, somente este relatório foi atualizado. Hashes dos arquivos
JavaScript de produção e testes conferidos contra o início desta etapa.
Nenhum teste, Model, Controller, Service ou Route foi modificado pelo Codex,
nenhuma dependência instalada e nenhum commit/push realizado. MongoDB não foi
consultado nem alterado. As alterações manuais de produção foram preservadas.
