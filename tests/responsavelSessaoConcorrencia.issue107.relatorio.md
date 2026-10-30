# Issue #107 — Concorrência entre responsável e sessões

Validação em 29/10/2026, Node.js 24.22.1, branch
`107-corrigir-e-padronizar-as-regras-de-negócio-e-progressão-do-conectamente`.

Consultados os documentos de contexto e arquitetura, `responsavelService.js`,
`tempoJogoService.js`, `historicoJogoService.js`, Models e testes existentes.
Produção preservada; testes e dados exclusivamente em `conectamente_testes`.

## Revalidação após a correção manual

Conferidos os incrementos `$inc: { sessaoJogoVersao: 1 }` na mesma atualização
atômica de `alterarPermissaoCrianca()`, `alterarLimiteTempoCrianca()` e
`desvincularCrianca()`. Nenhuma mudança de produção foi feita pelo Codex.

**As quatro falhas anteriores foram corrigidas.** A suíte anterior foi primeiro
reexecutada sem alterar expectativas: 14 aprovações, nenhuma falha. Depois foram
acrescentados oito cenários e verificações explícitas de CAS, nova leitura,
versionamento e preservação. O diagnóstico anterior permanece abaixo como histórico.

| Execução final | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Concorrência ampliada: 21 cenários e um agrupador | 22 | 0 | 0 |
| Nove integrações MongoDB, incluindo a suíte ampliada | 306 | 0 | 0 |
| Regressão completa sem MongoDB | 1.036 | 0 | 46 |
| Total das execuções finais, sem repetir os 22 específicos | 1.342 | 0 | 46 |

Todos os comandos finais retornaram código 0, sem cancelamentos ou TODOs.
Os 46 ignorados são integrações opt-in da regressão sem banco; nove suítes
foram executadas separadamente com MongoDB. As repetições e a primeira execução
dos 14 testes não estão somadas ao total final.

### Evidências de releitura e bloqueio

Em cada disputa, a sessão lê a versão 7 e prepara a atualização; o responsável
confirma a política e a versão 8 ANTES de a escrita de sessão ser liberada.
A primeira escrita condicional perde o CAS e retorna `null`. As queries
seguintes são reais; nenhum retorno ou conflito é fabricado pelo teste.

| Operação | Alteração concorrente | Leituras da criança pelo Service | Tentativas de escrita da sessão | Resultado | Consumo final | Versão final |
|---|---|---:|---:|---|---:|---:|
| Heartbeat | Revogação de permissão | 2 | 2 | `PERMISSAO_INATIVA`, encerrada | 22 s | 9 |
| Heartbeat | Limite 2 → 1 min | 2 | 2 | `LIMITE_TEMPO_ATINGIDO`, encerrada | 80 s | 9 |
| Heartbeat | Desvinculação | 2 | 2 | `PERMISSAO_INATIVA`, encerrada e sem vínculo | 22 s | 9 |
| Início | Revogação de permissão | 3 | 1 | `PERMISSAO_INATIVA`, não inicia | 12 s | 8 |
| Início | Limite 2 → 1 min | 3 | 2 | `LIMITE_TEMPO_ATINGIDO`, não inicia | 70 s | 9 |
| Início | Desvinculação | 3 | 1 | `PERMISSAO_INATIVA`, não inicia e sem vínculo | 12 s | 8 |

As três leituras no início incluem a verificação inicial de propriedade da
partida, a leitura usada na primeira tentativa e a releitura após perder o CAS.
Nos casos de permissão e desvinculação, a nova leitura já bloqueia antes de
outra escrita. No heartbeat e no bloqueio por limite, o consumo é confirmado
com o estado final adequado. Nenhum caso produz sucesso indevido, histórico
ou estrelas adicionais; perfil e partida permanecem integralmente preservados.

Os novos testes também cobrem preservação após desvinculação, bloqueios
sequenciais e as três operações do responsável em documentos cujo campo
`sessaoJogoVersao` está fisicamente ausente: o MongoDB cria a versão 1,
preservando consumo, referência diária, marcadores e os demais dados.
A comparação da política exige exatamente um incremento; não ignora a versão.

