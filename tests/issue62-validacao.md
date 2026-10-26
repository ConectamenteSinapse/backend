# Validação da issue #62

Data: 25/10/2026, America/Sao_Paulo. Node.js 24.22.1.

**Conclusão: a issue ainda não está pronta para commit/PR como concluída.**
Há respostas fora do contrato e verificações de formatação reprovadas.
Nenhum arquivo de produção foi editado pelo Codex; os 12 Controllers já estavam
alterados quando a revisão começou. Não houve commit, push, instalação ou seed.

## Base e escopo

Lidos `../CONTEXTO_DESENVOLVIMENTO.md` e `../ANALISE_ARQUITETURA_BACKEND.md`.
São fotografias históricas; o checkout atual prevalece sobre descrições antigas.

Branch: `62-padronizar-validações-e-respostas-de-erro-da-api`.
HEAD, main e origin/main locais apontam para
`f662fe4b2d0ed22f7971ccaeada6123c9fcf63b5`. A comparação foi das alterações
locais contra esse commit anterior à implementação. Não foi feito fetch;
origin/main local não certifica o estado remoto ao vivo.

Analisados **12 Controllers, 54 funções exportadas, 33 endpoints ativos de
negócio em 11 Routers e 2 middlewares**. A rota raiz `GET /` foi inspecionada
separadamente: são 34 endpoints incluindo a raiz. Funções internas com rotas
comentadas também foram revisadas e testadas, sem ativar escrita pública.

| Controller | Funções |
| --- | ---: |
| comodo | 3 |
| crianca | 7 |
| historicoConsulta | 2 |
| historicoJogo | 1 |
| jogoSalvo | 5 |
| perfilJogo | 5 |
| progresso | 2 |
| responsavel | 7 |
| resposta | 7 |
| resumoDesempenho | 1 |
| tarefa | 6 |
| usuario | 8 |

O diff preserva chamadas e argumentos dos Services, regras de negócio, JWT,
autorização, Models e Routes. A troca dos DELETEs de personagem e partida para
`sendStatus(204)` preserva o comportamento HTTP sem corpo. Não foi encontrada
regressão funcional introduzida pela alteração, além da necessária migração das
expectativas dos testes para o novo contrato. Isso não significa aprovação da
padronização: vários retornos antigos continuam pendentes.

## Resultados executados

As contagens do Node incluem testes agrupadores. Uma falha de cenário pode
também reprovar seu agrupador; contagens não representam problemas distintos.

| Execução | Aprovados | Falhos | Ignorados |
| --- | ---: | ---: | ---: |
| Suíte original antes de atualizar expectativas | 203 | 19 | 32 |
| Suíte existente com expectativas da #62 | 217 | 5 | 32 |
| Nova suíte específica da #62 | 226 | 67 | 0 |
| Suíte completa final sem MongoDB | 443 | 72 | 32 |
| Dez suítes MongoDB, últimas execuções | 105 | 9 | 0 |

Os 32 casos ignorados na execução sem banco **não foram aprovados nessa
execução**. Todos os arquivos de integração correspondentes foram executados
depois, separadamente, com flags habilitadas; não ficou integração sem tentativa
de execução. Não somar novamente as linhas de suíte existente/específica à
suíte completa. MongoDB é uma execução separada.

As 19 falhas iniciais eram expectativas antigas de formato/texto. Depois da
migração, os cinco testes existentes que continuam falhando são: dois testes de
ID inválido em `historicoJogoController.unit.test.js`, segredo JWT ausente em
`perfilJogo.test.js`, tarefa inexistente em `respostas.issue52.test.js` e JWT
ausente em `resumoDesempenho.issue58.test.js`. São falhas reais do contrato,
mantidas visíveis.

| Integração MongoDB | Aprovados | Falhos | Ignorados |
| --- | ---: | ---: | ---: |
| comodos | 16 | 0 | 0 |
| historicoConsulta | 14 | 2 | 0 |
| historicoJogo | 14 | 0 | 0 |
| progresso | 12 | 2 | 0 |
| personagemResposta | 8 | 2 | 0 |
| transacaoResposta | 5 | 0 | 0 |
| concorrenciaPersonagens.mongo | 10 | 0 | 0 |
| resumoDesempenho.issue58.mongo | 9 | 3 | 0 |
| resumoDesempenhoPreservacao.issue58.mongo | 3 | 0 | 0 |
| midia.issue90.mongo | 14 | 0 | 0 |

