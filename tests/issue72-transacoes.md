# Issue #72: persistência e concorrência

## Evidências disponíveis

O commit real foi confirmado em uma execução anterior com MongoDB 7.0 local:
após HTTP 201, outra conexão, sem a sessão do Service, leu histórico e estrelas.
O monitoramento confirmou `commitTransaction`. Esse resultado ainda não foi
revalidado no Atlas de testes. A última tentativa no Atlas falhou na autenticação;
novas tentativas estão suspensas por decisão de cronograma.

Na execução local anterior, os 70 testes de integração existentes passaram.
Os quatro novos cenários e seu agrupador levaram o resultado a 75 testes:
72 aprovados e 3 falhos (dois cenários de concorrência e seu agrupador).
Estes são resultados históricos, não uma nova execução da suíte atual.

## Defeito de concorrência reproduzido

| Respostas simultâneas | Tentativas persistidas | Estrelas | Resultado          |
| --------------------- | ---------------------- | -------- | ------------------ |
| Dois acertos          | `[1, 2]`               | 2        | Aprovado           |
| Dois erros            | `[1, 1]`               | 0        | Falha de numeração |
| Acerto e erro         | `[1, 1]`               | 1        | Falha de numeração |

Ambas as requisições receberam HTTP 201. As estrelas e a quantidade de históricos
ficaram corretas nesses cenários, mas a sequência de tentativas foi duplicada.
`countDocuments + 1` não garante exclusividade. A atualização das estrelas cria
conflito entre dois acertos, mas não entre todos os pares possíveis de respostas.
O schema não declara índice único para essa sequência. Não foi feita auditoria
de documentos ou índices do banco principal.

## Correção mínima proposta, ainda não aplicada

Antes de contar tentativas, dentro de `withTransaction`, realizar uma escrita
real no perfil em todas as respostas, inclusive erradas. Exemplo para avaliação:

```js
await PerfilJogoModel.updateOne(
  { _id: perfilJogo._id },
  { $inc: { __v: 1 } },
  { session },
);
```

Preservar a contagem, a criação do histórico e a atualização atual das estrelas
na mesma transação. A escrita provoca disputa pelo mesmo perfil e permite que
`withTransaction` repita a transação e refaça a contagem. Não usar escrita sem
mudança efetiva, como apenas incremento zero, como garantia de serialização.
A proposta acrescenta uma escrita por tentativa e serializa por personagem;
não modifica pontuação ou desbloqueios. Ainda precisa ser aplicada e testada.

Referências: [conflitos de escrita](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
e [retentativas do driver](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

## Proteção dos testes

Commit real só é habilitado com `RUN_COMMIT_REAL_TESTS=1` no processo e
`MONGO_TEST_URI` válida para `conectamente_test`. No `npm test` normal ele é
ignorado, sem abrir conexão. A integração usa exclusivamente essa variável,
confere o banco efetivo antes das operações e da limpeza e gera dados fictícios
identificados por execução. Remove apenas os IDs registrados e os históricos
dos personagens fictícios. Não apaga bancos ou coleções.

Na revisão sem banco: oito testes das proteções e seis do Controller aprovados;
um teste de commit real ignorado por padrão. Nenhuma autenticação ou gravação
foi executada. Sintaxe, formatação e `git diff --check` aprovados.

## Pendências para encerramento

1. Corrigir a duplicação de tentativas e reexecutar os cenários de concorrência.
2. Validar persistência após commit no Atlas de testes autorizado.
3. Executar novamente a suíte completa com os helpers atualizados.

Contrato do frontend e descrição sugerida do PR: `issue72-pr.md`.
