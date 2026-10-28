# ConectaMente — Backend

API do jogo ConectaMente, voltado a atividades cotidianas para crianças com síndrome de Down e ao acompanhamento por responsáveis.

A API utiliza MongoDB com Mongoose para persistência, autenticação JWT e senhas protegidas com bcrypt. Os recursos atuais incluem contas, perfis infantis e de responsáveis, vínculos, permissão para jogar, catálogo de atividades, personagens, partidas, tentativas, histórico, progresso e resumo de desempenho.

## Tecnologias e organização

- Node.js e JavaScript com ES Modules.
- Express 5.
- MongoDB / MongoDB Atlas e Mongoose.
- `jsonwebtoken`, bcrypt e dotenv.
- Nodemon para desenvolvimento.
- Runner nativo `node:test` para testes automatizados.
- Prettier, Husky e lint-staged para formatação.
- Insomnia para testes manuais por HTTP.

```text
backend/
├── config/         # Conexão com o MongoDB
├── controllers/    # Entrada HTTP, validações e respostas
├── middleware/     # Autenticação e autorização por perfil
├── models/         # Schemas, referências e índices Mongoose
├── routes/         # Endpoints e aplicação dos middlewares
├── services/       # Regras de negócio, acesso e persistência
├── tests/          # Testes, helpers e relatórios
├── index.js        # Configuração e inicialização da API
├── package.json
└── README.md
```

Fluxo da aplicação: Routes → Controllers → Services → Models → MongoDB. Os Services consultam os Models diretamente.

## Como executar

Utilize Node.js 24 ou superior para trabalhar também com a infraestrutura de testes existente.

1. Instale as dependências na raiz do backend:

   ```bash
   npm install
   ```

2. Crie um arquivo `.env`, usando [`.envExemplo.txt`](.envExemplo.txt) como referência. Substitua os valores ilustrativos pelos do ambiente escolhido:

   ```dotenv
   PORT=4000
   FRONTEND_URL=http://localhost:3000
   MONGO_URI=mongodb+srv://USUARIO:SENHA@SEU_CLUSTER.mongodb.net/BANCO_DO_AMBIENTE
   JWT_SECRET=SUBSTITUA_POR_UM_SEGREDO_PROPRIO
   ```

   A aplicação conecta pelo `MONGO_URI`. O registro de respostas usa transações e requer uma implantação MongoDB que as suporte, como um cluster Atlas ou replica set. Não publique credenciais ou tokens.

3. Inicie a aplicação:

   ```bash
   npm start
   ```

A URL base na configuração local acima é `http://localhost:4000`. Sem `PORT`, a aplicação utiliza a porta 3000. Os endpoints abaixo são relativos à base do backend, sem prefixo `/api`.

A rota inicial confirma atendimento HTTP. Ela não testa a conexão com o banco: a inicialização atual não aguarda a conclusão da conexão antes de abrir a porta.

### Configuração do CORS

O backend utiliza a biblioteca `cors` para permitir que o frontend Next.js acesse a API a partir de uma origem autorizada.

No ambiente de desenvolvimento local, utilizamos:

| Aplicação          | Endereço                |
| ------------------ | ----------------------- |
| Frontend (Next.js) | `http://localhost:3000` |
| Backend (Express)  | `http://localhost:4000` |

No arquivo `.env` do backend, configure:

```dotenv
PORT=4000
FRONTEND_URL=http://localhost:3000
```

A variável `FRONTEND_URL` define a origem autorizada pelo CORS.

Quando essa variável não está configurada, o middleware não adiciona cabeçalhos de autorização CORS.

O CORS não substitui a autenticação JWT. As rotas protegidas continuam exigindo o cabeçalho `Authorization: Bearer <token>`.

Em outros ambientes, configure `FRONTEND_URL` com a origem real do frontend.

## Autenticação, autorização e identificadores

### JWT e perfis

Cadastro e login são públicos. As demais rotas de recursos exigem:

```http
Authorization: Bearer <token>
```

O login retorna um JWT com o ID da conta e o perfil, válido por **5 horas**. Utilize exatamente o prefixo `Bearer`. Os perfis aceitos no cadastro são `crianca` e `responsavel`.

As tabelas de rotas usam estas indicações:

| Acesso            | Exigência                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Público           | Sem JWT.                                                                                                                                  |
| JWT               | Token válido de criança ou responsável.                                                                                                   |
| Criança           | JWT com perfil `crianca`. Operações de personagens e partidas também verificam perfil infantil, propriedade e estado ativo do personagem. |
| Responsável       | JWT com perfil `responsavel`; operações de vínculo e permissão exigem o perfil de responsável cadastrado.                                 |
| Própria/vinculada | JWT da própria criança ou de seu responsável vinculado, conforme autorização no Service.                                                  |

