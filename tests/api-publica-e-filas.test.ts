import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EASTER_EGG } from "../src/easterEgg.js";
import { construirApp } from "../src/http/app.js";
import { prisma } from "../src/infra/prisma.js";
import { WorkerRelatorios } from "../src/queue/WorkerRelatorios.js";

describe("API Pública, Segurança, Rate Limit, Swagger e Filas BullMQ", () => {
  let app: FastifyInstance;
  let worker: WorkerRelatorios;
  let jwtAdmin = "";
  let chaveRateLimitTeste = "";
  let idChaveRateLimitTeste = "";
  const lotesParaLimpar: string[] = [];
  const tarefasParaLimpar: string[] = [];
  const resultadosParaLimpar: string[] = [];

  const CHAVE_FULL = "gc_live_parceiro_full_2026";
  const CHAVE_READONLY = "gc_live_parceiro_readonly_2026";

  beforeAll(async () => {
    app = await construirApp({ prisma });
    worker = new WorkerRelatorios(prisma);
    await app.ready();
  });

  afterAll(async () => {
    if (lotesParaLimpar.length > 0) {
      await prisma.lote.deleteMany({ where: { id: { in: lotesParaLimpar } } });
    }
    if (tarefasParaLimpar.length > 0) {
      await prisma.tarefaRelatorio.deleteMany({ where: { id: { in: tarefasParaLimpar } } });
    }
    if (resultadosParaLimpar.length > 0) {
      await prisma.resultadoAnalitico.deleteMany({
        where: { id: { in: resultadosParaLimpar } }
      });
    }
    if (idChaveRateLimitTeste) {
      await prisma.apiKey.deleteMany({ where: { id: idChaveRateLimitTeste } });
    }

    await worker.fechar();
    await app.close();
    await prisma.$disconnect();
  });

  it("expõe healthcheck, headers obrigatórios e documentação OpenAPI em /docs e /docs/json", async () => {
    const resHealth = await app.inject({ method: "GET", url: "/health" });
    expect(resHealth.statusCode).toBe(200);
    expect(resHealth.headers["x-api-version"]).toBe("1.0.0");
    expect(resHealth.headers["x-easter-egg"]).toBe(EASTER_EGG);
    expect(resHealth.json()).toMatchObject({
      status: "ok",
      database: "up",
      redis: "up"
    });

    const resDocsUi = await app.inject({ method: "GET", url: "/docs/" });
    expect(resDocsUi.statusCode).toBe(200);

    const resDocsJson = await app.inject({ method: "GET", url: "/docs/json" });
    expect(resDocsJson.statusCode).toBe(200);
    const spec = resDocsJson.json();
    expect(spec.openapi).toBeDefined();
    expect(spec.components.securitySchemes).toHaveProperty("bearerAuth");
    expect(spec.components.securitySchemes).toHaveProperty("apiKeyAuth");
  });

  it("autentica via JWT no escopo interno e gerencia API Keys", async () => {
    const resLogin = await app.inject({
      method: "POST",
      url: "/api/v1/internal/auth/login",
      payload: { usuario: "admin", senha: "admin123" }
    });
    expect(resLogin.statusCode).toBe(200);
    jwtAdmin = resLogin.json().token;
    expect(jwtAdmin).toBeTruthy();

    const resCriarKey = await app.inject({
      method: "POST",
      url: "/api/v1/internal/api-keys",
      headers: { authorization: `Bearer ${jwtAdmin}` },
      payload: {
        nomeParceiro: "Parceiro Teste RateLimit",
        organizacaoId: "org-techcorp-001",
        permissoes: ["READ_TRACKING"],
        limitePorMinuto: 3
      }
    });
    expect(resCriarKey.statusCode).toBe(201);
    const bodyKey = resCriarKey.json();
    chaveRateLimitTeste = bodyKey.chave;
    idChaveRateLimitTeste = bodyKey.id;
    expect(chaveRateLimitTeste.startsWith("gc_live_")).toBe(true);

    const resListar = await app.inject({
      method: "GET",
      url: "/api/v1/internal/api-keys",
      headers: { authorization: `Bearer ${jwtAdmin}` }
    });
    expect(resListar.statusCode).toBe(200);
    expect(Array.isArray(resListar.json())).toBe(true);
  });

  it("rejeita atualização com versão obsoleta retornando 409 Conflict", async () => {
    const equip = await prisma.equipamento.findUniqueOrThrow({
      where: { codigoBarrasInterno: "GC-NB-2025-001" }
    });

    const resConflito = await app.inject({
      method: "PATCH",
      url: `/api/v1/internal/equipamentos/${equip.id}/status`,
      headers: { authorization: `Bearer ${jwtAdmin}` },
      payload: {
        statusRastreamento: "PECAS_REAPROVEITADAS",
        versao: equip.versao + 99
      }
    });
    expect(resConflito.statusCode).toBe(409);
  });

  it("controla autenticação X-API-Key, escopos (401/403) e submissão transacional na API pública", async () => {
    const semChave = await app.inject({
      method: "GET",
      url: "/api/v1/public/rastreabilidade/GC-NB-2025-001"
    });
    expect(semChave.statusCode).toBe(401);

    const comChaveValida = await app.inject({
      method: "GET",
      url: "/api/v1/public/rastreabilidade/GC-NB-2025-001",
      headers: { "x-api-key": CHAVE_FULL }
    });
    expect(comChaveValida.statusCode).toBe(200);
    expect(comChaveValida.json().codigoBarrasInterno).toBe("GC-NB-2025-001");
    expect(comChaveValida.json().lote.organizacao.cnpj).toBe("11222333000181");

    const semPermissao = await app.inject({
      method: "POST",
      url: "/api/v1/public/lotes",
      headers: { "x-api-key": CHAVE_READONLY },
      payload: {
        notaFiscal: "NF-NEGADA-01",
        transportadora: "TransTeste"
      }
    });
    expect(semPermissao.statusCode).toBe(403);

    const loteCriado = await app.inject({
      method: "POST",
      url: "/api/v1/public/lotes",
      headers: { "x-api-key": CHAVE_FULL },
      payload: {
        notaFiscal: `NF-E2E-${Date.now()}`,
        transportadora: "EcoFrete Integrado",
        equipamentos: [
          {
            codigoBarrasInterno: `GC-E2E-${Date.now()}`,
            tipo: "NOTEBOOK",
            marca: "Dell",
            modelo: "Latitude 5440",
            anoFabricacao: 2024,
            estadoFisico: "BOM_ESTADO",
            pesoQuilogramas: 1.5,
            valorEstimadoRecuperacao: 2400
          }
        ]
      }
    });
    expect(loteCriado.statusCode).toBe(201);
    lotesParaLimpar.push(loteCriado.json().id);
  });

  it("aplica rate limiting por chave retornando 429 Too Many Requests", async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await app.inject({
        method: "GET",
        url: "/api/v1/public/rastreabilidade/GC-NB-2025-001",
        headers: { "x-api-key": chaveRateLimitTeste }
      });
      expect(ok.statusCode).toBe(200);
    }

    const bloqueada = await app.inject({
      method: "GET",
      url: "/api/v1/public/rastreabilidade/GC-NB-2025-001",
      headers: { "x-api-key": chaveRateLimitTeste }
    });
    expect(bloqueada.statusCode).toBe(429);
  });

  it("revoga API Key impedindo uso posterior com 401", async () => {
    const revogar = await app.inject({
      method: "DELETE",
      url: `/api/v1/internal/api-keys/${idChaveRateLimitTeste}`,
      headers: { authorization: `Bearer ${jwtAdmin}` }
    });
    expect(revogar.statusCode).toBe(200);
    expect(revogar.json().ativa).toBe(false);

    const aposRevogar = await app.inject({
      method: "GET",
      url: "/api/v1/public/rastreabilidade/GC-NB-2025-001",
      headers: { "x-api-key": chaveRateLimitTeste }
    });
    expect(aposRevogar.statusCode).toBe(401);
  });

  it("executa fluxo completo assíncrono via BullMQ para formatos CSV e JSON", async () => {
    for (const formato of ["CSV", "JSON"] as const) {
      const solicitar = await app.inject({
        method: "POST",
        url: "/api/v1/public/relatorios/assincrono",
        headers: { "x-api-key": CHAVE_FULL },
        payload: {
          tipoAnalise: "VIDA_UTIL_PREDITIVA",
          formato
        }
      });

      expect(solicitar.statusCode).toBe(202);
      const { jobId, statusUrl, downloadUrl } = solicitar.json();
      expect(jobId).toBeTruthy();
      tarefasParaLimpar.push(jobId);

      let statusFinal = "PENDENTE";
      let resultadoId: string | null = null;

      for (let tentativa = 0; tentativa < 30; tentativa++) {
        const consulta = await app.inject({
          method: "GET",
          url: statusUrl,
          headers: { "x-api-key": CHAVE_FULL }
        });
        expect(consulta.statusCode).toBe(200);
        statusFinal = consulta.json().status;
        resultadoId = consulta.json().resultadoAnaliticoId;

        if (statusFinal === "CONCLUIDO" || statusFinal === "FALHOU") {
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      expect(statusFinal).toBe("CONCLUIDO");
      if (resultadoId) {
        resultadosParaLimpar.push(resultadoId);
      }

      const download = await app.inject({
        method: "GET",
        url: downloadUrl,
        headers: { "x-api-key": CHAVE_FULL }
      });
      expect(download.statusCode).toBe(200);

      if (formato === "CSV") {
        expect(download.headers["content-type"]).toContain("text/csv");
        expect(download.body).toContain("tipoEquipamento,coeficienteAngular");
      } else {
        expect(download.headers["content-type"]).toContain("application/json");
        const parsed = JSON.parse(download.body);
        expect(Array.isArray(parsed.previsoes)).toBe(true);
      }
    }
  });
});
