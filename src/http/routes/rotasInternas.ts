import {
  EstadoFisico,
  PapelUsuario,
  PrismaClient,
  StatusRastreamento,
  TipoAnalise,
  TipoEquipamento
} from "@prisma/client";
import { FastifyInstance } from "fastify";
import { AnalisadorEficienciaOperacional } from "../../analytics/AnalisadorEficienciaOperacional.js";
import { AnalisadorRentabilidadeEquipamento } from "../../analytics/AnalisadorRentabilidadeEquipamento.js";
import { AnalisadorVidaUtilPreditivo } from "../../analytics/AnalisadorVidaUtilPreditivo.js";
import { ServicoApiKey } from "../../services/ServicoApiKey.js";
import { ServicoAutenticacao } from "../../services/ServicoAutenticacao.js";
import { ServicoEquipamento } from "../../services/ServicoEquipamento.js";
import { ServicoLote } from "../../services/ServicoLote.js";
import { ServicoOrganizacao } from "../../services/ServicoOrganizacao.js";
import { criarAutenticacaoJwt } from "../plugins/autenticacao.js";
import { respostasErroPadrao } from "../schemas/comuns.js";

export interface OpcoesRotasInternas {
  prisma: PrismaClient;
}

export async function registrarRotasInternas(
  app: FastifyInstance,
  opcoes: OpcoesRotasInternas
): Promise<void> {
  const { prisma } = opcoes;
  const servicoAuth = new ServicoAutenticacao(prisma);
  const servicoApiKey = new ServicoApiKey(prisma);
  const servicoOrg = new ServicoOrganizacao(prisma);
  const servicoLote = new ServicoLote(prisma);
  const servicoEquip = new ServicoEquipamento(prisma);
  const analisadorEficiencia = new AnalisadorEficienciaOperacional(prisma);
  const analisadorRentabilidade = new AnalisadorRentabilidadeEquipamento(prisma);
  const analisadorVidaUtil = new AnalisadorVidaUtilPreditivo(prisma);

  app.post<{ Body: { usuario: string; senha: string } }>(
    "/auth/login",
    {
      schema: {
        tags: ["Autenticação"],
        summary: "Autentica usuário interno e emite token JWT",
        body: {
          type: "object",
          required: ["usuario", "senha"],
          properties: {
            usuario: { type: "string", example: "admin" },
            senha: { type: "string", example: "admin123" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string" },
              usuario: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  usuario: { type: "string" },
                  papel: { type: "string" }
                }
              }
            }
          },
          401: respostasErroPadrao[401]
        }
      }
    },
    async (request) => {
      const user = await servicoAuth.autenticar(request.body.usuario, request.body.senha);
      const token = app.jwt.sign(
        { sub: user.id, usuario: user.usuario, papel: user.papel },
        { expiresIn: "8h" }
      );
      return { token, usuario: user };
    }
  );

  app.get(
    "/organizacoes",
    {
      preHandler: criarAutenticacaoJwt(),
      schema: {
        tags: ["Interno - Domínio"],
        summary: "Lista organizações cadastradas",
        security: [{ bearerAuth: [] }],
        response: { 401: respostasErroPadrao[401] }
      }
    },
    async () => servicoOrg.listar()
  );

  app.post<{
    Body: {
      razaoSocial: string;
      cnpj: string;
      inscricaoEstadual: string;
      enderecoCompleto: string;
      telefone: string;
      email: string;
    };
  }>(
    "/organizacoes",
    {
      preHandler: criarAutenticacaoJwt([
        PapelUsuario.ADMINISTRADOR,
        PapelUsuario.OPERADOR_CADASTRO
      ]),
      schema: {
        tags: ["Interno - Domínio"],
        summary: "Cadastra organização validando CNPJ via Módulo 11",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: [
            "razaoSocial",
            "cnpj",
            "inscricaoEstadual",
            "enderecoCompleto",
            "telefone",
            "email"
          ],
          properties: {
            razaoSocial: { type: "string", example: "GreenTech Ltda" },
            cnpj: { type: "string", example: "11222333000181" },
            inscricaoEstadual: { type: "string", example: "123456789" },
            enderecoCompleto: { type: "string", example: "Rua Verde, 100 - SP" },
            telefone: { type: "string", example: "(11) 3333-4444" },
            email: { type: "string", example: "contato@greentech.com.br" }
          }
        },
        response: {
          400: respostasErroPadrao[400],
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403]
        }
      }
    },
    async (request, reply) => {
      const criada = await servicoOrg.criar(request.body);
      return reply.code(201).send(criada);
    }
  );

  app.get(
    "/lotes",
    {
      preHandler: criarAutenticacaoJwt(),
      schema: {
        tags: ["Interno - Domínio"],
        summary: "Lista lotes de coleta",
        security: [{ bearerAuth: [] }]
      }
    },
    async () => servicoLote.listar()
  );

  app.post<{
    Body: {
      organizacaoId: string;
      dataEntrada?: string;
      notaFiscal: string;
      transportadora: string;
      operadorTriagem?: string;
      observacoes?: string;
    };
  }>(
    "/lotes",
    {
      preHandler: criarAutenticacaoJwt([
        PapelUsuario.ADMINISTRADOR,
        PapelUsuario.OPERADOR_CADASTRO,
        PapelUsuario.GESTOR_ALMOXARIFADO
      ]),
      schema: {
        tags: ["Interno - Domínio"],
        summary: "Cria novo lote respeitando janela temporal de 90 dias",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["organizacaoId", "notaFiscal", "transportadora"],
          properties: {
            organizacaoId: { type: "string" },
            dataEntrada: { type: "string", format: "date-time" },
            notaFiscal: { type: "string", example: "NF-2026-9901" },
            transportadora: { type: "string", example: "TransVerde Logística" },
            operadorTriagem: { type: "string" },
            observacoes: { type: "string" }
          }
        },
        response: {
          400: respostasErroPadrao[400],
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          404: respostasErroPadrao[404]
        }
      }
    },
    async (request, reply) => {
      const lote = await servicoLote.criar(request.body);
      return reply.code(201).send(lote);
    }
  );

  app.get(
    "/equipamentos",
    {
      preHandler: criarAutenticacaoJwt(),
      schema: {
        tags: ["Interno - Domínio"],
        summary: "Lista equipamentos cadastrados",
        security: [{ bearerAuth: [] }]
      }
    },
    async () => servicoEquip.listar()
  );

  app.post<{
    Body: {
      codigoBarrasInterno: string;
      tipo: TipoEquipamento;
      marca: string;
      modelo: string;
      anoFabricacao: number;
      estadoFisico: EstadoFisico;
      pesoQuilogramas: number;
      valorEstimadoRecuperacao: number;
      loteId: string;
      posicaoNoLote: number;
    };
  }>(
    "/equipamentos",
    {
      preHandler: criarAutenticacaoJwt([
        PapelUsuario.ADMINISTRADOR,
        PapelUsuario.GESTOR_ALMOXARIFADO
      ]),
      schema: {
        tags: ["Interno - Domínio"],
        summary: "Cadastra novo equipamento vinculado a um lote",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: [
            "codigoBarrasInterno",
            "tipo",
            "marca",
            "modelo",
            "anoFabricacao",
            "estadoFisico",
            "pesoQuilogramas",
            "valorEstimadoRecuperacao",
            "loteId",
            "posicaoNoLote"
          ],
          properties: {
            codigoBarrasInterno: { type: "string" },
            tipo: { type: "string", enum: Object.values(TipoEquipamento) },
            marca: { type: "string" },
            modelo: { type: "string" },
            anoFabricacao: { type: "integer" },
            estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
            pesoQuilogramas: { type: "number" },
            valorEstimadoRecuperacao: { type: "number" },
            loteId: { type: "string" },
            posicaoNoLote: { type: "integer" }
          }
        }
      }
    },
    async (request, reply) => {
      const equip = await servicoEquip.criar(request.body);
      return reply.code(201).send(equip);
    }
  );

  app.patch<{
    Params: { id: string };
    Body: {
      statusRastreamento: StatusRastreamento;
      estadoFisico?: EstadoFisico;
      destino?: string;
      justificativa?: string;
      versao: number;
    };
  }>(
    "/equipamentos/:id/status",
    {
      preHandler: criarAutenticacaoJwt([
        PapelUsuario.ADMINISTRADOR,
        PapelUsuario.GESTOR_ALMOXARIFADO
      ]),
      schema: {
        tags: ["Interno - Domínio"],
        summary: "Atualiza status e estado físico com versionamento otimista",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["statusRastreamento", "versao"],
          properties: {
            statusRastreamento: { type: "string", enum: Object.values(StatusRastreamento) },
            estadoFisico: { type: "string", enum: Object.values(EstadoFisico) },
            destino: { type: "string" },
            justificativa: { type: "string" },
            versao: { type: "integer", minimum: 1 }
          }
        },
        response: {
          400: respostasErroPadrao[400],
          404: respostasErroPadrao[404],
          409: respostasErroPadrao[409]
        }
      }
    },
    async (request) => {
      return servicoEquip.atualizarStatus(request.params.id, {
        ...request.body,
        responsavel: request.user.usuario
      });
    }
  );

  app.post<{
    Body: {
      nomeParceiro: string;
      organizacaoId: string;
      permissoes: string[];
      limitePorMinuto?: number;
      expiraEm?: string;
    };
  }>(
    "/api-keys",
    {
      preHandler: criarAutenticacaoJwt([PapelUsuario.ADMINISTRADOR]),
      schema: {
        tags: ["Interno - API Keys"],
        summary: "Emite nova API Key para parceiro externo (somente ADMINISTRADOR)",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["nomeParceiro", "organizacaoId", "permissoes"],
          properties: {
            nomeParceiro: { type: "string", example: "Cooperativa ReciclaMais" },
            organizacaoId: { type: "string", example: "org-techcorp-001" },
            permissoes: {
              type: "array",
              items: { type: "string" },
              example: ["READ_TRACKING", "WRITE_LOTES", "READ_ANALYTICS"]
            },
            limitePorMinuto: { type: "integer", minimum: 1, example: 60 },
            expiraEm: { type: "string", format: "date-time" }
          }
        },
        response: {
          400: respostasErroPadrao[400],
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          404: respostasErroPadrao[404]
        }
      }
    },
    async (request, reply) => {
      const criada = await servicoApiKey.criar(request.body);
      return reply.code(201).send(criada);
    }
  );

  app.get(
    "/api-keys",
    {
      preHandler: criarAutenticacaoJwt([PapelUsuario.ADMINISTRADOR]),
      schema: {
        tags: ["Interno - API Keys"],
        summary: "Lista API Keys cadastradas sem expor segredos",
        security: [{ bearerAuth: [] }],
        response: { 401: respostasErroPadrao[401], 403: respostasErroPadrao[403] }
      }
    },
    async () => servicoApiKey.listar()
  );

  app.delete<{ Params: { id: string } }>(
    "/api-keys/:id",
    {
      preHandler: criarAutenticacaoJwt([PapelUsuario.ADMINISTRADOR]),
      schema: {
        tags: ["Interno - API Keys"],
        summary: "Revoga API Key existente",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } }
        },
        response: {
          401: respostasErroPadrao[401],
          403: respostasErroPadrao[403],
          404: respostasErroPadrao[404]
        }
      }
    },
    async (request) => servicoApiKey.revogar(request.params.id)
  );

  app.get(
    "/analytics/eficiencia",
    {
      preHandler: criarAutenticacaoJwt(),
      schema: {
        tags: ["Interno - Análises"],
        summary: "Executa análise de eficiência operacional",
        security: [{ bearerAuth: [] }]
      }
    },
    async () => analisadorEficiencia.executar({ origemExecucao: "API" })
  );

  app.get(
    "/analytics/rentabilidade",
    {
      preHandler: criarAutenticacaoJwt(),
      schema: {
        tags: ["Interno - Análises"],
        summary: "Executa análise de rentabilidade por equipamento",
        security: [{ bearerAuth: [] }]
      }
    },
    async () => analisadorRentabilidade.executar({ origemExecucao: "API" })
  );

  app.get(
    "/analytics/vida-util",
    {
      preHandler: criarAutenticacaoJwt(),
      schema: {
        tags: ["Interno - Análises"],
        summary: "Executa análise preditiva de vida útil via regressão linear OLS",
        security: [{ bearerAuth: [] }]
      }
    },
    async () => analisadorVidaUtil.executar({ origemExecucao: "API" })
  );

  app.get<{ Querystring: { tipo?: TipoAnalise } }>(
    "/analytics/historico",
    {
      preHandler: criarAutenticacaoJwt(),
      schema: {
        tags: ["Interno - Análises"],
        summary: "Consulta histórico de execuções analíticas",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: Object.values(TipoAnalise) }
          }
        }
      }
    },
    async (request) => {
      return prisma.resultadoAnalitico.findMany({
        where: request.query.tipo ? { tipo: request.query.tipo } : undefined,
        include: { previsoesVidaUtil: true },
        orderBy: { geradoEm: "desc" },
        take: 50
      });
    }
  );
}
