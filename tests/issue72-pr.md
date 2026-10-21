# Sugestão de commit

```text
feat!: exigir perfilJogoId no registro de respostas (#72)

Vincula a resposta ao personagem ativo da criança autenticada e adiciona
cobertura de seleção, autorização, contrato HTTP e isolamento de testes.

BREAKING CHANGE: POST /historico-jogo/responder exige perfilJogoId no body.
```

# Sugestão de Pull Request

Título: `Exigir personagem selecionado no registro de respostas (#72)`

Recomendação: abrir como **Draft**. Referenciar a issue com `Refs #72`, sem
fechamento automático enquanto persistirem as pendências abaixo.

## Descrição

O registro de respostas passava a usar um personagem ativo encontrado para a
criança, sem receber a seleção explícita do cliente. Agora o endpoint exige
`perfilJogoId`, e o Service busca esse personagem por `_id`, `criancaId` da
criança autenticada e `status: "ativo"`. Histórico, tentativas, estrelas e
verificações de desbloqueio usam o personagem encontrado.

`ID_INVALIDO` retorna HTTP 400. Personagem inexistente, alheio ou arquivado
retorna HTTP 404 por `PERFIL_JOGO_NAO_ENCONTRADO`. Não houve alteração nas
regras de pontuação ou desbloqueio, no bootstrap ou na conexão de produção.

## Contrato para o frontend

`POST /historico-jogo/responder`, com JWT de criança e body:

```json
{
  "perfilJogoId": "222222222222222222222222",
  "tarefaId": "333333333333333333333333",
  "respostaEscolhidaId": "444444444444444444444444",
  "dificuldade": "facil"
}
```

Os IDs acima são exemplos fictícios. A resposta 201 continua contendo apenas
`acertou`, `tentativa`, `pontuacaoGanha` e `dificuldade`. Clientes anteriores
precisam enviar o novo campo ou receberão 400. Os IDs de usuário, criança e
personagem são distintos e não podem ser usados de forma intercambiável.

## Validação desta revisão, sem banco

- `node tests/bancoCommitReal.test.js`: **8 aprovados**.
- `node tests/historicoJogoController.unit.test.js`: **6 aprovados**.
- Sintaxe de todos os 11 arquivos JavaScript modificados/novos: aprovada.
- Prettier nos arquivos modificados/novos e `git diff --check`: aprovados.
- `node tests/transacaoResposta.test.js`: **1 ignorado**, sem ativação explícita.
- Nenhuma tentativa de autenticação, gravação ou exclusão em banco nesta revisão.
- Verificação dos arquivos candidatos sem URIs literais, credenciais ou JWTs armazenados.

Os testes do Controller simulam o Service no sucesso e no erro de personagem;
o cenário de ID inválido executa a validação real do Service antes de consultar
o banco. Esses testes não substituem persistência, autorização com dados reais,
middlewares HTTP ou transações MongoDB.

## Evidências anteriores e limitações

- Os 70 testes de integração anteriores passaram em execução anterior com dados
  fictícios. Não foram reexecutados nesta revisão.
- Commit real foi confirmado anteriormente em MongoDB 7.0 local, por uma segunda
  conexão. Não foi validado no Atlas configurado para `conectamente_test`.
- A última tentativa no Atlas falhou na autenticação. Novas tentativas de
  configuração/conexão estão suspensas por decisão de cronograma.
- A execução completa anterior teve 75 testes: 72 aprovados e 3 falhos. As falhas
  foram dois cenários de concorrência e seu agrupador. A suíte atual tem novos
  testes unitários e não deve ser apresentada como integralmente aprovada.
- O teste de commit real exige `RUN_COMMIT_REAL_TESTS=1` no processo e uma
  `MONGO_TEST_URI` válida para `conectamente_test`; sem ambos é ignorado antes
  da conexão. `npm test` mantém as suítes anteriores com banco e não foi
  executado integralmente nesta revisão.
- Os helpers das suítes antigas usam bancos aleatórios `t72_<UUID>` e podem
  exigir permissões adicionais. O helper de commit usa somente `MONGO_TEST_URI`
  e bloqueia destinos diferentes de `conectamente_test`. Não houve novas
  tentativas de resolver permissões ou autenticação nesta revisão.

## Pendências funcionais para integração completa/liberação

1. Corrigir a corrida de `countDocuments + 1`: dois erros simultâneos, ou acerto
   com erro, podem gravar tentativas `[1, 1]`. A proposta técnica continua em
   `issue72-transacoes.md` e não foi aplicada. Impedir duplo clique no frontend
   reduz a ocorrência, mas não garante integridade entre abas ou clientes.
2. Disponibilizar ou acordar uma origem para o ID do personagem selecionado:
   o backend atual não registra uma rota de listagem/criação de personagens.
   `GET /criancas/meu-perfil` retorna a criança, não o personagem. Um ID
   provisionado permite integrar o registro de respostas em ambiente controlado,
   mas não resolve a seleção autônoma no fluxo completo do aplicativo.
3. A consulta de progresso/histórico é por criança; o histórico retorna
   `perfilJogoId`. A interface por personagem precisa considerar esse vínculo
   para não apresentar o progresso agregado como progresso do personagem atual.
4. Revalidar commit e concorrência em ambiente de testes autorizado e executar
   a suíte completa após a correção, antes de encerrar a issue.

Refs #72