As nove reprovações MongoDB são seis cenários e três agrupadores: JWT ausente
no histórico e no progresso; ID inválido no envio por personagem; JWT ausente,
inválido e expirado no resumo. Nenhuma delas foi erro de infraestrutura ou
falha de limpeza. A primeira execução de personagem revelou também uma
expectativa abreviada antiga (`{ mensagem }`); ela foi migrada e a suíte
reexecutada. A tabela mostra o último resultado, sem somar repetições.

Foi validada a URI sem imprimi-la, exclusivamente para `conectamente_testes`,
e a conexão confirmou suporte a transações. A tentativa inicial no sandbox
não conseguiu conectar; a execução autorizada fora dele funcionou. Foram
usados os helpers existentes, processos sequenciais, abort das fixtures ou
limpeza restrita aos IDs da execução e verificações independentes onde previstas.
Não houve conexão ao banco de desenvolvimento/produção nem exclusão geral.

`npm.cmd run format:check`: **falhou nos 12 Controllers alterados**.
`git diff --check`: espaços ao final em `comodoController.js:26` e
`responsavelController.js:11`. Nenhum formatador com escrita foi executado.

## Cobertura do contrato

| Status | Evidência e avaliação |
| --- | --- |
| 400 | Body ausente/vazio, IDs, CastError, ValidationError, regras e mídia. Pendências: histórico ID_INVALIDO; validações diretas de resposta; login/PUT de usuário sem body retornam 500. |
| 401 | Credenciais inválidas no login aprovadas; assinatura, expiração, formato e ausência de JWT negam acesso, porém middleware não inclui erro:true. |
| 403 | Regras de acesso, permissão e progressão preservadas; autorização por perfil não inclui erro:true. |
| 404 | Traduções de domínio majoritariamente corretas; faltam flags em tarefa e resposta; rota inexistente recebe HTML. |
| 409 | Usuário, criança, responsável e resposta aprovados nas traduções aplicáveis; tarefa duplicada ainda retorna 500. |
| 500 | Exceções simuladas nas 54 funções não expuseram a mensagem técnica injetada; faltam flags em histórico, progresso por partida e responsável, além do Auth sem segredo. |
| 200/201 | 54 caminhos de sucesso exercitados: 41 retornos 200, 8 retornos 201 e 5 retornos 204. Payloads, projeção da tentativa, login/JWT e permissão false preservados. Integrações complementam persistência, cálculos e isolamento. |
| 204 | Os 5 métodos usam sendStatus(204); DELETEs públicos de personagem/partida conferidos via Express real: zero bytes e sem Content-Type. Outros DELETEs internos conferidos por chamada de Controller. |

Não foi calculada porcentagem de cobertura de linhas/branches. A cobertura
acima é funcional; não equivale a testar todas as combinações de entrada.

Sete verificações fixas independentes do código confirmam status 403, mensagem
e `codigo`: quatro no histórico e três na edição de jogo salvo. Foram preservados
`TAREFA_FORA_DA_ORDEM`, `DIFICULDADE_BLOQUEADA`, `COMODO_BLOQUEADO` e
`COMODO_INDISPONIVEL` onde já existiam. Os testes reais de progressão também
mantêm a comparação desses códigos.

## Diagnóstico e correções manuais sugeridas

**19 pontos de retorno ainda omitem `erro: true`.** Nos trechos abaixo, inserir
essa propriedade no objeto JSON, conservando status, mensagem e eventual codigo:

| Arquivo | Linhas e trechos pendentes |
| --- | --- |
| `middleware/Auth.js` | 7 (token ausente), 14 (formato), 20 (segredo ausente), 29 (inválido/expirado): `.json({ mensagem: ... })`. |
| `middleware/autorizarPerfil.js` | 4 (401) e 9 (403): `.json({ mensagem: ... })`. |
| `controllers/historicoJogoController.js` | 6: `status(400).json({ mensagem: "ID inválido" })`; 40: `status(500).json({ mensagem: "Erro interno do servidor" })`. |
| `controllers/progressoController.js` | 46, fallback 500 de obterProgressoJogo. |
| `controllers/responsavelController.js` | 42, fallback 500 compartilhado pelas sete funções. |
| `controllers/tarefaController.js` | 50, 404 de getTarefaById. |
| `controllers/respostaController.js` | 38, 54, 104, 126, 140: cinco 404; 77, 100, 119: três validações 400 de POST/PUT/PATCH. |

