import {
  EstadoFisico,
  PrismaClient,
  StatusLote,
  TipoEquipamento
} from "@prisma/client";
import { ErroNaoEncontrado, ErroValidacao } from "../domain/erros/ErroDominio.js";
import { ValidadorDataEntrada } from "../domain/validadores/ValidadorDataEntrada.js";

export interface EquipamentoNoLoteInput {
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  valorEstimadoRecuperacao: number;
}

export interface CriarLoteInput {
  organizacaoId: string;
  dataEntrada?: string;
  notaFiscal: string;
  transportadora: string;
  operadorTriagem?: string;
  observacoes?: string;
  equipamentos?: EquipamentoNoLoteInput[];
}

export class ServicoLote {
  constructor(private readonly prisma: PrismaClient) {}

  public async listar() {
    return this.prisma.lote.findMany({
      include: {
        organizacao: { select: { id: true, razaoSocial: true, cnpj: true } },
        _count: { select: { equipamentos: true } }
      },
      orderBy: { dataEntrada: "desc" }
    });
  }

  public async criar(dados: CriarLoteInput) {
    const dataEntrada = dados.dataEntrada ? new Date(dados.dataEntrada) : new Date();
    const validadorData = new ValidadorDataEntrada();

    if (!validadorData.validar(dataEntrada)) {
      throw new ErroValidacao(validadorData.obterMensagemErro());
    }

    const organizacao = await this.prisma.organizacao.findUnique({
      where: { id: dados.organizacaoId }
    });
    if (!organizacao) {
      throw new ErroNaoEncontrado("Organização informada não existe");
    }

    return this.prisma.$transaction(async (tx) => {
      const lote = await tx.lote.create({
        data: {
          organizacaoId: dados.organizacaoId,
          dataEntrada,
          notaFiscal: dados.notaFiscal,
          transportadora: dados.transportadora,
          operadorTriagem: dados.operadorTriagem,
          observacoes: dados.observacoes,
          statusProcessamento: StatusLote.RECEBIDO
        }
      });

      if (dados.equipamentos && dados.equipamentos.length > 0) {
        for (let i = 0; i < dados.equipamentos.length; i++) {
          const item = dados.equipamentos[i];
          const equip = await tx.equipamento.create({
            data: {
              codigoBarrasInterno: item.codigoBarrasInterno,
              tipo: item.tipo,
              marca: item.marca,
              modelo: item.modelo,
              anoFabricacao: item.anoFabricacao,
              estadoFisico: item.estadoFisico,
              pesoQuilogramas: item.pesoQuilogramas,
              valorEstimadoRecuperacao: item.valorEstimadoRecuperacao,
              loteId: lote.id,
              posicaoNoLote: i + 1
            }
          });

          await tx.movimentacao.create({
            data: {
              equipamentoId: equip.id,
              origem: "EXTERNO",
              destino: "DOCA_RECEBIMENTO",
              responsavel: dados.operadorTriagem ?? "parceiro_api",
              observacao: `Entrada no lote NF ${dados.notaFiscal}`,
              estadoAnterior: item.estadoFisico,
              estadoNovo: item.estadoFisico
            }
          });
        }
      }

      return tx.lote.findUniqueOrThrow({
        where: { id: lote.id },
        include: { equipamentos: true }
      });
    });
  }
}