Permaneceram aprovados os testes transacionais de resposta: alteração do
limite antes da escrita provoca conflito real, nova leitura e bloqueio quando
o saldo acaba; com saldo disponível, só uma tentativa e um intervalo são
confirmados. Na ordem inversa, a política aguarda o commit da resposta.

### Integrações executadas no código atual

| Arquivo | Aprovados |
|---|---:|
| `desvinculacao.issue103.mongo.test.js` | 16 |
| `identidadeVinculo.issue94.mongo.test.js` | 29 |
| `jornadaIntegrada.issue94.mongo.test.js` | 27 |
| `limiteTempo.issue101.mongo.test.js` | 28 |
| `responsavelSessaoConcorrencia.issue107.mongo.test.js` | 22 |
| `respostaTempo.issue107.mongo.test.js` | 36 |
| `sessoesHttp.issue107.mongo.test.js` | 50 |
| `tempoJogoCiclo.issue107.mongo.test.js` | 73 |
| `tempoJogoInicio.issue107.mongo.test.js` | 25 |
| Total | 306 |

### Compatibilidade e arquivos alterados nesta revalidação

A regressão inicial teve 1.029 aprovações, sete falhas e 46 ignorados. As sete
falhas eram de expectativas antigas nos testes #101 e #103 que exigiam um
update contendo somente `$set`. A correção aprovada acrescentou `$inc`.

Os mocks agora aplicam `$inc` e as expectativas exigem exatamente
`sessaoJogoVersao + 1`, mantendo a comparação completa dos documentos. As
mesmas expectativas de versão foram atualizadas nas duas integrações MongoDB.
Consumo, referência diária, marcadores, identidade, autorização, vínculo e
demais documentos continuam protegidos; rejeições continuam sem gravar.
Nenhum assert foi removido para esconder falha funcional.

Arquivos alterados nesta etapa:

- `responsavelSessaoConcorrencia.issue107.mongo.test.js`: ampliação e proteção da releitura.
- `limiteTempo.issue101.test.js`: mock e contrato explícito do incremento.
- `desvinculacao.issue103.test.js`: mock e contrato explícito do incremento.
- `limiteTempo.issue101.mongo.test.js`: comparação integral incluindo a nova versão.
- `desvinculacao.issue103.mongo.test.js`: comparação integral incluindo a nova versão.
- Este relatório.

### Limpeza e limites da conclusão

As nove suítes confirmaram zero resíduos por conexão independente, usando
somente `conectamente_testes` e limpeza delimitada pelos IDs das fixtures.
Comparação SHA-256 confirmou que nenhum JavaScript de produção foi alterado
nesta tarefa. Não houve acesso ao banco de desenvolvimento, instalação,
commit ou push.

Nenhuma falha funcional remanescente foi reproduzida neste escopo. A garantia
depende de futuras alterações de permissão, limite e vínculo seguirem o mesmo
protocolo de versão. Os testes usam interleavings controlados, não carga prolongada.
Revogar/desvincular invalida a decisão em andamento; o encerramento e o consumo
pendente são tratados pela próxima operação de sessão. Não se presume um
encerramento automático em segundo plano pelo endpoint do responsável.

## Resultado anterior — antes da correção manual

**Quatro falhas funcionais reproduzidas:** início e heartbeat podem confirmar
sessões com permissão ou limite diário desatualizados. O registro de respostas
respeitou a alteração concorrente do limite nos cenários executados.

| Execução | Aprovados | Falhas | Ignorados |
|---|---:|---:|---:|
| Nova integração real: 13 cenários e um agrupador | 9 | 5 | 0 |
| Regressão completa sem MongoDB | 1.036 | 0 | 46 |

As cinco reprovações do Node são os quatro cenários funcionais e o agrupador
que os contém; não representam cinco defeitos distintos. A execução MongoDB
retornou código 1, como deve ocorrer com os testes de proteção reprovados.
Não houve cancelamentos ou TODOs. As expectativas corretas foram preservadas,
sem marcar os defeitos como ignorados ou esperar sucesso para obter aprovação.

A regressão sem banco descobre 1.082 testes. Os 46 ignorados são integrações
opt-in; o aumento de 45 para 46 corresponde ao novo agrupador MongoDB. Os
1.036 testes anteriores continuam aprovados. Não somar repetições das execuções
de diagnóstico. As aprovações anteriores não cobriam esta ordem concorrente.

