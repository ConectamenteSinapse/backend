# Issue #107 — Estados dos cômodos no progresso da partida

Validação da branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.
Consultados `CONTEXTO_DESENVOLVIMENTO.md`, `ANALISE_ARQUITETURA_BACKEND.md`,
Services de progresso, progressão, histórico, partidas e tempo, Models,
Controller, Routes e padrões existentes de testes. Produção preservada.

## Resultados efetivos

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Novos testes sem banco | 27 | 0 | 0 |
| Nova integração MongoDB | 29 | 0 | 0 |
| Integrações existentes: jornada #94 e sessões HTTP #107 | 77 | 0 | 0 |
| Regressão completa sem MongoDB | 1.063 | 0 | 47 |
| Total final, sem repetir os 27 específicos incluídos na regressão | 1.169 | 0 | 47 |

A nova integração contém 21 cenários de estados, cinco verificações de acesso
com seu agrupador, uma sequência de respostas reais e o agrupador principal.
As integrações anteriores tiveram 27 aprovações na jornada e 50 na suíte HTTP.
Os totais do Node incluem agrupadores; não houve cancelamentos ou TODOs.
Todos os comandos finais retornaram código 0.

A regressão final descobriu 1.110 testes. Os 47 ignorados são integrações
MongoDB opt-in, incluindo o novo agrupador. Três dessas suítes foram executadas
separadamente nesta etapa, somando 106 aprovações reais. As demais integrações
não foram reexecutadas nesta rodada. A regressão inicial, antes de adicionar o
arquivo MongoDB, também passou: 1.063 aprovações e 46 ignorados.

## Cobertura das regras solicitadas

| Regra | Evidência |
|---|---|
| Partida nova | Primeiro cômodo disponível; posteriores bloqueados; resumo zerado e tarefas vazias |
| Conclusão parcial | Um acerto ou uma última tarefa difícil pendente mantém o cômodo disponível |
| Fácil completo | Cômodo permanece disponível; seguinte continua bloqueado |
| Fácil e médio completos | Cômodo permanece disponível; seguinte continua bloqueado |
| Três dificuldades completas | Primeiro cômodo concluído, segundo disponível |
| Dois cômodos completos | Terceiro disponível |
| Erros | Erros nos três níveis não concluem tarefas ou cômodos |
| Repetições | Repetir a mesma tarefa não substitui tarefas pendentes; erro posterior não desfaz acerto anterior |
| Outra partida | Histórico alheio não libera cômodos; dificuldades de partidas diferentes não são combinadas |
| Outra criança | Histórico da outra criança não modifica estados ou indicadores da partida consultada |
| Cômodo inativo | Não aparece; mesmo anterior na ordem, não bloqueia o jogo |
| Tarefa inativa | Não é exigida em nenhuma das três dificuldades |
| Sem tarefas ativas | Não é concluído, inclusive com acertos históricos em tarefas agora inativas |
| Cômodo vazio | Disponível se seus anteriores estiverem concluídos; impede avançar ao seguinte |
| Ordenação | Alterada a ordem das fixtures, sem alterar seus IDs; resposta segue `ordem` e não inserção |
| Contrato anterior | Comparação literal de resumo, tarefas agrupadas, datas e estrelas |
| HTTP | Router, JWT, Controller e Service reais retornam o novo campo; rejeições e IDs preservados |

Cada um dos 21 cenários é executado sem banco e com MongoDB real, usando os
mesmos oráculos literais. A ordem de todos os cômodos ativos retornados é
confrontada com o catálogo, e os estados das fixtures são comparados com
valores esperados explícitos, sem derivá-los do resultado da implementação.

Adicionalmente, os estados são confrontados com os helpers reais existentes:

- `estado !== "bloqueado"` coincide com `verificarComodoDesbloqueado()` nos
  cenários exercitados.
- `estado === "concluido"` coincide com a conclusão das três dificuldades
  por `verificarDificuldadeConcluida()`.

Isso verifica o reaproveitamento das regras atuais: mesmas tarefas nos três
níveis, tarefas ativas, acertos por dificuldade e escopo da partida. Nenhuma
regra de produção foi substituída por uma implementação de teste.

## Preservação de resumo, tarefas e estrelas

Caso literal com três tentativas: erro na primeira tarefa, acerto na mesma
tarefa e acerto na segunda, todos no fácil. Esperado e obtido:

