# Testes do histórico de jogo

Execute na raiz do backend:

```sh
npm test
```

Use Node.js 24 ou superior e as dependências instaladas com `npm ci`.
O `.env` precisa conter `MONGO_URI` e `JWT_SECRET`. É necessário acesso de
rede ao Atlas e permissão para abrir um servidor HTTP local. Não é necessário
iniciar `npm start`, informar senha nem configurar `TEST_CHILD_TOKEN`.

## Autenticação automática

O helper carrega o `.env` e assina um JWT de cinco minutos em memória,
com os mesmos campos (`id` do usuário e `perfil`) usados pelo login.
Esse JWT pertence a um jogador fictício temporário criado pelo próprio teste.
O Router e os middlewares reais validam o token. O fluxo de login por email
e senha não faz parte desta suíte.

## Dados utilizados e descarte

A preparação confirma que existe uma criança autorizada com usuário infantil
e perfil de jogo ativo. Depois, seleciona o menor cômodo com duas a cinco
tarefas ativas, usando as tarefas e alternativas existentes no Atlas. Cada
tarefa precisa de uma alternativa correta e a primeira também precisa de uma
incorreta. A suíte falha com uma mensagem de preparação se faltarem esses dados.

O jogador temporário começa sem histórico. Sua conta, criança, perfil,
histórico e estrelas ficam em uma única transação real no Atlas. O teste
adapta os métodos de consulta para usar essa sessão; adapta também
`startSession`, `withTransaction` e `endSession` para o Service compartilhar
a transação externa sem confirmá-la ou encerrá-la. As consultas e gravações
continuam reais, sem simular resultados ou cálculos de pontuação.

O encerramento restaura os métodos e aborta a transação, inclusive em caso
de falha. Consultas fora dela confirmam que a conta, a criança, o perfil e
o histórico temporários não foram persistidos. Nenhum documento existente
é alterado ou excluído, e a criação automática de coleções e índices está
desabilitada. A suíte usa uma porta local livre e executa os cenários em
sequência porque eles compartilham a progressão do mesmo jogador.

Essa adaptação verifica as regras do Service e as respostas HTTP, mas não
verifica o commit, as retentativas de `withTransaction` nem a concorrência
entre requisições. Nenhum arquivo de produção é modificado.

## Cenários

- Requisição sem autenticação: HTTP 401.
- JWT automático com dificuldade inválida: HTTP 400.
- Médio e difícil bloqueados antes da conclusão anterior: HTTP 403.
- Ordem obrigatória em cada uma das três dificuldades: HTTP 403.
- Erros concedem zero estrelas e não liberam a próxima tarefa.
- Acertos concedem uma, duas e três estrelas em fácil, médio e difícil.
- Tentativas e total de estrelas conferidos com o banco após cada resposta.
- Conclusão parcial mantém a próxima dificuldade bloqueada.
- Conclusão de todas as tarefas libera a dificuldade seguinte.

Os 13 cenários anteriores continuam em `historicoJogo.test.js`; contando o
teste que os agrupa, são 14 aprovações. Com as quatro tarefas atuais, esse
arquivo realiza 27 requisições HTTP locais.

## Desbloqueio dos cômodos

`comodos.test.js` acrescenta 15 cenários e um teste que os agrupa. A suíte
completa totaliza **30 aprovações**, sem falhas ou testes ignorados quando
todos passam. Os novos cenários realizam 28 requisições HTTP locais, em
sequência, sem testes de carga.

Essa suíte cria um catálogo inteiramente temporário no Atlas: Quarto,
Banheiro e Cozinha, com duas tarefas cada; um cômodo inativo; um cômodo
vazio; outro com apenas tarefa inativa; e uma tarefa vinculada a um ID de
cômodo inexistente. As ordens dos cômodos temporários antecedem as ordens
existentes, sem editar o catálogo original. Isso isola a progressão de
cômodos existentes que o jogador de teste ainda não concluiu. As consultas
de cômodos e a contagem de tarefas também usam a sessão da transação.

Além da conta, do perfil e do histórico, a verificação após o aborto confirma
que nenhum cômodo, tarefa ou alternativa temporária persistiu. Nenhum
comando de exclusão é utilizado.

Os testes verificam:

- Quarto disponível inicialmente, com resposta aceita em HTTP 201.
- Banheiro bloqueado em todas as dificuldades enquanto o Quarto está pendente.
- Banheiro ainda bloqueado após concluir somente fácil, fácil e médio, ou
  deixar a última tarefa de difícil pendente no Quarto.
- Banheiro liberado após completar todas as tarefas do Quarto nos três níveis.
- Cozinha bloqueada enquanto o Banheiro está pendente, incluindo conclusão
  parcial e a última tarefa de difícil ainda não concluída.
- Cozinha liberada após completar o Banheiro nos três níveis.
- Cômodo inexistente ou inativo rejeitado em HTTP 403, com código
  `COMODO_INDISPONIVEL` e mensagem `Cômodo indisponível no momento`.
- Bloqueio de progressão em HTTP 403, com código `COMODO_BLOQUEADO` e mensagem
  `Conclua o cômodo anterior para continuar!`.
- Toda rejeição mantém inalteradas as estrelas e a quantidade de tentativas.

### Limitação do cenário sem tarefas

Não existe uma rota para iniciar um cômodo pelo seu ID. A gravação de uma
atividade usa `POST /historico-jogo/responder`, que exige `tarefaId` e
valida a existência e a ativação da tarefa antes de consultar o cômodo.
Portanto, após encontrar uma tarefa ativa do cômodo, a contagem de tarefas
ativas desse mesmo cômodo não pode ser zero em um estado estável do banco.
O ramo `quantidadeTarefas === 0` não é alcançável nesse fluxo normal.

Sem simular resultados do banco nem mudar as regras, os testes verificam
os comportamentos disponíveis na API:

- `GET /comodos/:comodoId/tarefas` de um cômodo vazio retorna HTTP 200,
  mensagem `Este cômodo ainda não possui tarefas cadastradas` e `tarefas: []`.
- Uma resposta com ID de tarefa não cadastrada retorna HTTP 404 e mensagem
  `Registro não encontrado`, sem gravar atividade.
- Uma resposta para tarefa inativa retorna HTTP 403 e mensagem
  `Tarefa indisponível`, antes da validação do cômodo.

Esses cenários não afirmam que um cômodo vazio retorna
`COMODO_INDISPONIVEL`. A suíte verifica o bloqueio ao registrar respostas;
a listagem de tarefas não é uma autorização para jogar. Nenhuma alteração
em Controller, Service ou nas rotas foi feita para tornar esse ramo alcançável.