## Método de reprodução

Services, Models, queries e transações são reais. Os wrappers de testes apenas
controlam QUANDO a query real é enviada ao MongoDB; não substituem resultados,
filtros, versões, erros do driver, commit ou abort.

Ordem imposta nos quatro casos reprovados:

1. Início/heartbeat lê o documento real e prepara a atualização com versão 7.
2. Uma barreira suspende somente a primeira gravação condicional da sessão.
3. O Service real do responsável revoga a permissão ou reduz o limite.
4. Outra conexão confirma a política nova, o consumo preservado e a versão
   ainda em 7. A alteração já terminou antes de liberar a sessão.
5. A barreira é liberada. A gravação de sessão encontra a mesma versão 7,
   consegue atualizar e incrementa para 8, sem releitura ou recálculo.
6. A conexão independente lê a sessão ativa, embora a política persistida
   já a devesse bloquear.

Relógio controlado no servidor: 29/10/2026 15:00:10Z. Sessões ativas possuem
origem às 15:00:00Z e validade até 15:00:30Z. Nos casos de início, a sessão
anterior está encerrada e sua expiração é `null`. Cada fixture possui criança,
responsável vinculado, personagem ativo e partida próprios. O limite inicial
é de dois minutos, e o novo limite é de um minuto.

## Falhas reproduzidas

| Cenário | Entrada e alteração já confirmada | Esperado | Obtido e persistido |
|---|---|---|---|
| Revogação durante heartbeat | 12 s usados; permissão true → false | Releitura, consumo 22 s, encerramento e `PERMISSAO_INATIVA` | Sucesso, 22 s, permissão false, sessão ativa até 15:00:40Z |
| Redução durante heartbeat | 70 s usados; limite 2 → 1 min | Releitura, consumo 80 s, encerramento e `LIMITE_TEMPO_ATINGIDO` | Sucesso, 80 s, limite 1 min, sessão ativa até 15:00:40Z |
| Revogação durante início | 12 s usados; permissão true → false | Não iniciar; `PERMISSAO_INATIVA`; preservar consumo | Sucesso, novo identificador e sessão ativa até 15:00:40Z, permissão false, consumo 12 s |
| Redução durante início | 70 s usados; limite 2 → 1 min | Não iniciar; `LIMITE_TEMPO_ATINGIDO`; preservar consumo | Sucesso, novo identificador e sessão ativa até 15:00:40Z, limite 1 min, consumo 70 s |

Cada caso executou apenas uma escrita de sessão e não recebeu conflito do
MongoDB. As políticas do responsável NÃO foram sobrescritas: a permissão false
e o limite de um minuto permaneceram no banco. O defeito é autorizar/renovar
a sessão com base no snapshot anterior. Nenhum desses quatro casos criou
histórico ou estrelas adicionais; as sete estrelas da fixture foram preservadas.

## Cenários aprovados

### Alteração durante o registro de resposta

O mesmo intervalo entre leitura e escrita foi imposto dentro da transação
real de `registrarResposta()`. O responsável confirmou o novo limite antes
da primeira escrita de reconciliação.

O MongoDB lançou **WriteConflict, código 112**, com o rótulo
`TransientTransactionError`. O driver repetiu a transação, relendo o documento.
Foram duas tentativas de escrita e apenas uma atualização de consumo confirmada:

- Consumo inicial de 70 s: reconcilia para 80 s, encerra a sessão e retorna
  `LIMITE_TEMPO_ATINGIDO`. Nenhum histórico novo, nenhuma estrela adicional,
  perfil e partida integralmente preservados.
- Consumo inicial de 12 s: reconcilia para 22 s, aceita a resposta porque
  ainda há saldo no novo limite de 60 s. Exatamente uma tentativa de número 1,
  uma estrela adicional e nenhuma duplicação dos dez segundos.

Não é necessário incrementar a versão do responsável para que ESSE conflito
transacional seja detectado: o MongoDB já percebe a alteração posterior ao
snapshot. Isso não protege início/heartbeat, que usam atualização condicional
fora dessa transação.

