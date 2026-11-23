import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Prisma, PrismaClient } from "@prisma/client";
import Fastify, { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { ErroDominio } from "../domain/erros/ErroDominio.js";
import { EASTER_EGG } from "../easterEgg.js";
import { prisma as prismaPadrao } from "../infra/prisma.js";
import { FilaRelatorios } from "../queue/FilaRelatorios.js";
import { verificarConexaoRedis } from "../queue/redisConfig.js";
import { registrarRotasInternas } from "./routes/rotasInternas.js";
import { registrarRotasPublicas } from "./routes/rotasPublicas.js";

export interface OpcoesApp {
  prisma?: PrismaClient;
  filaRelatorios?: FilaRelatorios;
}

export async function construirApp(opcoes: OpcoesApp = {}): Promise<FastifyInstance> {
  const prisma = opcoes.prisma ?? prismaPadrao;
  const filaPropria = !opcoes.filaRelatorios;
  const filaRelatorios = opcoes.filaRelatorios ?? new FilaRelatorios();

  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        strict: false
      }
    }
  });

  await app.register(cors, { origin: true });

  await app.register(jwt, {
    secret: env.JWT_SECRET
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "greencode API - Plataforma de Logística Reversa",
        description:
          "API segregada interna/pública com camada analítica, rate limiting e geração assíncrona de relatórios via BullMQ.",
        version: env.API_VERSION
      },
      tags: [
        { name: "Autenticação", description: "Autenticação interna via JWT" },
        { name: "Interno - Domínio", description: "Gestão transacional de organizações, lotes e equipamentos" },
        { name: "Interno - API Keys", description: "Emissão e revogação de chaves de parceiros" },
        { name: "Interno - Análises", description: "Execução e histórico de análises estatísticas e preditivas" },
        { name: "Público v1 - Parceiros", description: "Endpoints de integração externa autenticados por X-API-Key" },
        { name: "Público v1 - Relatórios Assíncronos", description: "Fila assíncrona, polling e download de relatórios" }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          },
          apiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key"
          }
        }
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-API-Version", env.API_VERSION);
    reply.header("X-Easter-Egg", EASTER_EGG);
    return payload;
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ErroDominio) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        codigo: error.codigo,
        erro: error.name,
        mensagem: error.message
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.code(409).send({
        statusCode: 409,
        codigo: "CONFLITO_UNICIDADE",
        erro: "Conflict",
        mensagem: "Registro duplicado violando restrição de unicidade"
      });
    }

    const erroFastify = error as { statusCode?: number; code?: string; name?: string; message?: string };
    const status = erroFastify.statusCode ?? 500;
    return reply.code(status).send({
      statusCode: status,
      codigo: erroFastify.code ?? (status === 400 ? "VALIDACAO_REQUISICAO" : "ERRO_INTERNO"),
      erro: erroFastify.name ?? "Error",
      mensagem: erroFastify.message ?? "Erro interno inesperado"
    });
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["Autenticação"],
        summary: "Verifica saúde da API, PostgreSQL e Redis"
      }
    },
    async (_request, reply) => {
      let database = "down";
      let redis = "down";

      try {
        await prisma.$queryRaw`SELECT 1`;
        database = "up";
      } catch {
        database = "down";
      }

      try {
        const ok = await verificarConexaoRedis();
        redis = ok ? "up" : "down";
      } catch {
        redis = "down";
      }

      const saudavel = database === "up" && redis === "up";
      return reply.code(saudavel ? 200 : 503).send({
        status: saudavel ? "ok" : "degraded",
        database,
        redis,
        version: env.API_VERSION
      });
    }
  );

  await app.register(registrarRotasInternas, {
    prefix: "/api/v1/internal",
    prisma
  });

  await app.register(registrarRotasPublicas, {
    prefix: "/api/v1/public",
    prisma,
    filaRelatorios
  });

  app.addHook("onClose", async () => {
    if (filaPropria) {
      await filaRelatorios.fechar();
    }
  });

  return app;
}
