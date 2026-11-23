import { EstadoFisico, Prisma, TipoAnalise, TipoEquipamento } from "@prisma/client";
import { linearRegression, linearRegressionLine, mean, rSquared } from "simple-statistics";
import { AnalisadorBase } from "./AnalisadorBase.js";

const ESCALA_INTEGRIDADE: Record<EstadoFisico, number> = {
  NOVO: 100,
  BOM_ESTADO: 85,
  USADO_LEVE: 70,
  USADO_MODERADO: 55,
  DANIFICADO_LEVE: 35,
  DANIFICADO_GRAVE: 15,
  INSERVIVEL: 0
};

export interface ParametrosVidaUtil {
  organizacaoId?: string;
  origemExecucao?: string;
  anoReferencia?: number;
}

export interface ItemPrevisaoVidaUtil {
  tipoEquipamento: TipoEquipamento;
  coeficienteAngular: number;
  intercepto: number;
  rQuadrado: number;
  idadeMediaAtualAnos: number;
  vidaUtilRemanescenteAnos: number;
  anoPrevistoInservivel: number;
  amostraTamanho: number;
}

export interface ResultadoVidaUtilPreditiva {
  resultadoAnaliticoId: string;
  geradoEm: Date;
  anoReferencia: number;
  resumo: {
    tiposAnalisados: number;
    totalEquipamentos: number;
    vidaUtilRemanescenteMediaAnos: number;
  };
  previsoes: ItemPrevisaoVidaUtil[];
}

export class AnalisadorVidaUtilPreditivo extends AnalisadorBase<
  ParametrosVidaUtil,
  ResultadoVidaUtilPreditiva
> {
  public async executar(
    parametros: ParametrosVidaUtil = {}
  ): Promise<ResultadoVidaUtilPreditiva> {
    const origemExecucao = parametros.origemExecucao ?? "API";
    const anoReferencia = parametros.anoReferencia ?? new Date().getFullYear();

    const equipamentos = await this.prisma.equipamento.findMany({
      where: parametros.organizacaoId
        ? { lote: { organizacaoId: parametros.organizacaoId } }
        : undefined
    });

    const gruposPorTipo = new Map<TipoEquipamento, Array<[number, number]>>();
    for (const eq of equipamentos) {
      const idade = Math.max(0, anoReferencia - eq.anoFabricacao);
      const integridade = ESCALA_INTEGRIDADE[eq.estadoFisico];
      const pares = gruposPorTipo.get(eq.tipo) ?? [];
      pares.push([idade, integridade]);
      gruposPorTipo.set(eq.tipo, pares);
    }

    const previsoes: ItemPrevisaoVidaUtil[] = [];

    for (const [tipoEquipamento, pares] of gruposPorTipo.entries()) {
      const idades = pares.map((p) => p[0]);
      const integridades = pares.map((p) => p[1]);
      const idadeMedia = mean(idades);

      let m = -10;
      let b = mean(integridades);
      let r2 = 0;

      const xUnicos = new Set(idades);
      if (pares.length >= 2 && xUnicos.size >= 2) {
        const reg = linearRegression(pares);
        const linha = linearRegressionLine(reg);
        m = Number.isFinite(reg.m) ? reg.m : -10;
        b = Number.isFinite(reg.b) ? reg.b : mean(integridades);
        const r2Calculado = rSquared(pares, linha);
        r2 = Number.isFinite(r2Calculado) ? Math.max(0, Math.min(1, r2Calculado)) : 0;
      }

      const idadeCritica = m < 0 ? Math.max(idadeMedia, -b / m) : idadeMedia + 5;
      const vidaUtilRemanescente = Math.max(0, idadeCritica - idadeMedia);
      const anoPrevistoInservivel = Math.round(anoReferencia + vidaUtilRemanescente);

      previsoes.push({
        tipoEquipamento,
        coeficienteAngular: this.arredondar(m, 4),
        intercepto: this.arredondar(b, 4),
        rQuadrado: this.arredondar(r2, 4),
        idadeMediaAtualAnos: this.arredondar(idadeMedia, 2),
        vidaUtilRemanescenteAnos: this.arredondar(vidaUtilRemanescente, 2),
        anoPrevistoInservivel,
        amostraTamanho: pares.length
      });
    }

    previsoes.sort((a, b) => a.vidaUtilRemanescenteAnos - b.vidaUtilRemanescenteAnos);

    const vidaUtilMedia =
      previsoes.length > 0
        ? mean(previsoes.map((p) => p.vidaUtilRemanescenteAnos))
        : 0;

    const resumo = {
      tiposAnalisados: previsoes.length,
      totalEquipamentos: equipamentos.length,
      vidaUtilRemanescenteMediaAnos: this.arredondar(vidaUtilMedia, 2)
    };

    const registro = await this.prisma.$transaction(async (tx) => {
      const resultado = await tx.resultadoAnalitico.create({
        data: {
          tipo: TipoAnalise.VIDA_UTIL_PREDITIVA,
          referenciaPeriodo: String(anoReferencia),
          parametros: parametros as unknown as Prisma.InputJsonValue,
          resumoMetricas: resumo as unknown as Prisma.InputJsonValue,
          detalhes: { previsoes } as unknown as Prisma.InputJsonValue,
          origemExecucao
        }
      });

      if (previsoes.length > 0) {
        await tx.previsaoVidaUtil.createMany({
          data: previsoes.map((p) => ({
            resultadoAnaliticoId: resultado.id,
            tipoEquipamento: p.tipoEquipamento,
            coeficienteAngular: p.coeficienteAngular,
            intercepto: p.intercepto,
            rQuadrado: p.rQuadrado,
            idadeMediaAtualAnos: p.idadeMediaAtualAnos,
            vidaUtilRemanescenteAnos: p.vidaUtilRemanescenteAnos,
            anoPrevistoInservivel: p.anoPrevistoInservivel,
            amostraTamanho: p.amostraTamanho
          }))
        });
      }

      return resultado;
    });

    return {
      resultadoAnaliticoId: registro.id,
      geradoEm: registro.geradoEm,
      anoReferencia,
      resumo,
      previsoes
    };
  }
}
