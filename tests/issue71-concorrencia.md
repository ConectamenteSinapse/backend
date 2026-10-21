# Concorrência entre respostas e arquivamento — issues #71/#72

Revisão de 21/10/2026. Código de produção mantido integralmente.

## Implementação atual

`services/historicoJogoService.js:216` faz `findOneAndUpdate` dentro de
`withTransaction`, antes de `countDocuments + 1` (`:237`). O filtro exige
personagem, dono e status ativo. A atualização envia `$inc` das estrelas e
`$currentDate` para `ultimaInteracaoEm`, inclusive com pontuação zero. Esse
campo existe no schema atual (`models/perfilJogoModel.js:43`). Reserva,
contagem e criação do histórico recebem a mesma sessão.

`services/perfilJogoService.js:163` arquiva condicionalmente o mesmo documento,
filtrando personagem, dono e status ativo. Não faz leitura seguida de save.

Portanto, a análise anterior da versão que atualizava estrelas somente em
acertos não descreve mais o código atual. O defeito histórico de tentativas
[1, 1] não foi reproduzido contra essa nova implementação nesta revisão.

A expectativa a validar no servidor é:

- Se o arquivo concluir antes da reserva transacional, a reserva retorna null e
  o service rejeita com `PERFIL_JOGO_NAO_ENCONTRADO`, sem gravar histórico.
- Se a reserva vencer, o arquivo disputa o mesmo documento e deve aguardar o
  commit; a resposta vale e o arquivo ocorre depois. Isso também deve funcionar
  para pontuação zero. Não se exige que uma resposta já confirmada seja desfeita
  pelo arquivamento posterior.
- Duas respostas disputam a escrita no mesmo perfil antes de contar. As
  retentativas transacionais devem refazer a contagem após conflitos.
- Se a transação abortar após as escritas, nem estrelas, nem data de interação,
  nem histórico novo devem persistir; o histórico anterior deve ser mantido.

São inferências do protocolo atual e da documentação de
[conflitos e locks do MongoDB](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
e de [transações do driver Node.js](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).
Não são uma confirmação experimental do isolamento no ambiente de destino.
`countDocuments + 1` isoladamente não fornece exclusividade; a garantia depende
da disputa pela escrita e das retentativas reais do driver.

## Testes com mocks

Arquivo: `concorrenciaPersonagens.mock.test.js` — seis cenários sem conexão:

1. Arquivamento após pré-leitura, antes da reserva, com resposta correta.
2. Mesma ordem com resposta incorreta e incremento zero.
3. Resposta iniciada após arquivamento, sem iniciar sessão.
4. Propagação de abort após callback, mesma sessão e encerramento, com acerto.
5. Mesmo protocolo de abort com erro.
6. Duas chamadas paralelas, sessões independentes e reserva antes da contagem.

Os services são reais; modelos e sessão são simulados. O último teste fornece
contagens roteirizadas 0/1: comprova o cálculo 1/2 e a passagem das sessões,
mas não comprova serialização. Os testes de abort verificam propagação e uso da
sessão; não implementam um rollback fictício para alegar preservação real.

## Testes que dependem de MongoDB

Arquivo: `concorrenciaPersonagens.mongo.test.js` — dez cenários:

- Arquivo antes da reserva, para acerto e erro.
- Reserva antes do arquivo, para acerto e erro.
- Respostas após arquivo, preservando histórico já existente.
- Abort após insert real do histórico, para acerto e erro.
- Dois acertos, dois erros e acerto/erro simultâneos: tentativas 1/2 no retorno
  dos services e no histórico persistido, com soma de estrelas correspondente.

Não substituem startSession, withTransaction, resultados, commit ou abort.
Wrappers de queries somente introduzem barreiras determinísticas; os testes
observam comandos reais para saber que a operação concorrente foi enviada.
Os cenários de abort inserem realmente o histórico na transação e lançam um
erro deliberado antes do commit. A comparação do estado usa outra conexão,
sem sessão, e inclui o documento completo e todos os históricos do perfil.
Os cenários de disputa usam barreiras, não sleeps para supor a ordem.

### Ativação e isolamento

Por padrão os dez cenários são ignorados **antes de ler configuração ou abrir
conexão**. Exigem `RUN_CONCORRENCIA_REAL_TESTS=1` no processo e `MONGO_TEST_URI`
já disponível no ambiente, apontando exatamente para `conectamente_test`.
Não há fallback para MONGO_URI. O helper existente confere o nome efetivo do
banco antes de operações e limpeza. O servidor precisa suportar transações.

Com um ambiente de teste já preparado, a execução deliberada seria:

```sh
RUN_CONCORRENCIA_REAL_TESTS=1 node --test tests/concorrenciaPersonagens.mongo.test.js
```

Esse comando **não foi executado com a flag nesta revisão**. Nenhuma credencial
foi criada ou configurada. Os cenários reais, quando habilitados, usam documentos
fictícios, registram IDs antes das gravações e removem somente esses documentos
e históricos dos perfis fictícios em teardown, inclusive após falhas. Não
removem bancos, coleções ou dados existentes. Uma interrupção forçada do processo
pode impedir teardown. Executar isoladamente de outras suítes que alterem o
catálogo no mesmo banco evita interferência entre fixtures.

## Execução desta revisão

Comando executado:

```sh
node --test tests/concorrenciaPersonagens.mock.test.js tests/concorrenciaPersonagens.mongo.test.js tests/perfilJogo.test.js tests/historicoJogoController.unit.test.js tests/bancoCommitReal.test.js tests/transacaoResposta.test.js
```

| Escopo                          | Passaram | Falharam | Ignorados |
| ------------------------------- | -------: | -------: | --------: |
| Novos testes com mocks          |        6 |        0 |         0 |
| Novos testes MongoDB            |        0 |        0 |        10 |
| Regressão selecionada existente |       29 |        0 |         1 |
| Total                           |       35 |        0 |        11 |

O teste anterior ignorado é o de commit real, cuja flag também permaneceu
inativa. Não foi executada a suíte completa que depende do Atlas. Não foram
confirmados nesta revisão locks, retentativas reais, sequência persistida de
tentativas sob disputa ou rollback/persistência por outra conexão.

Não há falha nova de concorrência comprovada no código atual. Para implementação
manual futura, se os testes reais falharem, os trechos a investigar são a reserva
em `historicoJogoService.js:216`, a contagem em `:237` e o arquivo condicional em
`perfilJogoService.js:163`. Não substituir a reserva transacional por mera leitura,
nem omitir a escrita nas respostas com zero pontos. O diagnóstico final depende
do resultado dos cenários reais; nenhum ajuste de produção foi aplicado.

Sintaxe dos dois testes verificada com `node --check`. Hashes dos dois services,
model de perfil e controller permaneceram iguais aos do início da revisão.
Nenhum Prettier, alteração de .env, configuração de credenciais, commit, push ou
merge foi executado.
