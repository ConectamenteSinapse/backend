# Revisão da issue #71 — Gerenciamento de personagens

Data: 21/10/2026.

## Escopo e método

Revisão dos cinco arquivos principais, dos middlewares e da integração com
`POST /historico-jogo/responder` (issue #72). Foram examinados primeiro os
helpers, testes e documentação existentes.

Foi adicionado `tests/perfilJogo.test.js`, usando `node:test`, `assert` e
`t.mock`, como os testes existentes. Os testes executam HTTP local, JWT,
autorização, controllers, services e validação/defaults do Mongoose reais.
Somente a persistência é simulada, com documentos fictícios em memória e
métodos restaurados pelo runner. A chave JWT temporária é restaurada ao final.
Não há conexão MongoDB nesses novos testes.

O registro em `index.js` foi conferido por leitura e teste do código-fonte.
A aplicação HTTP dos testes monta os routers reais em uma instância isolada;
importar `index.js` abriria conexão com o banco configurado e iniciaria o servidor.

## Critérios

| Critério                           | Resultado                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro em `/perfis-jogo`         | Confirmado em `index.js`.                                                                                                                                                                                                     |
| JWT e `autorizarPerfil("crianca")` | Aplicados antes das cinco rotas; tokens ausentes, malformados, expirados e com assinatura incorreta retornam 401; outros perfis retornam 403 sem consultar a criança.                                                         |
| Cadastro                           | 201; nome/imagem são strings não vazias após trim. Campos ausentes, vazios, espaços e tipos incorretos retornam 400 sem gravar.                                                                                               |
| Estado inicial                     | Zero estrelas, nível 1, status ativo e data de criação. Tentativas de enviar dono, estrelas, nível ou status no POST são ignoradas.                                                                                           |
| Listagem                           | 200 com somente ativos da criança autenticada, ordenados do mais recente para o mais antigo; coleção vazia retorna `[]`.                                                                                                      |
| Acesso por ID                      | Ativo do dono retorna 200; alheio, arquivado ou inexistente retorna 404; ID inválido retorna 400.                                                                                                                             |
| PATCH                              | 200, altera somente nome/imagem; aceita cada campo separadamente e ambos juntos. Outros campos são ignorados; corpo sem campo permitido retorna 400. Dados inválidos não são salvos, inclusive quando o outro campo é válido. |
| DELETE                             | 204 sem corpo; salva apenas a mudança para arquivado, preservando documento e estrelas. Repetir DELETE retorna 404. Não há exclusão de histórico no código.                                                                   |
| Arquivado e issue #72              | Após DELETE, registrar resposta retorna 404 antes de iniciar transação; não altera estrelas. Há ressalva de concorrência abaixo.                                                                                              |
| Erros                              | Cobertos 400, 401, 403, 404 e 500. Ausência de cadastro infantil retorna 404 nos cinco endpoints; falha inesperada na consulta retorna 500 genérico nos cinco; JWT_SECRET ausente retorna 500 antes do banco.                 |

## Problemas e recomendações

1. **P2 — Corrida entre arquivamento e registro de resposta.**
   Em `services/historicoJogoService.js:102`, o status ativo é consultado antes
   da transação (`:214`). Se a requisição for suspensa após essa leitura e
   DELETE concluir antes de ela continuar, ainda será criado histórico (`:226`).
   No acerto, o incremento filtra somente `_id` (`:248`); no erro, nem existe
   escrita no personagem. Assim, o bloqueio funciona para requisições iniciadas
   após o arquivamento, mas não garante o bloqueio de uma resposta já em andamento.
   Recomendação: coordenar registro e arquivamento por escrita condicional no
   mesmo personagem dentro da transação, exigindo dono/status ativo e verificando
   o resultado, inclusive para respostas erradas. Uma nova leitura isolada do
   status não resolve toda a corrida. Validar em MongoDB com transações reais.
   Achado por análise de código; a corrida não foi reproduzida em banco nesta revisão.

2. **P2 — Tratamento incompleto de erros Mongoose.**
   `controllers/perfilJogoController.js:17`, `:98` e `:136` traduzem erros de
   domínio, mas não `ValidationError`/`CastError`; estes caem em 500. Outros
   controllers, incluindo o da issue #72, possuem tradução explícita para 400.
   As entradas inválidas comuns de nome/imagem e ID da rota já estão protegidas
   pelo service. O risco restante envolve validações do modelo, dados legados
   inconsistentes e claims JWT cujo `id` tenha formato inválido.
   Recomendação: padronizar o tratamento, distinguindo erro de entrada (400),
   token com payload inválido (401 no middleware) e falha interna (500).
   Não converter indiscriminadamente todo erro de persistência em 400.

3. **Compatibilidade a verificar com dados legados.**
   O enum novo em `models/perfilJogoModel.js:35` permite somente ativo/arquivado.
   Não foi consultado o banco para conferir os valores existentes. Documentos
   com outros status deixam de passar na validação ao serem salvos. Auditar os
   dados e planejar migração caso existam valores diferentes.
   As consultas de histórico/progresso atuais continuam agregando por criança;
   arquivar um personagem preserva sua contribuição. Separar progresso por
   personagem seria mudança adicional de contrato, não aplicada nesta revisão.

4. **Contrato de imagem e formatação.**
   `imagemAvatar` aceita qualquer string não vazia; não valida existência do
   arquivo, URL, MIME ou pertencimento a catálogo. Isso atende ao contrato atual,
   mas critérios mais restritos precisam ser definidos antes de implementados.
   Prettier aponta divergências preexistentes nos novos service/controller/router;
   recomenda-se formatá-los antes de integrar. O arquivo de testes adicionado
   passa na verificação de formatação.

## Execução e limites

- `node --test tests/perfilJogo.test.js`: **12 passaram, 0 falharam, 0 ignorados**.
- `npm test` final: **26 passaram, 5 falharam, 1 ignorado; 32 testes reportados**.
- As cinco falhas ocorrem na preparação por impossibilidade de conexão com o
  banco isolado: `comodos`, `historicoConsulta`, `historicoJogo`,
  `personagemResposta` e `progresso`. Seus subtestes não chegaram a executar.
  A falha persistiu fora do sandbox. O helper suprime detalhes sensíveis da
  conexão; esta execução não permite atribuir a causa a rede, autenticação ou
  autorização do MongoDB.
- O teste de commit real é ignorado por padrão, sem ativar sua flag de ambiente.
- `git diff --check`: passou para o diff rastreado.
- Prettier: três arquivos da implementação precisam de formatação, conforme acima.

O resultado não comprova persistência real nem preservação de históricos reais
no MongoDB. A preservação foi conferida pelo fluxo de soft delete e pela ausência
de operações de exclusão de histórico no código; o teste confirma a retenção do
documento fictício. As suítes existentes usam bancos aleatórios e transações
abortadas; não foi usado `index.js` para abrir o banco de desenvolvimento.

A implementação de negócio foi mantida. Foram adicionados somente os testes e
este relatório, sem modificar `.env`, credenciais, commits, push ou merge.
