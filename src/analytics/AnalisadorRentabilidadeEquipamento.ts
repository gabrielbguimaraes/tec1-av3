import { EstadoFisico, Prisma, TipoAnalise, TipoEquipamento } from "@prisma/client";
import { mean, median, standardDeviation } from "simple-statistics";
import { AnalisadorBase } from "./AnalisadorBase.js";

export interface ParametrosRentabilidade {
  organizacaoId?: string;
  origemExecucao?: string;
}

export interface ItemRankingRentabilidade {
  tipo: TipoEquipamento;
  estadoFisico: EstadoFisico;
  marca: string;
  modelo: string;
  quantidade: number;
  valorMedioRecuperacao: number;
  valorMedianoRecuperacao: number;
  desvioPadraoValor: number;
  valorTotalEstimado: number;
  pesoTotalKg: number;
  retornoPorKg: number;
}

export interface ResultadoRentabilidadeEquipamento {
  resultadoAnaliticoId: string;
  geradoEm: Date;
  resumoGeral: {
    totalEquipamentos: number;
    totalGrupos: number;
    valorTotalEstimado: number;
    pesoTotalKg: number;
    retornoMedioPorKg: number;
  };
  ranking: ItemRankingRentabilidade[];
}

export class AnalisadorRentabilidadeEquipamento extends AnalisadorBase<
  ParametrosRentabilidade,
  ResultadoRentabilidadeEquipamento
> {
  public async executar(
    parametros: ParametrosRentabilidade = {}
  ): Promise<ResultadoRentabilidadeEquipamento> {
    const origemExecucao = parametros.origemExecucao ?? "API";
    const equipamentos = await this.prisma.equipamento.findMany({
      where: parametros.organizacaoId
        ? { lote: { organizacaoId: parametros.organizacaoId } }
        : undefined
    });

    const grupos = new Map<
      string,
      {
        tipo: TipoEquipamento;
        estadoFisico: EstadoFisico;
        marca: string;
        modelo: string;
        valores: number[];
        pesos: number[];
      }
    >();

    for (const eq of equipamentos) {
      const chave = `${eq.tipo}|${eq.estadoFisico}|${eq.marca}|${eq.modelo}`;
      const atual = grupos.get(chave) ?? {
        tipo: eq.tipo,
        estadoFisico: eq.estadoFisico,
        marca: eq.marca,
        modelo: eq.modelo,
        valores: [],
        pesos: []
      };
      atual.valores.push(eq.valorEstimadoRecuperacao);
      atual.pesos.push(eq.pesoQuilogramas);
      grupos.set(chave, atual);
    }

    const ranking: ItemRankingRentabilidade[] = [];
    let valorGlobal = 0;
    let pesoGlobal = 0;

    for (const grupo of grupos.values()) {
      const valorTotal = grupo.valores.reduce((acc, v) => acc + v, 0);
      const pesoTotal = grupo.pesos.reduce((acc, p) => acc + p, 0);
      valorGlobal += valorTotal;
      pesoGlobal += pesoTotal;

      ranking.push({
        tipo: grupo.tipo,
        estadoFisico: grupo.estadoFisico,
        marca: grupo.marca,
        modelo: grupo.modelo,
        quantidade: grupo.valores.length,
        valorMedioRecuperacao: this.arredondar(mean(grupo.valores)),
        valorMedianoRecuperacao: this.arredondar(median(grupo.valores)),
        desvioPadraoValor: this.arredondar(
          grupo.valores.length > 1 ? standardDeviation(grupo.valores) : 0
        ),
        valorTotalEstimado: this.arredondar(valorTotal),
        pesoTotalKg: this.arredondar(pesoTotal),
        retornoPorKg: this.arredondar(pesoTotal > 0 ? valorTotal / pesoTotal : 0)
      });
    }

    ranking.sort(
      (a, b) =>
        b.valorMedioRecuperacao - a.valorMedioRecuperacao ||
        b.retornoPorKg - a.retornoPorKg
    );

    const resumoGeral = {
      totalEquipamentos: equipamentos.length,
      totalGrupos: ranking.length,
      valorTotalEstimado: this.arredondar(valorGlobal),
      pesoTotalKg: this.arredondar(pesoGlobal),
      retornoMedioPorKg: this.arredondar(pesoGlobal > 0 ? valorGlobal / pesoGlobal : 0)
    };

    const registro = await this.persistirResultado({
      tipo: TipoAnalise.RENTABILIDADE_EQUIPAMENTO,
      referenciaPeriodo: new Date().toISOString().slice(0, 7),
      parametros: parametros as unknown as Prisma.InputJsonValue,
      resumoMetricas: resumoGeral as unknown as Prisma.InputJsonValue,
      detalhes: { ranking } as unknown as Prisma.InputJsonValue,
      origemExecucao
    });

    return {
      resultadoAnaliticoId: registro.id,
      geradoEm: registro.geradoEm,
      resumoGeral,
      ranking
    };
  }
}