### Ordem inversa: resposta grava primeiro

A resposta atualiza criança, perfil e partida dentro da transação e para
antes de inserir o histórico. O comando real de redução do limite é observado
por `commandStarted`, mas não conclui enquanto a transação mantém a reserva.
A conexão independente ainda vê 70 s e o limite anterior de dois minutos.

Após liberar a resposta, seu commit confirma 80 s, uma tentativa e uma estrela
adicional. Somente depois o responsável confirma o limite de um minuto,
preservando os 80 s. A resposta foi autorizada antes de a nova política ser
confirmada; esse resultado é válido, não uma decisão desatualizada.

### Preservação e controles sequenciais

- Duas verificações comparam o documento completo antes/depois das alterações
  de permissão e limite, permitindo mudar somente a política correspondente
  e sua eventual versão. Consumo, referência diária, marcadores, sessão e
  demais campos ficam intactos; perfil, partida e histórico também.
- Quatro controles aplicam a política nova ANTES de chamar início/heartbeat.
  Todos rejeitam com o erro correto; heartbeat preserva os dez segundos
  pendentes e início não acrescenta consumo de uma sessão encerrada.

Esses controles isolam o problema na janela entre leitura e gravação.

## Causa e menor correção recomendada

`responsavelService.alterarPermissaoCrianca()` e
`responsavelService.alterarLimiteTempoCrianca()` alteram a política com `$set`,
mas não incrementam `sessaoJogoVersao`. Os filtros de início/heartbeat usam
a versão lida e não incluem os valores lidos de permissão e limite. Assim,
a alteração concorrente não invalida a decisão já preparada.

Menor alteração indicada, a ser implementada manualmente pelo desenvolvedor:

1. Acrescentar `$inc: { sessaoJogoVersao: 1 }` à MESMA atualização atômica
   que altera permissão ou limite. Preservar consumo, referência diária,
   marcadores e demais campos; não zerar consumo ao alterar política.
2. Aplicar o mesmo protocolo em `desvincularCrianca()`, que também revoga
   permissão. Essa extensão é recomendação por leitura; desvinculação não foi
   reproduzida nesta suíte.
3. Manter os retries existentes de início/heartbeat: com a versão invalidada,
   a primeira atualização deve retornar `null` e a nova leitura deve usar
   a permissão/limite atuais.
4. Preservar a transação existente do histórico e sua reconciliação. Não há
   necessidade demonstrada de nova transação ou de refatoração geral.

Não implementado nem validado um patch de produção nesta etapa. A expectativa
é reexecutar esta suíte após a correção e confirmar as quatro proteções verdes.
A suíte permite o incremento de versão nas alterações do responsável sem
relaxar a preservação de consumo.

## Arquivos e isolamento

Criados somente:

- `responsavelSessaoConcorrencia.issue107.mongo.test.js`
- Este relatório.

Não foram alterados testes anteriores ou arquivos de produção. Comparação
SHA-256 com o início da tarefa confirma a preservação dos arquivos JavaScript
existentes. Não houve instalação, commit ou push.

Usados os helpers de isolamento existentes e somente `MONGO_TEST_URI` para
`conectamente_testes`, sem fallback para o banco de desenvolvimento. IDs são
registrados antes das inserções; a limpeza só atinge fixtures próprias e
históricos delimitados pelos perfis desta execução. **Zero resíduos** confirmado
por conexão independente, inclusive quando os quatro testes reprovam.

```powershell
# Executar a partir de backend, com MONGO_TEST_URI exclusivamente de testes.
$env:RUN_ATLAS_TESTS = "1"
$env:RUN_COMMIT_REAL_TESTS = "1"
$env:RUN_CONCORRENCIA_REAL_TESTS = "1"
node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/responsavelSessaoConcorrencia.issue107.mongo.test.js
# Resultado anterior: exit 1. Após a correção manual, a suíte ampliada retorna 0.

$env:RUN_ATLAS_TESTS = "0"
$env:RUN_COMMIT_REAL_TESTS = "0"
$env:RUN_CONCORRENCIA_REAL_TESTS = "0"
node --test --test-concurrency=1 --test-reporter=tap
```
