# Testes do backend

Use Node.js 24 ou superior e as dependências do projeto instaladas.

## Regressão sem Atlas

Execute com todas as flags de integração desativadas, sem carregar `.env`:

```sh
env RUN_ATLAS_TESTS=0 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=0 node --test --test-concurrency=1 --test-reporter=tap
```

Validação desta infraestrutura em 23/10/2026: **89 aprovados, 0 falhos e
16 ignorados**, em Node.js 24.21.0. Nenhuma integração real foi executada nesta
preparação. A tentativa no sandbox falhou em dois arquivos de testes HTTP;
a repetição autorizada fora dele passou, sem alterar expectativas dos testes.

Os testes unitários, de proteção e HTTP com mocks não acessam MongoDB real.
Os testes HTTP abrem servidores locais em portas livres. As suítes reais ficam
ignoradas. `atlasSeguro.test.js` substitui os pontos de entrada do Mongoose;
seus cenários de ativação usam ambiente fictício, sem sockets MongoDB.

## Contrato de segurança do Atlas

Toda conexão de integração passa por `helpers/atlasSeguro.js` e usa somente
`MONGO_TEST_URI`, com caminho exatamente `/conectamente_testes`. Não há fallback
para `MONGO_URI`, banco aleatório ou carregamento automático de `.env` nos helpers.
Não incluir credenciais em comandos, logs ou arquivos versionados.

- `RUN_ATLAS_TESTS=1`: autorização central, verificada dentro das funções de conexão.
- `RUN_COMMIT_REAL_TESTS=1`: autorização adicional para `transacaoResposta.test.js`.
- `RUN_CONCORRENCIA_REAL_TESTS=1`: autorização adicional para `concorrenciaPersonagens.mongo.test.js`.

As flags adicionais não substituem a central. URI ausente/inválida ou flag
ausente ignora a suíte; chamada direta ao helper é bloqueada antes do driver.
Não são aceitos fragmentos de URI, opção `dbName` na URI ou opções extras de
conexão capazes de substituir o destino autorizado.

O helper fixa `dbName`, desativa `autoCreate`/`autoIndex` e confere estado,
`connection.name`, `db.databaseName` e vínculo dos Models/coleções antes das
operações. Conexão primária preexistente é recusada. Uma conexão independente
de leitura exige primária já validada e também tem seu banco confirmado.
Falhas de conexão/validação fecham a conexão e retornam erro sanitizado.
Os helpers não importam `index.js`; JWTs usam segredos fictícios temporários.

## Preparação e limpeza

A preparação valida os Models antes de criar coleções e índices declarados.
`createIndexes()` é aditivo; não usa `syncIndexes()`. Incompatibilidades de
índice ou duplicatas devem interromper a preparação, sem apagar dados/índices.
Não há exclusão de banco ou coleções, nem limpeza geral de documentos.

`helpers/jogo.js` e `helpers/progresso.js` inserem fixtures em transação externa,
abortam ao terminar e conferem ausência dos IDs fora da transação. No helper
de jogo, funções de sessão são adaptadas para impedir commit; esses cenários
não comprovam commit do Service real. Coleções/índices ficam fora do abort.

Commit e concorrência mantêm transações reais do Service e consultam resultados
por conexão independente. A limpeza centralizada:

- Registra IDs antes das inserções, inclusive em preparação parcial.
- Exclui por `_id: { $in: IDs }`; históricos gerados pelo Service são delimitados
  pelos perfis fictícios exclusivos da execução.
- Valida todos os Models e IDs antes da primeira exclusão; listas vazias não excluem.
- Continua após falhas individuais e denuncia resíduos por erro agregado sanitizado.
- Confere ausência dos documentos; as conexões são encerradas em `finally`.

## Execução real deliberada

Antes de executar, preparar usuário exclusivo limitado a `conectamente_testes`,
acesso de rede do executor e suporte a transações. Confirmar permissões de
criação de coleções/índices e operações nesse banco, sem usar bancos da equipe.

Executar uma suíte por processo, sem outra execução usando o banco. O catálogo
fictício consulta a ordenação existente, portanto execuções sobrepostas podem
interferir entre si. Após interrupção forçada, revisar possíveis resíduos por
IDs conhecidos; nunca esvaziar banco ou coleções.

O suporte nativo do Node.js disponibiliza `.env` ao processo. Somente em ambiente
autorizado, selecionar explicitamente um dos arquivos abaixo:

```sh
env RUN_ATLAS_TESTS=1 RUN_COMMIT_REAL_TESTS=1 RUN_CONCORRENCIA_REAL_TESTS=0 node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/transacaoResposta.test.js
```

```sh
env RUN_ATLAS_TESTS=1 RUN_COMMIT_REAL_TESTS=0 RUN_CONCORRENCIA_REAL_TESTS=1 node --env-file=.env --test --test-concurrency=1 --test-reporter=tap tests/concorrenciaPersonagens.mongo.test.js
```

Esses comandos não são parte da regressão offline. Não usar `npm test` com
flags habilitadas como primeira validação de um ambiente.

Os relatórios históricos `issue71-*.md` e `issue72-*.md` podem conter destinos,
comandos e diagnósticos anteriores. Não substituem este contrato de segurança.
