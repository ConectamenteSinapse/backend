# ConectaMente - Backend

API backend do projeto ConectaMente, desenvolvida com Node.js e Express.

## Status atual

Projeto em desenvolvimento para estudo e reconstrução da API do ConectaMente.

Nesta etapa, a API possui um CRUD inicial de usuários utilizando um array temporário em memória.

## Tecnologias utilizadas

- Node.js
- Express
- JavaScript
- Nodemon
- Insomnia para testes

## Como executar o projeto

Instale as dependências:

```bash
npm install
```

Execute o servidor:

```bash
npm start
```

A API será iniciada por padrão em:

```text
http://localhost:3000
```

A porta também pode ser definida por variável de ambiente:

```text
PORT=3000
```

## Estrutura atual

```text
backend/
├── controllers/
│   └── usuarioController.js
├── routes/
│   └── usuarioRoutes.js
├── services/
│   └── usuarioService.js
├── index.js
├── package.json
└── README.md
```

## Endpoints atuais

### Rota principal

```http
GET /
```

Retorna uma mensagem simples indicando que a API foi iniciada.

---

## Usuários

### Listar todos os usuários

```http
GET /usuarios
```

Retorna todos os usuários cadastrados no array temporário.

---

### Buscar usuário por ID

```http
GET /usuarios/:id
```

Busca um usuário específico pelo ID.

Exemplo:

```http
GET /usuarios/1
```

Possíveis respostas:

```text
200 OK
```

```text
404 Not Found
```

---

### Cadastrar novo usuário

```http
POST /usuarios
```

Cadastra um novo usuário.

Exemplo de body:

```json
{
  "nome": "Pedro Silva",
  "email": "pedro@email.com",
  "senha": "123456",
  "perfil": "responsavel"
}
```

Possíveis respostas:

```text
201 Created
```

```text
400 Bad Request
```

---

### Atualizar completamente um usuário

```http
PUT /usuarios/:id
```

Atualiza todos os dados de um usuário existente.

Exemplo:

```http
PUT /usuarios/1
```

Exemplo de body:

```json
{
  "nome": "Ana Souza Atualizada",
  "email": "ana.atualizada@email.com",
  "senha": "novaSenha123",
  "perfil": "responsavel"
}
```

Possíveis respostas:

```text
200 OK
```

```text
400 Bad Request
```

```text
404 Not Found
```

---

### Atualizar parcialmente um usuário

```http
PATCH /usuarios/:id
```

Atualiza somente os campos enviados no body da requisição.

Exemplo:

```http
PATCH /usuarios/1
```

Exemplo de body:

```json
{
  "nome": "Ana PATCH"
}
```

Também pode receber mais de um campo:

```json
{
  "email": "novo@email.com",
  "perfil": "crianca"
}
```

Possíveis respostas:

```text
200 OK
```

```text
404 Not Found
```

---

### Excluir usuário

```http
DELETE /usuarios/:id
```

Remove um usuário pelo ID.

Exemplo:

```http
DELETE /usuarios/1
```

Possíveis respostas:

```text
204 No Content
```

```text
404 Not Found
```

## Observações

Os dados ainda são temporários e ficam armazenados em um array em memória.

Ao reiniciar o servidor, os dados criados, alterados ou excluídos durante os testes voltam ao estado inicial.

A integração com MongoDB, Mongoose, autenticação, senha com hash e JWT serão adicionadas em etapas futuras.

## Organização atual da API

```text
index.js
→ inicia a aplicação, configura o Express e registra as rotas principais

routes/
→ define os endpoints e chama os controllers

controllers/
→ recebe a requisição, chama o service e envia a resposta

services/
→ executa a lógica de manipulação dos dados
```

## Próximas etapas previstas

- Revisar estrutura inicial do backend
- Criar models com Mongoose
- Conectar a API ao MongoDB
- Substituir o array temporário por dados persistentes
- Melhorar validações
- Implementar autenticação
- Aplicar senha com hash
- Utilizar JWT para login e proteção de rotas
- Atualizar a documentação conforme o projeto evoluir