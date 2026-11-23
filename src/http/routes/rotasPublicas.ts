import { readFile } from "node:fs/promises";
import path from "node:path";
import rateLimit from "@fastify/rate-limit";
import {
  EstadoFisico,
  FormatoExportacao,
  PrismaClient,
  StatusTarefa,
  TipoAnalise,
  TipoEquipamento
} from "@prisma/client";
import { FastifyInstance } from "fastify";
import { AnalisadorEficienciaOperacional } from "../../analytics/AnalisadorEficienciaOperacional.js";
import { AnalisadorRentabilidadeEquipamento } from "../../analytics/AnalisadorRentabilidadeEquipamento.js";
import { AnalisadorVidaUtilPreditivo } from "../../analytics/AnalisadorVidaUtilPreditivo.js";
import { ErroNaoEncontrado, ErroValidacao } from "../../domain/erros/ErroDominio.js";
import { FilaRelatorios } from "../../queue/FilaRelatorios.js";
import { ServicoApiKey } from "../../services/ServicoApiKey.js";
import { ServicoEquipamento } from "../../services/ServicoEquipamento.js";
import { ServicoLote } from "../../services/ServicoLote.js";
import { criarAutenticacaoApiKey, exigirPermissao } from "../plugins/autenticacao.js";
import { respostasErroPadrao } from "../schemas/comuns.js";

export interface OpcoesRotasPublicas {
  prisma: PrismaClient;
  filaRelatorios: FilaRelatorios;
}

