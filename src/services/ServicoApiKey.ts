import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ErroAutenticacao, ErroNaoEncontrado, ErroValidacao } from "../domain/erros/ErroDominio.js";

export interface CriarApiKeyInput {
  nomeParceiro: string;
  organizacaoId: string;
  permissoes: string[];
  limitePorMinuto?: number;
  expiraEm?: string;
}

export interface ApiKeyContext {
  id: string;
  nomeParceiro: string;
  organizacaoId: string;
  permissoes: string[];
  limitePorMinuto: number;
}

export class ServicoApiKey {
  constructor(private readonly prisma: PrismaClient) {}

  public static gerarHash(chavePlana: string): string {
    return createHash("sha256").update(chavePlana).digest("hex");
  }

  public async criar(dados: CriarApiKeyInput) {
    const org = await this.prisma.organizacao.findUnique({
      where: { id: dados.organizacaoId }
    });
    if (!org) {
      throw new ErroNaoEncontrado("Organização não encontrada para associação da API Key");
    }

    if (!dados.permissoes || dados.permissoes.length === 0) {
      throw new ErroValidacao("Informe ao menos uma permissão para a API Key");
    }

    const chavePlana = `gc_live_${randomBytes(24).toString("hex")}`;
    const chaveHash = ServicoApiKey.gerarHash(chavePlana);
    const prefixo = chavePlana.slice(0, 16);

    const criada = await this.prisma.apiKey.create({
      data: {
        nomeParceiro: dados.nomeParceiro,
        organizacaoId: dados.organizacaoId,
        prefixo,
        chaveHash,
        permissoes: dados.permissoes,
        limitePorMinuto: dados.limitePorMinuto ?? 60,
        expiraEm: dados.expiraEm ? new Date(dados.expiraEm) : null
      },
      select: {
        id: true,
        nomeParceiro: true,
        organizacaoId: true,
        prefixo: true,
        permissoes: true,
        limitePorMinuto: true,
        ativa: true,
        expiraEm: true,
        createdAt: true
      }
    });

    return {
      ...criada,
      chave: chavePlana
    };
  }

  public async listar() {
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nomeParceiro: true,
        organizacaoId: true,
        prefixo: true,
        permissoes: true,
        limitePorMinuto: true,
        ativa: true,
        expiraEm: true,
        ultimoUso: true,
        createdAt: true
      }
    });
  }

  public async revogar(id: string) {
    const existente = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existente) {
      throw new ErroNaoEncontrado("API Key não encontrada");
    }

    return this.prisma.apiKey.update({
      where: { id },
      data: { ativa: false },
      select: {
        id: true,
        nomeParceiro: true,
        prefixo: true,
        ativa: true
      }
    });
  }

  public async validarChave(chavePlana: string): Promise<ApiKeyContext> {
    const chaveHash = ServicoApiKey.gerarHash(chavePlana);
    const registro = await this.prisma.apiKey.findUnique({
      where: { chaveHash }
    });

    if (!registro || !registro.ativa) {
      throw new ErroAutenticacao("API Key inválida ou revogada");
    }

    if (registro.expiraEm && registro.expiraEm.getTime() < Date.now()) {
      throw new ErroAutenticacao("API Key expirada");
    }

    await this.prisma.apiKey.update({
      where: { id: registro.id },
      data: { ultimoUso: new Date() }
    });

    return {
      id: registro.id,
      nomeParceiro: registro.nomeParceiro,
      organizacaoId: registro.organizacaoId,
      permissoes: registro.permissoes,
      limitePorMinuto: registro.limitePorMinuto
    };
  }
}
