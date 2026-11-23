import { Prisma, TipoAnalise } from "@prisma/client";
import { max, mean, median, min, standardDeviation } from "simple-statistics";
import { AnalisadorBase } from "./AnalisadorBase.js";

export interface ParametrosEficiencia {
  organizacaoId?: string;
  origemExecucao?: string;
}

export interface MetricasGrupoEficiencia {
  chave: string;
  totalLotes: number;
  tempoMedioHoras: number;
  tempoMedianoHoras: number;
  desvioPadraoHoras: number;
  tempoMinimoHoras: number;
  tempoMaximoHoras: number;
  gargalo: boolean;
}

export interface ResultadoEficienciaOperacional {
  resultadoAnaliticoId: string;
  geradoEm: Date;
  resumoGlobal: {
    totalLotesAnalisados: number;
    tempoMedioHoras: number;
    tempoMedianoHoras: number;
    desvioPadraoHoras: number;
    tempoMinimoHoras: number;
    tempoMaximoHoras: number;
    limiarGargaloHoras: number;
  };
  porOperador: MetricasGrupoEficiencia[];
  porPeriodo: MetricasGrupoEficiencia[];
  gargalos: {
    operadores: string[];
    periodos: string[];
  };
}

export class AnalisadorEficienciaOperacional extends AnalisadorBase<
  ParametrosEficiencia,
  ResultadoEficienciaOperacional
> {
  public async executar(
    parametros: ParametrosEficiencia = {}
  ): Promise<ResultadoEficienciaOperacional> {
    const origemExecucao = parametros.origemExecucao ?? "API";
    const lotes = await this.prisma.lote.findMany({
      where: {
        dataFimTriagem: { not: null },
        ...(parametros.organizacaoId ? { organizacaoId: parametros.organizacaoId } : {})
      },
      orderBy: { dataEntrada: "asc" }
    });

    const amostras = lotes
      .filter((lote) => lote.dataFimTriagem !== null)
      .map((lote) => {
        const horas = Math.max(
          0,
          (lote.dataFimTriagem!.getTime() - lote.dataEntrada.getTime()) / 3600000
        );
        return {
          horas,
          operador: lote.operadorTriagem ?? "NAO_INFORMADO",
          periodo: lote.dataEntrada.toISOString().slice(0, 7)
        };
      });

    const tempos = amostras.map((a) => a.horas);
    const mediaGlobal = tempos.length > 0 ? mean(tempos) : 0;
    const medianaGlobal = tempos.length > 0 ? median(tempos) : 0;
    const desvioGlobal = tempos.length > 1 ? standardDeviation(tempos) : 0;
    const minGlobal = tempos.length > 0 ? min(tempos) : 0;
    const maxGlobal = tempos.length > 0 ? max(tempos) : 0;
    const limiarGargalo = mediaGlobal + desvioGlobal;

    const porOperador = this.agruparMetricas(amostras, (a) => a.operador, limiarGargalo);
    const porPeriodo = this.agruparMetricas(amostras, (a) => a.periodo, limiarGargalo);

    const gargalos = {
      operadores: porOperador.filter((g) => g.gargalo).map((g) => g.chave),
      periodos: porPeriodo.filter((g) => g.gargalo).map((g) => g.chave)
    };

    const resumoGlobal = {
      totalLotesAnalisados: amostras.length,
      tempoMedioHoras: this.arredondar(mediaGlobal),
      tempoMedianoHoras: this.arredondar(medianaGlobal),
      desvioPadraoHoras: this.arredondar(desvioGlobal),
      tempoMinimoHoras: this.arredondar(minGlobal),
      tempoMaximoHoras: this.arredondar(maxGlobal),
      limiarGargaloHoras: this.arredondar(limiarGargalo)
    };

    const registro = await this.persistirResultado({
      tipo: TipoAnalise.EFICIENCIA_OPERACIONAL,
      referenciaPeriodo: new Date().toISOString().slice(0, 7),
      parametros: parametros as unknown as Prisma.InputJsonValue,
      resumoMetricas: resumoGlobal as unknown as Prisma.InputJsonValue,
      detalhes: { porOperador, porPeriodo, gargalos } as unknown as Prisma.InputJsonValue,
      origemExecucao
    });

    return {
      resultadoAnaliticoId: registro.id,
      geradoEm: registro.geradoEm,
      resumoGlobal,
      porOperador,
      porPeriodo,
      gargalos
    };
  }

  private agruparMetricas(
    amostras: Array<{ horas: number; operador: string; periodo: string }>,
    seletorChave: (item: { horas: number; operador: string; periodo: string }) => string,
    limiarGargalo: number
  ): MetricasGrupoEficiencia[] {
    const mapa = new Map<string, number[]>();
    for (const amostra of amostras) {
      const chave = seletorChave(amostra);
      const lista = mapa.get(chave) ?? [];
      lista.push(amostra.horas);
      mapa.set(chave, lista);
    }

    const resultado: MetricasGrupoEficiencia[] = [];
    for (const [chave, valores] of mapa.entries()) {
      const mediaGrupo = mean(valores);
      resultado.push({
        chave,
        totalLotes: valores.length,
        tempoMedioHoras: this.arredondar(mediaGrupo),
        tempoMedianoHoras: this.arredondar(median(valores)),
        desvioPadraoHoras: this.arredondar(
          valores.length > 1 ? standardDeviation(valores) : 0
        ),
        tempoMinimoHoras: this.arredondar(min(valores)),
        tempoMaximoHoras: this.arredondar(max(valores)),
        gargalo: valores.length > 0 && limiarGargalo > 0 && mediaGrupo > limiarGargalo
      });
    }

    return resultado.sort((a, b) => b.tempoMedioHoras - a.tempoMedioHoras);
  }
}
