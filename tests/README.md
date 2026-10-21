# Testes do backend

Execute com Node.js 24 ou superior e as dependências instaladas:

```sh
npm test
```

## Isolamento do MongoDB

### Revisão sem banco

As tentativas de configurar/autenticar `MONGO_TEST_URI` estão suspensas por
decisão de cronograma. Para verificar o contrato do Controller e as proteções
de teste sem conexão, execute somente:

```sh
node tests/bancoCommitReal.test.js
node tests/historicoJogoController.unit.test.js
```

Na revisão atual: **14 aprovados, nenhuma falha; commit real ignorado por padrão**. Esses testes não abrem
conexões. O contrato de sucesso e o erro de personagem usam Service simulado;
o ID inválido é rejeitado pelo Service real antes de qualquer consulta.
`npm test` mantém as suítes anteriores com banco, mas ignora commit real por
padrão. A suíte completa não foi executada nesta revisão.
Critérios, limitações e sugestão de PR estão em `issue72-pr.md`.

O helper `bancoTeste.js` usa `MONGO_TEST_URI` (ou o servidor e a autenticação
configurados em `MONGO_URI`) e **sempre substitui o banco de destino** por um
nome aleatório `t72_<UUID>`. Ele confirma o nome e que o banco está vazio antes
de criar as coleções. Nunca utiliza o banco principal para os testes.

Os testes de **commit real** usam um helper diferente, `bancoCommitReal.js`:
exigem exclusivamente `MONGO_TEST_URI`, sem fallback para `MONGO_URI`, e rejeitam
URIs que não apontem para `conectamente_test`. O helper verifica tanto
`connection.name` quanto `db.databaseName` antes de criar coleções e antes das
gravações e da limpeza. A segunda conexão de leitura usa a mesma proteção.

O servidor deve suportar transações, e a credencial precisa permitir criar e
usar os bancos de testes. É preferível apontar `MONGO_TEST_URI` para um ambiente
exclusivo de testes. A credencial atual do Atlas não permite bancos adicionais.
Não envie URIs autenticadas ou segredos em logs, mensagens ou commits.

As URIs devem ser configuradas localmente por variáveis de ambiente.
Não inclua valores de conexão em arquivos versionados.

A suíte abre servidores HTTP em portas locais livres. Não é necessário executar
`npm start` ou configurar `TEST_CHILD_TOKEN`. Os JWTs são criados automaticamente
para usuários fictícios. O helper de jogo usa `JWT_SECRET` do ambiente; os testes
de progresso e commit usam uma chave temporária do processo.

## Cenários anteriores: 70 aprovações

Os cenários continuam nos mesmos arquivos, com o helper de jogo enviando
`perfilJogoId` no body. Todo o catálogo agora é fictício; a preparação deixou
de depender de crianças, tarefas ou alternativas existentes no banco principal.

- `historicoJogo.test.js`: autenticação, dificuldade inválida, ordem das tarefas,
  desbloqueio das três dificuldades, tentativas e estrelas por acertos e erros.
- `comodos.test.js`: progressão Quarto → Banheiro → Cozinha, bloqueios enquanto
  houver tarefas/dificuldades pendentes, cômodos inativos e tarefas indisponíveis.
- `progresso.test.js` e `historicoConsulta.test.js`: autenticação, autorização de
  crianças e responsáveis, vínculos por ID, cálculos, ordenação e consultas sem
  escrita.
- `personagemResposta.test.js`: seleção explícita entre dois personagens ativos,
  tentativas e estrelas independentes, vínculos do histórico e isolamento de
  desbloqueios. Personagem alheio, inexistente ou arquivado retorna HTTP 404;
  ID ausente ou inválido retorna HTTP 400. Rejeições preservam todos os perfis
  e históricos fictícios.

Essas suítes compartilham uma transação externa por preparação. As consultas
reais recebem a sessão; `startSession`, `withTransaction` e `endSession` são
adaptados apenas nos testes para evitar commit. O encerramento restaura os
métodos, aborta a transação e confirma que os documentos não persistiram.
Nenhum resultado de consulta ou cálculo de pontuação é simulado.

O catálogo possui seis cômodos e alternativas corretas/incorretas. O quarto,
banheiro e cozinha têm duas tarefas cada. Também há cômodo inativo, vazio,
com tarefa inativa e uma tarefa vinculada a cômodo inexistente. Sem tarefa
cadastrada a API retorna 404 antes de consultar o cômodo; a contagem zero de
atividades após encontrar uma tarefa ativa não é alcançável em estado estável.

## Commit real e concorrência: issue #72

`transacaoResposta.test.js` usa exclusivamente `conectamente_test`, sem exigir
que o banco esteja vazio. Identifica cada execução por `issue72-<UUID>` nos
dados fictícios e acompanha todos os IDs criados. Não substitui sessões,
`withTransaction`, gravações ou commits.

- Confirma HTTP 201, o envio de `commitTransaction` e a persistência do histórico
  e das estrelas por uma segunda conexão independente, sem a sessão do Service.
- Envia duas requisições HTTP simultâneas para o mesmo personagem, tarefa e
  dificuldade: dois acertos, dois erros e um acerto com um erro.
- Atrasa somente a conclusão das primeiras contagens reais para provocar a
  corrida. Um limite de 1,5 segundo evita bloquear uma implementação que já
  serialize as transações. Os resultados das consultas permanecem reais.
- Exige duas respostas HTTP 201, duas gravações, estrelas corretas e tentativas
  `[1, 2]`, inclusive quando as duas respostas são erradas.
- Remove apenas os documentos fictícios pelos IDs conhecidos, no banco isolado,
  após verificar a persistência. Históricos são delimitados pelos IDs dos
  personagens fictícios da execução. Não apaga bancos ou coleções, nem exige
  que documentos de outras execuções desapareçam. Sem registros criados, não
  executa comandos de exclusão.

Commit real exige ativação explícita no ambiente do processo e uma
`MONGO_TEST_URI` válida apontando para `conectamente_test`. Sem ambos, o teste
é ignorado antes de abrir conexão, mesmo que o `.env` contenha uma URI.
Para executar deliberadamente a integração em ambiente autorizado:

```sh
RUN_COMMIT_REAL_TESTS=1 node --test tests/transacaoResposta.test.js
```

`bancoCommitReal.test.js` possui oito testes sem conexão, cobrindo ativação
explícita, configuração obrigatória, bloqueio de destinos indevidos antes da
conexão/criação, verificação do banco efetivo e mensagens sem credenciais.
O Atlas ainda não validou commit/persistência; as tentativas de autenticação
estão suspensas. O resultado anterior com MongoDB local está documentado em
`issue72-transacoes.md`.

Na implementação atual, dois erros e a combinação acerto/erro produzem `[1, 1]`.
Esses testes de regressão ficam vermelhos até a correção da concorrência.
Dois acertos passam porque ambos atualizam o mesmo perfil e a transação em
conflito é repetida. Consulte `issue72-transacoes.md` para a proposta mínima.

A contagem da suíte completa depende da ativação do commit real, pois seus
subtestes só são registrados quando a integração é executada. Não confundir
a quantidade de cenários disponíveis com uma execução completa aprovada.