- `estrelasTotal: 2`.
- Resumo: três tentativas, dois acertos, um erro e duas tarefas concluídas.
- Dois grupos de tarefa/dificuldade, com contadores 2/1/1 e 1/1/0.
- Datas e ordem dos grupos mantidas, usando as interações das 15:00:01Z e
  15:00:02Z de 29/10/2026.
- Cômodo ainda disponível, pois médio e difícil não estão concluídos.

As consultas são comparadas diretamente com `consultarProgressoJogo()` nos
casos de partida nova e de métricas. Snapshots completos antes e depois
confirmam que GET não altera criança, consumo, perfil, partida, históricos,
catálogo ou alternativas. Também são monitorados comandos/queries para
rejeitar escritas durante a consulta.

## Desbloqueio por respostas reais

A integração adicional inicia sessões válidas pelo ciclo real de tempo e
registra respostas pelo endpoint existente, sem inserir seu histórico manualmente:

1. Consulta a partida nova e recebe primeiro disponível/segundo bloqueado.
2. Tenta responder no segundo cômodo: HTTP 403 `COMODO_BLOQUEADO`.
3. Registra um erro no primeiro: estado continua disponível.
4. Conclui fácil e médio: segundo continua bloqueado, inclusive ao tentar jogar.
5. Deixa a última tarefa difícil pendente: segundo ainda bloqueado.
6. Conclui essa tarefa: primeiro concluído, segundo disponível.
7. Responde no segundo: HTTP 201.

Resultado confirmado por outra conexão: oito tentativas, sete acertos, um erro,
sete conclusões tarefa+dificuldade e 13 estrelas. Os mesmos IDs de tarefa são
usados nas três dificuldades. Não há histórico ou estrelas extras nas rejeições.

## Inconsistências e limites da conclusão

Nenhuma falha funcional ou incompatibilidade dos testes anteriores foi
reproduzida nos cenários solicitados. As duas integrações existentes passaram
sem adaptações, preservando as verificações antigas dos indicadores.

Um cômodo ativo vazio ou somente com tarefas inativas pode ser `disponivel`,
mas não `concluido`; seus sucessores continuam bloqueados. Esse comportamento
é consistente com os helpers atuais, não um desbloqueio automático de catálogo vazio.

As comparações representam catálogo estável e consultas após as gravações.
Não foi certificada consistência de snapshot durante alterações concorrentes
de catálogo/histórico. A função consulta histórico e helpers em operações
separadas, sem uma transação de leitura. Também não se estende a conclusão a
históricos inconsistentes ou fora da sequência permitida pelo jogo.

## Isolamento e arquivos

Criados:

- `estadosComodos.issue107.test.js`
- `estadosComodos.issue107.mongo.test.js`
- `helpers/estadosComodosIssue107.js`
- Este relatório.

Nenhum teste anterior foi alterado. A comparação SHA-256 com o início da tarefa
confirmou a preservação dos arquivos JavaScript existentes, incluindo produção.

As integrações usaram apenas `conectamente_testes`, com as guardas existentes
de `MONGO_TEST_URI` e opt-in. O catálogo temporário é posicionado antes do
preexistente, sem editar documentos anteriores. Somente as fixtures conhecidas
são restauradas entre os cenários e removidas no teardown.

Zero resíduos foi confirmado por conexão independente nas três suítes reais,
incluindo históricos gerados pelo endpoint, delimitados pelos perfis próprios.
Nenhum banco de desenvolvimento acessado; nenhuma instalação, commit ou push.

## Reprodução

```powershell
# A partir de backend; sem carregar .env nas execuções sem banco.
$env:RUN_ATLAS_TESTS = "0"
$env:RUN_COMMIT_REAL_TESTS = "0"
$env:RUN_CONCORRENCIA_REAL_TESTS = "0"
node --test --test-concurrency=1 --test-reporter=tap tests/estadosComodos.issue107.test.js
node --test --test-concurrency=1 --test-reporter=tap

# MONGO_TEST_URI deve apontar exclusivamente para conectamente_testes.
$env:RUN_ATLAS_TESTS = "1"
$env:RUN_COMMIT_REAL_TESTS = "1"
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/estadosComodos.issue107.mongo.test.js
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/jornadaIntegrada.issue94.mongo.test.js tests/sessoesHttp.issue107.mongo.test.js
```

As integrações são sequenciais: compartilham o catálogo global do banco de
testes e não devem disputar a ordem dos cômodos com outra suíte ao mesmo tempo.