Criar uma conta não cria automaticamente seu perfil infantil ou de responsável. A permissão para jogar é verificada no registro de respostas; não é requisito geral para consultar o catálogo ou criar personagem e partida.

### IDs que não devem ser confundidos

Os IDs são strings ObjectId do MongoDB, normalmente com 24 caracteres hexadecimais. Utilize os valores retornados pela API, sem substituir por números sequenciais.

| Identificador     | Significado e origem                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Usuario._id`     | ID da conta: `_id` de POST `/usuarios`, `usuario.id` do login ou `_id` de GET `/usuarios/meu-perfil`. É o `id` presente no JWT.          |
| `Crianca._id`     | ID do perfil infantil: `_id` de POST `/criancas` ou GET `/criancas/meu-perfil`. O campo `usuarioId` desse documento aponta para a conta. |
| `Responsavel._id` | ID do perfil do responsável, retornado no seu cadastro. O `responsavelId` da criança aponta para esse perfil.                            |
| `PerfilJogo._id`  | ID do personagem, usado como `perfilJogoId`.                                                                                             |
| `JogoSalvo._id`   | ID da partida, usado como `jogoSalvoId` ou `:id` nas rotas de jogos salvos.                                                              |

**O parâmetro `:criancaId` tem dois significados diferentes nas rotas atuais:**

| Operação                                                                    | ID exigido na URL        |
| --------------------------------------------------------------------------- | ------------------------ |
| Consultar progresso, histórico ou resumo geral em `/criancas/:criancaId...` | `Usuario._id` da criança |
| Alterar permissão em `/responsaveis/minhas-criancas/:criancaId/permissao`   | `Crianca._id`            |

Histórico e progresso gerais retornam em `criancaId` o ID da conta recebido na URL. O resumo de desempenho recebe o mesmo ID da conta, mas retorna `Crianca._id` em `criancaId`.

## Respostas HTTP e erros

Respostas de sucesso não possuem um envelope único: podem ser documentos, arrays ou objetos de consulta. Os retornos 204 não possuem corpo.

| Status | Uso principal                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| 200    | Consulta ou atualização concluída. Listas vazias também podem retornar 200.                                      |
| 201    | Conta, perfil, personagem, partida ou tentativa criada.                                                          |
| 204    | Personagem arquivado ou partida excluída, sem corpo.                                                             |
| 400    | Dados, identificadores, JSON ou URL inválidos.                                                                   |
| 401    | JWT ausente/inválido/expirado ou credenciais incorretas.                                                         |
| 403    | Perfil sem acesso, consulta não autorizada, permissão inativa ou bloqueio do jogo.                               |
| 404    | Rota ou registro inexistente; em personagens e partidas também indica recurso não acessível ao dono autenticado. |
| 409    | Duplicidade de conta/perfil ou criança já vinculada.                                                             |
| 500    | Falha interna tratada ou configuração obrigatória ausente.                                                       |

O contrato dos erros tratados pela API é:

```json
{
  "erro": true,
  "mensagem": "Descrição do problema"
}
```

As mensagens variam conforme a operação. As falhas inesperadas capturadas pelos Controllers retornam mensagens genéricas, sem detalhes técnicos da exceção.

O `index.js` trata JSON malformado com 400 e `mensagem: "JSON inválido"`, URL inválida detectada como `URIError` com 400 e `mensagem: "URL inválida"`, e rotas não encontradas com 404 e `mensagem: "Rota não encontrada"`.

### Códigos dos bloqueios do jogo

Alguns erros 403 incluem `codigo`, que deve ser preservado pelo cliente:

```json
{
  "erro": true,
  "mensagem": "Conclua a dificuldade anterior para continuar!",
  "codigo": "DIFICULDADE_BLOQUEADA"
}
```

| `codigo`                | Significado                                                     | Operações                              |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `TAREFA_FORA_DA_ORDEM`  | Existem tarefas anteriores sem acerto na dificuldade escolhida. | Registrar resposta e atualizar partida |
| `DIFICULDADE_BLOQUEADA` | A dificuldade anterior do cômodo ainda não foi concluída.       | Registrar resposta e atualizar partida |
| `COMODO_BLOQUEADO`      | Existem cômodos anteriores ainda não concluídos.                | Registrar resposta e atualizar partida |
| `COMODO_INDISPONIVEL`   | O cômodo está ausente, inativo ou indisponível para execução.   | Registrar resposta                     |

Nem todo erro 403 possui `codigo`: perfil incorreto, permissão inativa e tarefa inativa, por exemplo, retornam `erro` e `mensagem`.

## Rotas ativas

São **34 rotas ativas**, contando método e endpoint, incluindo `GET /`. As tabelas apresentam os principais status por operação; JSON malformado e URL inválida também podem produzir 400 conforme o tratamento de entrada.

Parâmetros precedidos por `:` devem ser substituídos pelos IDs reais. GET e DELETE não precisam de body. Não há paginação nem filtros por query implementados nesses endpoints.

### API principal — 1 rota

| Método | Endpoint | Objetivo                                     | Acesso  | Principais status |
| ------ | -------- | -------------------------------------------- | ------- | ----------------- |
| GET    | `/`      | Retornar o texto `Api iniciado com Sucesso`. | Público | 200               |

### Usuários e autenticação — 3 rotas

| Método | Endpoint               | Objetivo                                         | Acesso  | Principais status       |
| ------ | ---------------------- | ------------------------------------------------ | ------- | ----------------------- |
| POST   | `/usuarios`            | Cadastrar conta de criança ou responsável.       | Público | 201, 400, 409, 500      |
| POST   | `/usuarios/auth`       | Validar credenciais e emitir JWT.                | Público | 200, 400, 401, 500      |
| GET    | `/usuarios/meu-perfil` | Consultar a própria conta identificada pelo JWT. | JWT     | 200, 400, 401, 404, 500 |

**Cadastro:** `nome`, `email`, `senha` e `perfil` são strings obrigatórias não vazias. O perfil deve ser `crianca` ou `responsavel`. E-mail duplicado retorna 409. Exemplo para responsável:

```json
{
  "nome": "Responsável Exemplo",
  "email": "responsavel@example.invalid",
  "senha": "SenhaExemplo123!",
  "perfil": "responsavel"
}
```

Para criar a conta infantil:

```json
{
  "nome": "Criança Exemplo",
  "email": "crianca@example.invalid",
  "senha": "SenhaExemplo123!",
  "perfil": "crianca"
}
```

**Login:** `email` e `senha` são obrigatórios. Exemplo:

```json
{
  "email": "crianca@example.invalid",
  "senha": "SenhaExemplo123!"
}
```

Repita o login com as credenciais do responsável para obter seu token separado. A resposta contém `mensagem`, `token` e `usuario` com `id`, `nome`, `email` e `perfil`. Cadastro, login e consulta da conta não retornam senha nem hash.

### Perfil infantil — 2 rotas

| Método | Endpoint               | Objetivo                                      | Acesso  | Principais status                 |
| ------ | ---------------------- | --------------------------------------------- | ------- | --------------------------------- |
| POST   | `/criancas`            | Criar o perfil infantil da conta autenticada. | Criança | 201, 400, 401, 403, 404, 409, 500 |
| GET    | `/criancas/meu-perfil` | Consultar o próprio perfil infantil.          | Criança | 200, 400, 401, 403, 404, 500      |

O cadastro exige body, mas `dataNascimento` é opcional. Este exemplo retorna 201 para uma conta infantil sem perfil:

```json
{
  "dataNascimento": "2018-05-20"
}
```

Também é válido enviar `{}`. Omitir o body retorna 400. O usuário vem do JWT; o perfil é criado com `responsavelId: null` e `permissaoAtiva: false`. O cliente não define vínculo ou permissão nesse cadastro. Perfil duplicado retorna 409.

### Responsáveis, vínculo e permissão — 4 rotas

| Método | Endpoint                                             | Objetivo                                                | Acesso      | Principais status                 |
| ------ | ---------------------------------------------------- | ------------------------------------------------------- | ----------- | --------------------------------- |
| POST   | `/responsaveis`                                      | Criar o perfil do responsável autenticado.              | Responsável | 201, 400, 401, 403, 404, 409, 500 |
| GET    | `/responsaveis/minhas-criancas`                      | Listar os perfis infantis vinculados ao responsável.    | Responsável | 200, 400, 401, 403, 404, 500      |
| POST   | `/responsaveis/vincular-crianca`                     | Vincular a criança pelas credenciais da conta infantil. | Responsável | 200, 400, 401, 403, 404, 409, 500 |
| PATCH  | `/responsaveis/minhas-criancas/:criancaId/permissao` | Conceder ou revogar permissão para jogar.               | Responsável | 200, 400, 401, 403, 404, 500      |

**Criar perfil:** POST `/responsaveis` usa a conta do JWT. Não exige body; enviar `{}` também é possível. Perfil duplicado retorna 409.

**Vincular:** envie `email` e `senha` da criança, com o token do responsável:

```json
{
  "email": "crianca@example.invalid",
  "senha": "SenhaExemplo123!"
}
```

O responsável e o perfil infantil devem existir. O vínculo retorna o perfil infantil atualizado e não ativa a permissão. Credenciais incorretas retornam 401; criança já vinculada, inclusive ao mesmo responsável, retorna 409.

**Permissão:** substitua `:criancaId` por `Crianca._id`, não pelo ID da conta. Body obrigatório:

```json
{
  "permissaoAtiva": true
}
```

Use `false` para revogar. O campo exige booleano; `"true"` é inválido. Criança não vinculada ao responsável retorna 404. A resposta de sucesso é:

```json
{
  "mensagem": "Permissão atualizada com sucesso",
  "permissaoAtiva": true
}
```

A listagem das crianças retorna array, inclusive `[]`; responsável sem perfil cadastrado recebe 404. Não existe rota ativa específica para consultar o próprio perfil de responsável.

### Cômodos — 3 rotas

| Método | Endpoint                     | Objetivo                                     | Acesso | Principais status       |
| ------ | ---------------------------- | -------------------------------------------- | ------ | ----------------------- |
| GET    | `/comodos`                   | Listar os cômodos cadastrados.               | JWT    | 200, 401, 500           |
| GET    | `/comodos/:id`               | Consultar um cômodo por `Comodo._id`.        | JWT    | 200, 400, 401, 404, 500 |
| GET    | `/comodos/:comodoId/tarefas` | Consultar tarefas associadas a `Comodo._id`. | JWT    | 200, 400, 401, 404, 500 |

O documento do cômodo inclui `nome`, `descricao`, `imagemCenario`, `ordem`, `dificuldadesDisponiveis` e `ativo`. A listagem geral retorna array, inclusive vazio.

A consulta de tarefas verifica a existência do cômodo. Com tarefas, retorna array; sem tarefas, retorna 200 com:

```json
{
  "mensagem": "Este cômodo ainda não possui tarefas cadastradas",
  "tarefas": []
}
```

### Tarefas — 3 rotas

| Método | Endpoint                       | Objetivo                                              | Acesso | Principais status       |
| ------ | ------------------------------ | ----------------------------------------------------- | ------ | ----------------------- |
| GET    | `/tarefas`                     | Listar as tarefas cadastradas.                        | JWT    | 200, 401, 500           |
| GET    | `/tarefas/:id`                 | Consultar uma tarefa por `Tarefa._id`.                | JWT    | 200, 400, 401, 404, 500 |
| GET    | `/tarefas/:tarefaId/respostas` | Consultar alternativas de `Tarefa._id`, sem gabarito. | JWT    | 200, 400, 401, 404, 500 |

As tarefas incluem seus campos cadastrados, como `titulo`, `enunciado`, `descricao`, `comodoId`, `imagemObjeto`, `posicao` (`x`, `y`, `largura`, `altura`), `ordem`, `dificuldade` e, quando cadastrado, `audioEnunciado`.

GET `/tarefas` retorna array, inclusive `[]`. Na consulta de alternativas por tarefa, tarefa inexistente retorna 404; tarefa existente sem alternativas retorna 200 com `[]`. As alternativas são ordenadas por `ordem` crescente.

### Alternativas do catálogo — 2 rotas

| Método | Endpoint                 | Objetivo                                      | Acesso | Principais status       |
| ------ | ------------------------ | --------------------------------------------- | ------ | ----------------------- |
| GET    | `/respostas`             | Listar alternativas cadastradas.              | JWT    | 200, 401, 500           |
| GET    | `/respostas/:respostaId` | Consultar uma alternativa por `Resposta._id`. | JWT    | 200, 400, 401, 404, 500 |

O recurso `/respostas` representa alternativas do catálogo. O registro da escolha da criança ocorre em `/historico-jogo/responder`.

As consultas de alternativas retornam campos como `_id`, `tarefaId`, `texto`, `ordem` e, quando cadastrados, `imagem` e `audio`. **Todas excluem `correta`**, inclusive listagem geral e consulta por ID.

#### Mídia, ordem e disponibilidade do catálogo

- `Tarefa.imagemObjeto` é obrigatório no cadastro interno; `Tarefa.audioEnunciado`, `Resposta.imagem` e `Resposta.audio` são opcionais.
- Os campos de mídia armazenam referências textuais, não arquivos binários. Registros sem mídia continuam válidos; o campo pode estar ausente ou ser `null`.
- A manutenção interna aceita strings não vazias, sem exigir formato específico de URL ou caminho; rejeita strings vazias, espaços e tipos inválidos. `null` representa ausência/remoção; campo omitido é preservado nas atualizações.
- Somente alternativas por tarefa têm ordenação explícita por `ordem`. Cômodos, tarefas e listagem geral de alternativas não têm ordenação explícita.
- Consultas do catálogo não filtram automaticamente por `ativo` nem por progressão da partida. A disponibilidade para executar a atividade é verificada ao jogar.
- Não há escrita pública ativa para cômodos, tarefas ou alternativas, nem endpoint de upload de mídia.

### Personagens / perfis de jogo — 5 rotas

| Método | Endpoint           | Objetivo                                                   | Acesso  | Principais status            |
| ------ | ------------------ | ---------------------------------------------------------- | ------- | ---------------------------- |
| POST   | `/perfis-jogo`     | Criar personagem para a criança autenticada.               | Criança | 201, 400, 401, 403, 404, 500 |
| GET    | `/perfis-jogo`     | Listar personagens próprios e ativos.                      | Criança | 200, 401, 403, 404, 500      |
| GET    | `/perfis-jogo/:id` | Consultar personagem próprio e ativo por `PerfilJogo._id`. | Criança | 200, 400, 401, 403, 404, 500 |
| PATCH  | `/perfis-jogo/:id` | Atualizar nome e/ou imagem do personagem.                  | Criança | 200, 400, 401, 403, 404, 500 |
| DELETE | `/perfis-jogo/:id` | Arquivar personagem próprio e ativo.                       | Criança | 204, 400, 401, 403, 404, 500 |

**Criar:** `nomeAvatar` e `imagemAvatar` são strings não vazias obrigatórias:

```json
{
  "nomeAvatar": "Exploradora",
  "imagemAvatar": "avatars/exploradora.png"
}
```

**Atualizar:** envie ao menos um dos dois campos; os demais dados do personagem não são editáveis por essa operação:

```json
{
  "nomeAvatar": "Exploradora Atualizada",
  "imagemAvatar": "avatars/exploradora-2.png"
}
```

A listagem retorna array de personagens ativos, ordenados por `criadoEm` decrescente, com `_id`, `nomeAvatar`, `imagemAvatar`, `estrelasTotal` e `nivelAtual`.

Personagem inexistente, de outra criança ou arquivado retorna 404 nas operações por ID. DELETE retorna 204 sem corpo e altera `status` para `arquivado`, preservando documento, partidas e históricos. As partidas desse personagem ficam inacessíveis pelos endpoints de jogos salvos.

### Jogos salvos / partidas — 7 rotas

| Método | Endpoint                      | Objetivo                                          | Acesso  | Principais status            |
| ------ | ----------------------------- | ------------------------------------------------- | ------- | ---------------------------- |
| POST   | `/jogos-salvos`               | Criar partida para personagem próprio ativo.      | Criança | 201, 400, 401, 403, 404, 500 |
| GET    | `/jogos-salvos`               | Listar partidas dos personagens próprios ativos.  | Criança | 200, 401, 403, 404, 500      |
| GET    | `/jogos-salvos/:id`           | Consultar ou retomar partida por `JogoSalvo._id`. | Criança | 200, 400, 401, 403, 404, 500 |
| PATCH  | `/jogos-salvos/:id`           | Atualizar nome e/ou posição válida da partida.    | Criança | 200, 400, 401, 403, 404, 500 |
| DELETE | `/jogos-salvos/:id`           | Excluir partida preservando seus históricos.      | Criança | 204, 400, 401, 403, 404, 500 |
| GET    | `/jogos-salvos/:id/progresso` | Consultar progresso exclusivo da partida.         | Criança | 200, 400, 401, 403, 404, 500 |
| GET    | `/jogos-salvos/:id/historico` | Consultar tentativas exclusivas da partida.       | Criança | 200, 400, 401, 403, 404, 500 |

**Criar:** `perfilJogoId` e `nomeJogo` são obrigatórios. O personagem precisa pertencer à criança autenticada:

```json
{
  "perfilJogoId": "{{ _.personagem_id }}",
  "nomeJogo": "Primeira partida"
}
```

A partida começa com `comodoId: null`, `tarefaId: null`, `dificuldade: "facil"` e `estrelasTotal: 0`. São permitidas várias partidas para o mesmo personagem.

**Atualizar:** os campos editáveis são `nomeJogo`, `comodoId`, `tarefaId` e `dificuldade`. Envie ao menos um deles. Exemplo simples:

```json
{
  "nomeJogo": "Partida atualizada"
}
```

Exemplo de posição, usando IDs relacionados e já desbloqueados:

```json
{
  "comodoId": "{{ _.comodo_id }}",
  "tarefaId": "{{ _.tarefa_id }}",
  "dificuldade": "facil"
}
```

`comodoId` e `tarefaId` admitem `null`, mas a combinação final precisa ser coerente: tarefa preenchida exige cômodo correspondente. Cômodo e tarefa devem estar ativos e a posição deve respeitar a progressão. A validação considera também os valores já salvos na partida. Não é permitido trocar o personagem nem definir estrelas diretamente.

A listagem retorna array, inclusive `[]`, ordenado por `atualizadoEm` decrescente, com dados do personagem em `perfilJogoId`. A consulta por ID também inclui dados do personagem.

Partida de outra criança ou de personagem arquivado retorna 404. **DELETE remove o documento de `jogos_salvos`; não é exclusão lógica.** Retorna 204 sem corpo e preserva os históricos. Depois da exclusão, consultas por essa partida retornam 404; os registros permanecem nas consultas gerais da criança.

### Registro de tentativa — 1 rota

| Método | Endpoint                    | Objetivo                                                       | Acesso                                  | Principais status            |
| ------ | --------------------------- | -------------------------------------------------------------- | --------------------------------------- | ---------------------------- |
| POST   | `/historico-jogo/responder` | Registrar tentativa, calcular resultado e atualizar a partida. | Criança, com permissão ativa para jogar | 201, 400, 401, 403, 404, 500 |

Body obrigatório:

```json
{
  "perfilJogoId": "{{ _.personagem_id }}",
  "jogoSalvoId": "{{ _.jogo_salvo_id }}",
  "tarefaId": "{{ _.tarefa_id }}",
  "respostaEscolhidaId": "{{ _.resposta_id }}",
  "dificuldade": "facil"
}
```

Todos os cinco campos são obrigatórios. `dificuldade` aceita `facil`, `medio` ou `dificil`. O servidor identifica a criança pelo JWT, confirma permissão, propriedade, relacionamentos, atividade do catálogo e desbloqueio.

A alternativa deve pertencer à tarefa. O cliente não define acerto, número da tentativa nem pontuação. Exemplo de sucesso na primeira tentativa correta no fácil:

```json
{
  "acertou": true,
  "tentativa": 1,
  "pontuacaoGanha": 1,
  "dificuldade": "facil"
}
```

A tentativa é contada por partida, tarefa e dificuldade. Acertos concedem 1, 2 ou 3 estrelas em `facil`, `medio` ou `dificil`; erros concedem zero. A transação registra histórico e atualiza posição, estrelas e data da partida, além da última interação do personagem.

Permissão inativa e tarefa inativa retornam 403. Alternativa inexistente ou de outra tarefa retorna 400. Criança, tarefa, personagem ou partida não acessível retorna 404, conforme a validação alcançada. Bloqueios de progressão retornam 403 com os códigos descritos acima.

### Progresso, histórico e desempenho gerais — 3 rotas

| Método | Endpoint                                 | Objetivo                                              | Acesso            | Principais status            |
| ------ | ---------------------------------------- | ----------------------------------------------------- | ----------------- | ---------------------------- |
| GET    | `/criancas/:criancaId`                   | Consultar progresso geral por tarefa e dificuldade.   | Própria/vinculada | 200, 400, 401, 403, 404, 500 |
| GET    | `/criancas/:criancaId/historico`         | Consultar todas as tentativas da criança.             | Própria/vinculada | 200, 400, 401, 403, 404, 500 |
| GET    | `/criancas/:criancaId/resumo-desempenho` | Consultar indicadores gerais e desempenho por cômodo. | Própria/vinculada | 200, 400, 401, 403, 404, 500 |

Nas três rotas, `:criancaId` representa **`Usuario._id` da criança**. ID inválido retorna 400; perfil infantil inexistente, 404; acesso sem propriedade/vínculo, 403. Não precisam de body.

| Consulta             | Estrutura principal da resposta                   |
| -------------------- | ------------------------------------------------- |
| Histórico geral      | `{ criancaId, totalTentativas, tentativas }`      |
| Histórico da partida | `{ jogoSalvoId, totalTentativas, tentativas }`    |
| Progresso geral      | `{ criancaId, resumo, tarefas }`                  |
| Progresso da partida | `{ jogoSalvoId, estrelasTotal, resumo, tarefas }` |
| Resumo de desempenho | `{ criancaId, resumo, desempenhoPorComodo }`      |

Históricos retornam tentativas sem agrupamento, ordenadas por `dataHora` decrescente. Progresso agrupa por tarefa + dificuldade: cada item contém `tarefaId`, `dificuldade`, `concluida`, `tentativas`, `acertos`, `erros` e `ultimaInteracao`. Ao existir acerto, o grupo fica concluído.

O `resumo` do progresso contém `totalTentativas`, `acertos`, `erros`, `tarefasConcluidas` e `ultimaInteracao`. O resumo de desempenho inclui também `percentualAcertos` e `totalEstrelas`, com `desempenhoPorComodo` no nível superior.

No desempenho, tarefas concluídas são contadas por IDs distintos, sem repetir por dificuldade. Percentuais são arredondados para duas casas. Sem histórico, indicadores ficam zerados, última interação é `null` e arrays ficam vazios. As consultas gerais preservam resultados de partidas excluídas e personagens arquivados.

## Testar no Insomnia

### Configuração

Crie uma coleção de requisições e um ambiente com estas variáveis:

```json
{
  "base_url": "http://localhost:4000",
  "token_crianca": "",
  "token_responsavel": "",
  "usuario_crianca_id": "",
  "perfil_crianca_id": "",
  "personagem_id": "",
  "jogo_salvo_id": "",
  "comodo_id": "",
  "tarefa_id": "",
  "resposta_id": ""
}
```

Os campos vazios devem ser preenchidos com os valores reais retornados. Os exemplos de dados pessoais e senhas deste README são fictícios; utilize um ambiente destinado a testes manuais.

- Monte a URL completa, por exemplo `{{ _.base_url }}/usuarios/meu-perfil`.
- Em operações com body, selecione JSON e envie `Content-Type: application/json`.
- Para rotas protegidas, configure autenticação Bearer Token com `{{ _.token_crianca }}` ou `{{ _.token_responsavel }}`.
- Alternativamente, envie o header `Authorization: Bearer {{ _.token_crianca }}`. Não duplique o prefixo ao utilizar a aba Bearer Token.
- GET e DELETE podem ficar sem body.

### Sequência de uma jornada

1. Cadastre as duas contas com POST `/usuarios`, usando os exemplos de responsável e criança.
2. Faça login de cada uma em POST `/usuarios/auth` e salve cada `token` na variável correspondente. Salve `usuario.id` do login infantil em `usuario_crianca_id`.
3. Com o token do responsável, crie seu perfil em POST `/responsaveis`.
4. Com o token da criança, crie seu perfil em POST `/criancas`. Salve o `_id` retornado em `perfil_crianca_id`.
5. Confira GET `/usuarios/meu-perfil` com cada token e GET `/criancas/meu-perfil` com o token infantil.
6. Com o token do responsável, vincule a criança, consulte `/responsaveis/minhas-criancas` e ative a permissão em `/responsaveis/minhas-criancas/{{ _.perfil_crianca_id }}/permissao`.
7. Com o token da criança, crie personagem e partida. Salve seus `_id` em `personagem_id` e `jogo_salvo_id`.
8. Consulte cômodos, tarefas do cômodo e alternativas da tarefa. Preencha `comodo_id`, `tarefa_id` e `resposta_id` com os IDs relacionados efetivamente retornados.
9. Registre a tentativa em POST `/historico-jogo/responder`, começando por posição disponível e dificuldade `facil`.
10. Consulte a partida e seus resultados:

    ```text
    GET {{ _.base_url }}/jogos-salvos/{{ _.jogo_salvo_id }}
    GET {{ _.base_url }}/jogos-salvos/{{ _.jogo_salvo_id }}/historico
    GET {{ _.base_url }}/jogos-salvos/{{ _.jogo_salvo_id }}/progresso
    GET {{ _.base_url }}/criancas/{{ _.usuario_crianca_id }}
    GET {{ _.base_url }}/criancas/{{ _.usuario_crianca_id }}/historico
    GET {{ _.base_url }}/criancas/{{ _.usuario_crianca_id }}/resumo-desempenho
    ```

As consultas por partida exigem token infantil. As três consultas gerais também aceitam o responsável vinculado. A jornada depende de catálogo previamente cadastrado por manutenção interna; as rotas públicas não permitem criá-lo.

### Casos negativos úteis

| Caso                                                  | Resultado esperado                        |
| ----------------------------------------------------- | ----------------------------------------- |
| Consultar recurso protegido sem JWT                   | 401                                       |
| Usar token de responsável em personagens ou partidas  | 403                                       |
| Repetir cadastro do mesmo e-mail ou perfil            | 409                                       |
| Criar perfil infantil sem body                        | 400                                       |
| Vincular criança com senha incorreta                  | 401                                       |
| Repetir vínculo da criança                            | 409                                       |
| Enviar `"permissaoAtiva": "true"`                     | 400                                       |
| Alterar permissão de criança não vinculada            | 404                                       |
| Consultar personagem ou partida de outra criança      | 404                                       |
| Registrar resposta com permissão inativa              | 403                                       |
| Informar ID malformado em consulta por ID do catálogo | 400                                       |
| Consultar ID válido inexistente do catálogo           | 404                                       |
| Consultar tarefa existente sem alternativas           | 200 com `[]`                              |
| Enviar JSON malformado                                | 400 com `mensagem: "JSON inválido"`       |
| GET `/tarefas/%ZZ`                                    | 400 com `mensagem: "URL inválida"`        |
| GET `/rota-inexistente`                               | 404 com `mensagem: "Rota não encontrada"` |

## Rotas desabilitadas e limites atuais

### Declarações comentadas

As seguintes **22 declarações estão comentadas nos Routers** e não disponibilizam as operações descritas:

| Recurso             | Declarações desabilitadas                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Usuários — 5        | GET `/usuarios`; GET, PUT, PATCH e DELETE `/usuarios/:id`                                                                         |
| Perfil infantil — 5 | GET `/criancas`; GET `/criancas/usuario/:usuarioId`; GET, PUT e PATCH `/criancas/:id` como operações cadastrais                   |
| Responsáveis — 4    | GET `/responsaveis`; GET `/responsaveis/usuario/:usuarioId`; GET `/responsaveis/:responsavelId/criancas`; GET `/responsaveis/:id` |
| Tarefas — 4         | POST `/tarefas`; PUT, PATCH e DELETE `/tarefas/:id`                                                                               |
| Alternativas — 4    | POST `/respostas`; PUT, PATCH e DELETE `/respostas/:respostaId`                                                                   |

**Exceção de interpretação:** a declaração de GET `/criancas/:id` para buscar perfil está comentada, mas o mesmo formato de caminho está ativo em GET `/criancas/:criancaId` para consultar **progresso**. Não utilize essa rota como consulta cadastral.

Cômodos possuem somente rotas de leitura declaradas. Funções de manutenção existentes em Controllers/Services não tornam a escrita acessível por HTTP. Não há rota administrativa pública ativa para o catálogo.

### Limitações relevantes

- Não há endpoints de refresh token, logout com invalidação de JWT ou recuperação de senha.
- Não há paginação ou filtros de consulta por query; não presuma que `?ativo=true` ou `?dificuldade=facil` alterem os resultados.
- A progressão é verificada por partida: tarefas anteriores precisam de acerto na dificuldade; médio depende da conclusão do fácil, difícil depende do médio; cômodos anteriores são verificados nas três dificuldades fixas.
- Os helpers de progressão consideram todas as tarefas ativas do cômodo. Não filtram essa conclusão pelo campo `Tarefa.dificuldade` nem usam `Comodo.dificuldadesDisponiveis` para substituir a sequência fixa.
- Não há sincronização automática das estrelas da partida com `PerfilJogo.estrelasTotal`. O resumo geral soma pontos do histórico; não soma estrelas do personagem.
- `nivelAtual` existe no personagem, mas não há evolução automática de níveis implementada.
- `limiteTempoDiario` e `tempoUsadoHoje` existem no perfil infantil, mas não representam controle efetivo de tempo nas operações atuais. O registro da tentativa preenche `tempoGastoSegundos` com zero.
- Não há upload, hospedagem ou geração de áudio pela API. A mídia armazenada é apenas uma referência.
- Não há limite implementado de uma única partida por personagem.
- A retomada usa GET da partida e os campos de posição persistidos; não existe endpoint específico de retomada.

## Testes e qualidade

Os procedimentos, flags, isolamento e relatórios de testes estão em [tests/README.md](tests/README.md). A regressão funcional das quatro fases da issue #94 está registrada em [tests/issue94-relatorio-final.md](tests/issue94-relatorio-final.md).

O comando `npm test` usa o runner nativo do Node.js. Integrações reais exigem autorização por flags e **somente `MONGO_TEST_URI` com banco `conectamente_testes`**, sem fallback para `MONGO_URI`. Execute-as sequencialmente e siga as regras de limpeza por fixtures do README de testes. Resultados ignorados não equivalem a aprovações.

Para verificar formatação:

```bash
git diff --check
npm run format:check
```

A configuração atual do Prettier ignora `tests/`; essa verificação não certifica a formatação dos arquivos dessa pasta.