Exemplo da correção local, sem abstração nova:

```js
return res.status(404).json({
  erro: true,
  mensagem: "Tarefa não encontrada",
});
```

Outros problemas, todos já presentes em HEAD:

1. **Body ausente vira 500.** `controllers/usuarioController.js:105` acessa
   `req.body.nome` no PUT; linha 158 desestrutura `req.body` no login.
   Sugerido: antes desses acessos, validar a presença de body e retornar 400
   com `{ erro: true, mensagem: "Body da requisição obrigatório" }`.
   PUT está desativado publicamente; login está ativo.
2. **Conflito de ordem vira 500.** `controllers/tarefaController.js:3-33`
   não trata `error.code === 11000`, embora o Model tenha índice único
   `comodoId + ordem`. Sugerido: condição local retornando 409 com mensagem
   pública e flag, antes do fallback 500. Manutenção de tarefa é interna.
3. **Erros anteriores ao Controller não estão padronizados.** `index.js:25`
   usa `express.json()` sem tradução do erro de parsing; não há resposta JSON
   para caminho inexistente depois dos routers. A reprodução usa express.json()
   e routers reais com os mesmos prefixos, sem importar o bootstrap que conecta
   ao banco. JSON malformado recebe 400 HTML e rota desconhecida, 404 HTML.
   Em ambiente Express development, o primeiro expõe `SyntaxError`, stack e
   caminhos internos. Em produção o Express oculta o stack, mas o formato
   continua HTML. Recomenda-se tratar essas entradas no escopo local autorizado
   e configurar corretamente o ambiente publicado. A solução precisa respeitar
   a restrição contra middleware global de erros; nenhum foi criado.

Não foi observado vazamento de mensagem técnica nas respostas 500 capturadas
pelos Controllers. Isso é diferente do vazamento de parsing acima. Logs internos
ainda recebem objetos Error completos; não foi realizada auditoria do destino,
retenção ou acesso a esses logs. Não se afirma segurança global a partir dos mocks.

## Testes criados e atualizados

- Novo `erros.issue62.test.js`: Controllers reais, Services substituídos apenas
  no processo deste arquivo com registerHooks do Node; sem Models/conexão real.
  Cobre as 54 funções, traduções de domínio/Mongoose, duplicidades, bodies,
  sucessos, falhas técnicas, códigos fixos de progressão, login com bcrypt/JWT
  reais, middlewares e HTTP dos 31 endpoints protegidos.
- Novo `helpers/verificarAmbienteIssue62.js`: verificação sanitizada de destino,
  conexão e suporte a transações usando exclusivamente atlasSeguro.js.
- Nove arquivos existentes migrados para exigir `erro: true` nas expectativas
  de erro: comodos, historicoConsulta, historicoJogoController.unit, perfilJogo,
  personagemResposta, progresso, respostas.issue52 e os dois arquivos de
  resumoDesempenho.issue58 (local/Mongo). Acentuação do ID inválido na #52
  acompanha o novo texto. Expectativas de sucesso não foram flexibilizadas.
- Não foram alterados os helpers de conexão/limpeza, flags ou regras do jogo.

Evidências brutas: `issue62-baseline.tap`, `issue62-existentes.tap`,
`issue62-novos.tap`, `issue62-suite-completa.tap`,
`issue62-integracao-*.tap` e `issue62-formatacao.log`.

Reprodução local sem carregar .env:

```powershell
$env:RUN_ATLAS_TESTS='0'
$env:RUN_COMMIT_REAL_TESTS='0'
$env:RUN_CONCORRENCIA_REAL_TESTS='0'
node --test --test-concurrency=1 --test-reporter=tap
```

As integrações devem seguir `tests/README.md`, com URI exclusiva e um arquivo
por processo. Os resultados acima não autorizam substituir a URI ou limpar
coleções inteiras. Após a correção manual, repetir os testes afetados e a suíte
completa antes de apresentar a issue como pronta.
