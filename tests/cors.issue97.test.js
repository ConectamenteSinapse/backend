import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { registerHooks } from "node:module";
import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const origemAutorizada = "http://localhost:3000";
const outraOrigem = "http://localhost:3001";
const segredo = "segredo-ficticio-exclusivo-issue97";
const caminhoProtegido = "/perfis-jogo/id-invalido";
const lista = (resposta, cabecalho) =>
  (resposta.headers.get(cabecalho) ?? "")
    .split(",")
    .map((valor) => valor.trim().toLowerCase());

// Executa index.js, cors, routers, controllers, services e middlewares reais.
// Isola somente dotenv, conexão do bootstrap e porta. A rota com ID inválido
// permite provar passagem pelo perfil criança sem depender de persistência.
// Os bloqueios Mongoose fazem qualquer acesso acidental ao banco reprovar.
for (const frontend of [origemAutorizada, undefined]) {
  test(
    `#97 CORS com FRONTEND_URL ${frontend ?? "ausente"}`,
    { concurrency: false },
    async (t) => {
      const anteriores = {
        FRONTEND_URL: process.env.FRONTEND_URL,
        JWT_SECRET: process.env.JWT_SECRET,
      };
      t.after(() => {
        for (const [chave, valor] of Object.entries(anteriores)) {
          if (valor === undefined) delete process.env[chave];
          else process.env[chave] = valor;
        }
      });
      if (frontend === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = frontend;
      process.env.JWT_SECRET = segredo;
      t.mock.method(dotenv, "config", () => ({ parsed: {} }));
      t.mock.method(console, "log", () => {});
      const bloqueios = [
        t.mock.method(mongoose, "connect", () => {
          throw new Error("MongoDB não autorizado no teste CORS");
        }),
        t.mock.method(mongoose, "createConnection", () => {
          throw new Error("MongoDB não autorizado no teste CORS");
        }),
        t.mock.method(mongoose.Query.prototype, "exec", () => {
          throw new Error("Query não autorizada no teste CORS");
        }),
      ];
      t.after(() => {
        for (const bloqueio of bloqueios)
          assert.equal(bloqueio.mock.callCount(), 0);
      });
      const hooks = registerHooks({
        load(url, context, next) {
          if (
            url === new URL("../config/db-connection.js", import.meta.url).href
          ) {
            return {
              format: "module",
              shortCircuit: true,
              source: "export default () => {};",
            };
          }
          return next(url, context);
        },
      });
      let server;
      t.after(async () => {
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve, reject) =>
            server.close((erro) => (erro ? reject(erro) : resolve())),
          );
        }
      });
      const listen = express.application.listen;
      t.mock.method(express.application, "listen", function () {
        server = listen.call(this, 0, "127.0.0.1");
        return server;
      });
      try {
        // Duas instâncias independentes avaliam a configuração no bootstrap.
        await import(
          `../index.js?issue97=${frontend === undefined ? "ausente" : "configurada"}`
        );
      } finally {
        hooks.deregister();
      }
      assert.ok(server, "index.js iniciou o servidor isolado");
      if (!server.listening) await once(server, "listening");
      const base = `http://127.0.0.1:${server.address().port}`;
      function conferirOrigem(resposta) {
        assert.equal(
          resposta.headers.get("access-control-allow-origin"),
          frontend ?? null,
        );
        assert.notEqual(
          resposta.headers.get("access-control-allow-origin"),
          "*",
        );
      }

      for (const origem of [origemAutorizada, outraOrigem, undefined]) {
        await t.test(
          `GET / com Origin ${origem ?? "ausente"}: endpoint preservado`,
          async () => {
            const resposta = await fetch(base, {
              headers: origem ? { Origin: origem } : {},
            });
            assert.equal(resposta.status, 200);
            assert.equal(await resposta.text(), "Api iniciado com Sucesso");
            conferirOrigem(resposta);
            if (origem === outraOrigem) {
              // Origin fixa pode ser enviada, mas nunca autoriza a origem diferente.
              assert.notEqual(
                resposta.headers.get("access-control-allow-origin"),
                outraOrigem,
              );
            }
          },
        );
      }

      for (const [metodo, caminho] of [
        ["GET", caminhoProtegido],
        ["POST", "/perfis-jogo"],
        ["PATCH", caminhoProtegido],
        ["DELETE", caminhoProtegido],
      ]) {
        await t.test(
          `preflight ${metodo}: Authorization e Content-Type`,
          async () => {
            const resposta = await fetch(base + caminho, {
              method: "OPTIONS",
              headers: {
                Origin: origemAutorizada,
                "Access-Control-Request-Method": metodo,
                "Access-Control-Request-Headers": "Authorization, Content-Type",
              },
            });
            conferirOrigem(resposta);
            if (frontend) {
              assert.equal(resposta.status, 204);
              assert.ok(
                lista(resposta, "access-control-allow-methods").includes(
                  metodo.toLowerCase(),
                ),
              );
              assert.deepEqual(
                lista(resposta, "access-control-allow-headers"),
                ["authorization", "content-type"],
              );
              assert.ok(
                lista(resposta, "vary").includes(
                  "access-control-request-headers",
                ),
              );
              assert.equal(resposta.headers.get("content-length"), "0");
              assert.equal(await resposta.text(), "");
            } else {
              // Sem CORS, OPTIONS chega ao router protegido, que continua exigindo JWT.
              assert.equal(resposta.status, 401);
              assert.equal(
                resposta.headers.get("access-control-allow-methods"),
                null,
              );
              assert.equal(
                resposta.headers.get("access-control-allow-headers"),
                null,
              );
              assert.deepEqual(await resposta.json(), {
                erro: true,
                mensagem: "Token nao informado",
              });
            }
          },
        );
      }

      await t.test(
        "preflight de origem diferente não autoriza sua leitura",
        async () => {
          const resposta = await fetch(base + caminhoProtegido, {
            method: "OPTIONS",
            headers: {
              Origin: outraOrigem,
              "Access-Control-Request-Method": "PATCH",
              "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
          });
          conferirOrigem(resposta);
          assert.notEqual(
            resposta.headers.get("access-control-allow-origin"),
            outraOrigem,
          );
          assert.equal(resposta.status, frontend ? 204 : 401);
          await resposta.text();
        },
      );

      for (const origem of [origemAutorizada, outraOrigem, undefined]) {
        for (const [nome, authorization, status, mensagem] of [
          ["sem JWT", undefined, 401, "Token nao informado"],
          [
            "JWT inválido",
            "Bearer invalido",
            401,
            "Token invalido ou expirado",
          ],
          [
            "perfil responsável",
            `Bearer ${jwt.sign({ id: "111111111111111111111111", perfil: "responsavel" }, segredo, { expiresIn: "5m" })}`,
            403,
            "Acesso negado para esse perfil",
          ],
          [
            "perfil criança chega à validação do Service",
            `Bearer ${jwt.sign({ id: "111111111111111111111111", perfil: "crianca" }, segredo, { expiresIn: "5m" })}`,
            400,
            "Dados inválidos",
          ],
        ]) {
          await t.test(`${nome}, Origin ${origem ?? "ausente"}`, async () => {
            const headers = {};
            if (origem) headers.Origin = origem;
            if (authorization) headers.Authorization = authorization;
            const resposta = await fetch(base + caminhoProtegido, { headers });
            assert.equal(resposta.status, status);
            assert.deepEqual(await resposta.json(), { erro: true, mensagem });
            conferirOrigem(resposta);
          });
        }
      }
    },
  );
}
