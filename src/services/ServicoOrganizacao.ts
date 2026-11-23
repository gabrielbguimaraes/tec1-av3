import { PrismaClient } from "@prisma/client";
import { ErroValidacao } from "../domain/erros/ErroDominio.js";
import { ValidadorCNPJ } from "../domain/validadores/ValidadorCNPJ.js";

export interface CriarOrganizacaoInput {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
}

export class ServicoOrganizacao {
  private readonly validadorCnpj = new ValidadorCNPJ();

  constructor(private readonly prisma: PrismaClient) {}

  public async listar() {
    return this.prisma.organizacao.findMany({
      include: { contrato: true },
      orderBy: { dataCadastro: "desc" }
    });
  }

  public async criar(dados: CriarOrganizacaoInput) {
    if (!this.validadorCnpj.validar(dados.cnpj)) {
      throw new ErroValidacao(this.validadorCnpj.obterMensagemErro());
    }

    const cnpjLimpo = ValidadorCNPJ.limpar(dados.cnpj);
    const existente = await this.prisma.organizacao.findUnique({
      where: { cnpj: cnpjLimpo }
    });
    if (existente) {
      throw new ErroValidacao("Já existe organização cadastrada com este CNPJ");
    }

    return this.prisma.organizacao.create({
      data: {
        razaoSocial: dados.razaoSocial,
        cnpj: cnpjLimpo,
        inscricaoEstadual: dados.inscricaoEstadual,
        enderecoCompleto: dados.enderecoCompleto,
        telefone: dados.telefone,
        email: dados.email
      }
    });
  }
}