export async function registrarRotasPublicas(
  app: FastifyInstance,
  opcoes: OpcoesRotasPublicas
): Promise<void> {
  const { prisma, filaRelatorios } = opcoes;
  const servicoApiKey = new ServicoApiKey(prisma);
  const servicoEquip = new ServicoEquipamento(prisma);
  const servicoLote = new ServicoLote(prisma);
  const analisadorEficiencia = new AnalisadorEficienciaOperacional(prisma);
  const analisadorRentabilidade = new AnalisadorRentabilidadeEquipamento(prisma);
  const analisadorVidaUtil = new AnalisadorVidaUtilPreditivo(prisma);

  app.addHook("onRequest", criarAutenticacaoApiKey(servicoApiKey));

  await app.register(rateLimit, {
    global: true,
    hook: "preHandler",
    timeWindow: "1 minute",
    max: (request) => request.apiKeyContext?.limitePorMinuto ?? 60,
    keyGenerator: (request) => request.apiKeyContext?.id ?? request.ip,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      codigo: "RATE_LIMIT_EXCEDIDO",
      erro: "Too Many Requests",
      mensagem: `Limite de ${context.max} requisições por minuto excedido`
    })
  });

  app.get<{ Params: { codigoBarras: string } }>(
    "/rastreabilidade/:codigoBarras",
    {
      preHandler: exigirPermissao("READ_TRACKING"),
      schema: {
        tags: ["Público v1 - Parceiros"],
        summary: "Consulta rastreabilidade completa de equipamento por código de barras",
        security: [{ apiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["codigoBarras"],
          properties: {
            codigoBarras: { type: "string", example: "GC-NB-2025-001" }
          }
        },
        response: {
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          404: respostasErroPadrao[404],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request) => servicoEquip.rastrearPorCodigoBarras(request.params.codigoBarras)
  );

  app.post<{
    Body: {
      dataEntrada?: string;
      notaFiscal: string;
      transportadora: string;
      observacoes?: string;
      equipamentos?: Array<{
        codigoBarrasInterno: string;
        tipo: TipoEquipamento;
        marca: string;
        modelo: string;
        anoFabricacao: number;
        estadoFisico: EstadoFisico;
        pesoQuilogramas: number;
        valorEstimadoRecuperacao: number;
      }>;
    };
  }>(
    "/lotes",
    {
      preHandler: exigirPermissao("WRITE_LOTES"),
      schema: {
        tags: ["Público v1 - Parceiros"],
        summary: "Submete novo lote vinculado à organização da API Key",
        security: [{ apiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["notaFiscal", "transportadora"],
          properties: {
            dataEntrada: { type: "string", format: "date-time" },
            notaFiscal: { type: "string", example: "NF-PARCEIRO-2026-01" },
            transportadora: { type: "string", example: "EcoFrete Express" },
            observacoes: { type: "string" },
            equipamentos: {
              type: "array",
              items: {
                type: "object",
                required: [
                  "codigoBarrasInterno",
                  "tipo",
                  "marca",
                  "modelo",
                  "anoFabricacao",
                  "estadoFisico",
                  "pesoQuilogramas",
                  "valorEstimadoRecuperacao"
                ],
                properties: {
                  codigoBarrasInterno: { type: "string" },
                  tipo: { type: "string", enum: Object.values(TipoEquipamento) },
                  marca: { type: "string" },
                  modelo: { type: "string" },
                  anoFabricacao: { type: "integer" },
                  estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
                  pesoQuilogramas: { type: "number" },
                  valorEstimadoRecuperacao: { type: "number" }
                }
              }
            }
          }
        },
        response: {
          400: respostasErroPadrao[400],
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request, reply) => {
      const lote = await servicoLote.criar({
        ...request.body,
        organizacaoId: request.apiKeyContext!.organizacaoId,
        operadorTriagem: request.apiKeyContext!.nomeParceiro
      });
      return reply.code(201).send(lote);
    }
  );

  app.get(
    "/analytics/eficiencia",
    {
      preHandler: exigirPermissao("READ_ANALYTICS"),
      schema: {
        tags: ["Público v1 - Parceiros"],
        summary: "Obtém análise de eficiência operacional para parceiros",
        security: [{ apiKeyAuth: [] }],
        response: {
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request) =>
      analisadorEficiencia.executar({
        organizacaoId: request.apiKeyContext?.organizacaoId,
        origemExecucao: "API"
      })
  );

  app.get(
    "/analytics/rentabilidade",
    {
      preHandler: exigirPermissao("READ_ANALYTICS"),
      schema: {
        tags: ["Público v1 - Parceiros"],
        summary: "Obtém análise de rentabilidade por equipamento para parceiros",
        security: [{ apiKeyAuth: [] }],
        response: {
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request) =>
      analisadorRentabilidade.executar({
        organizacaoId: request.apiKeyContext?.organizacaoId,
        origemExecucao: "API"
      })
  );

  app.get(
    "/analytics/vida-util",
    {
      preHandler: exigirPermissao("READ_ANALYTICS"),
      schema: {
        tags: ["Público v1 - Parceiros"],
        summary: "Obtém previsão de vida útil por regressão linear OLS",
        security: [{ apiKeyAuth: [] }],
        response: {
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request) =>
      analisadorVidaUtil.executar({
        organizacaoId: request.apiKeyContext?.organizacaoId,
        origemExecucao: "API"
      })
  );

  app.post<{
    Body: {
      tipoAnalise: TipoAnalise;
      formato?: FormatoExportacao;
      filtrarOrganizacao?: boolean;
      webhookUrl?: string;
    };
  }>(
    "/relatorios/assincrono",
    {
      preHandler: exigirPermissao("READ_ANALYTICS"),
      schema: {
        tags: ["Público v1 - Relatórios Assíncronos"],
        summary: "Solicita geração assíncrona de relatório analítico via BullMQ",
        security: [{ apiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["tipoAnalise"],
          properties: {
            tipoAnalise: {
              type: "string",
              enum: Object.values(TipoAnalise),
              example: "VIDA_UTIL_PREDITIVA"
            },
            formato: {
              type: "string",
              enum: Object.values(FormatoExportacao),
              default: "JSON",
              example: "CSV"
            },
            filtrarOrganizacao: { type: "boolean", default: false },
            webhookUrl: { type: "string", format: "uri" }
          }
        },
        response: {
          202: {
            type: "object",
            properties: {
              jobId: { type: "string" },
              status: { type: "string" },
              statusUrl: { type: "string" },
              downloadUrl: { type: "string" }
            }
          },
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request, reply) => {
      const formato = request.body.formato ?? FormatoExportacao.JSON;
      const organizacaoId = request.body.filtrarOrganizacao
        ? request.apiKeyContext?.organizacaoId
        : undefined;

      const tarefa = await prisma.tarefaRelatorio.create({
        data: {
          apiKeyId: request.apiKeyContext?.id,
          organizacaoId,
          tipoAnalise: request.body.tipoAnalise,
          formato,
          status: StatusTarefa.PENDENTE,
          webhookUrl: request.body.webhookUrl
        }
      });

      const bullJobId = await filaRelatorios.enfileirar({
        tarefaId: tarefa.id,
        tipoAnalise: request.body.tipoAnalise,
        formato,
        organizacaoId,
        webhookUrl: request.body.webhookUrl
      });

      await prisma.tarefaRelatorio.update({
        where: { id: tarefa.id },
        data: { bullJobId }
      });

      return reply.code(202).send({
        jobId: tarefa.id,
        status: tarefa.status,
        statusUrl: `/api/v1/public/relatorios/jobs/${tarefa.id}`,
        downloadUrl: `/api/v1/public/relatorios/jobs/${tarefa.id}/download`
      });
    }
  );

  app.get<{ Params: { jobId: string } }>(
    "/relatorios/jobs/:jobId",
    {
      preHandler: exigirPermissao("READ_ANALYTICS"),
      schema: {
        tags: ["Público v1 - Relatórios Assíncronos"],
        summary: "Consulta status da tarefa assíncrona de relatório",
        security: [{ apiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["jobId"],
          properties: { jobId: { type: "string" } }
        },
        response: {
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          404: respostasErroPadrao[404],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request) => {
      const tarefa = await prisma.tarefaRelatorio.findUnique({
        where: { id: request.params.jobId }
      });
      if (!tarefa) {
        throw new ErroNaoEncontrado("Tarefa de relatório não encontrada");
      }
      return tarefa;
    }
  );

  app.get<{ Params: { jobId: string } }>(
    "/relatorios/jobs/:jobId/download",
    {
      preHandler: exigirPermissao("READ_ANALYTICS"),
      schema: {
        tags: ["Público v1 - Relatórios Assíncronos"],
        summary: "Baixa o relatório gerado pela fila assíncrona",
        security: [{ apiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["jobId"],
          properties: { jobId: { type: "string" } }
        },
        response: {
          400: respostasErroPadrao[400],
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          404: respostasErroPadrao[404],
          429: respostasErroPadrao[429]
        }
      }
    },
    async (request, reply) => {
      const tarefa = await prisma.tarefaRelatorio.findUnique({
        where: { id: request.params.jobId }
      });
      if (!tarefa) {
        throw new ErroNaoEncontrado("Tarefa de relatório não encontrada");
      }

      if (tarefa.status !== StatusTarefa.CONCLUIDO || !tarefa.caminhoArquivo) {
        throw new ErroValidacao(
          `Relatório ainda não disponível para download (status atual: ${tarefa.status})`
        );
      }

      const conteudo = await readFile(tarefa.caminhoArquivo, "utf-8");
      const nomeArquivo = path.basename(tarefa.caminhoArquivo);
      const mimeType =
        tarefa.formato === FormatoExportacao.CSV
          ? "text/csv; charset=utf-8"
          : "application/json; charset=utf-8";

      reply.header("Content-Type", mimeType);
      reply.header("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
      return reply.send(conteudo);
    }
  );
}
