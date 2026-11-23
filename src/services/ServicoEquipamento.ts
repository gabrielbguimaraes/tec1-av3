import {
  EstadoFisico,
  PrismaClient,
  StatusRastreamento,
  TipoEquipamento
} from "@prisma/client";
import {
  ErroConflitoVersao,
  ErroNaoEncontrado
} from "../domain/erros/ErroDominio.js";
import { RegrasEquipamento } from "../domain/regras/RegrasEquipamento.js";

export interface CriarEquipamentoInput {
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
}

export interface AtualizarStatusEquipamentoInput {
  statusRastreamento: StatusRastreamento;
  estadoFisico?: EstadoFisico;
  destino?: string;
  responsavel: string;
  justificativa?: string;
  versao: number;
}

export class ServicoEquipamento {
  constructor(private readonly prisma: PrismaClient) {}

  public async listar() {
    return this.prisma.equipamento.findMany({
      include: {
        lote: { select: { id: true, notaFiscal: true, statusProcessamento: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  public async criar(dados: CriarEquipamentoInput) {
    const lote = await this.prisma.lote.findUnique({ where: { id: dados.loteId } });
    if (!lote) {
      throw new ErroNaoEncontrado("Lote não encontrado");
    }

    return this.prisma.$transaction(async (tx) => {
      const equip = await tx.equipamento.create({
        data: {
          codigoBarrasInterno: dados.codigoBarrasInterno,
          tipo: dados.tipo,
          marca: dados.marca,
          modelo: dados.modelo,
          anoFabricacao: dados.anoFabricacao,
          estadoFisico: dados.estadoFisico,
          pesoQuilogramas: dados.pesoQuilogramas,
          valorEstimadoRecuperacao: dados.valorEstimadoRecuperacao,
          loteId: dados.loteId,
          posicaoNoLote: dados.posicaoNoLote
        }
      });

      await tx.movimentacao.create({
        data: {
          equipamentoId: equip.id,
          origem: "DOCA_RECEBIMENTO",
          destino: "AGUARDANDO_TRIAGEM",
          responsavel: "sistema",
          observacao: "Cadastro inicial de equipamento no lote",
          estadoAnterior: dados.estadoFisico,
          estadoNovo: dados.estadoFisico
        }
      });

      return equip;
    });
  }

  public async rastrearPorCodigoBarras(codigoBarrasInterno: string) {
    const equipamento = await this.prisma.equipamento.findUnique({
      where: { codigoBarrasInterno },
      include: {
        lote: {
          include: {
            organizacao: {
              select: { id: true, razaoSocial: true, cnpj: true }
            }
          }
        },
        movimentacoes: {
          orderBy: { dataHora: "desc" }
        }
      }
    });

    if (!equipamento) {
      throw new ErroNaoEncontrado("Equipamento não encontrado para o código informado");
    }

    return equipamento;
  }

  public async atualizarStatus(id: string, dados: AtualizarStatusEquipamentoInput) {
    return this.prisma.$transaction(async (tx) => {
      const atual = await tx.equipamento.findUnique({
        where: { id },
        include: { lote: true }
      });

      if (!atual) {
        throw new ErroNaoEncontrado("Equipamento não encontrado");
      }

      if (atual.versao !== dados.versao) {
        throw new ErroConflitoVersao();
      }

      RegrasEquipamento.validarTransicaoDesmonte(
        atual.statusRastreamento,
        dados.statusRastreamento,
        atual.lote.statusProcessamento
      );

      const estadoNovo = dados.estadoFisico ?? atual.estadoFisico;
      RegrasEquipamento.validarDegradacaoEstado(
        atual.estadoFisico,
        estadoNovo,
        dados.justificativa
      );

      const resultadoUpdate = await tx.equipamento.updateMany({
        where: { id, versao: dados.versao },
        data: {
          statusRastreamento: dados.statusRastreamento,
          estadoFisico: estadoNovo,
          versao: { increment: 1 }
        }
      });

      if (resultadoUpdate.count === 0) {
        throw new ErroConflitoVersao();
      }

      await tx.movimentacao.create({
        data: {
          equipamentoId: id,
          origem: atual.statusRastreamento,
          destino: dados.destino ?? dados.statusRastreamento,
          responsavel: dados.responsavel,
          observacao: dados.justificativa,
          estadoAnterior: atual.estadoFisico,
          estadoNovo
        }
      });

      return tx.equipamento.findUniqueOrThrow({
        where: { id },
        include: { movimentacoes: { orderBy: { dataHora: "desc" } } }
      });
    });
  }
}
