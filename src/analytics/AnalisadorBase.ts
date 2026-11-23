import { Prisma, PrismaClient, TipoAnalise } from "@prisma/client";

export abstract class AnalisadorBase<TParametros, TResultado> {
  constructor(protected readonly prisma: PrismaClient) {}

  abstract executar(parametros: TParametros): Promise<TResultado>;

  protected arredondar(valor: number, casas = 2): number {
    if (!Number.isFinite(valor)) {
      return 0;
    }
    const fator = 10 ** casas;
    return Math.round(valor * fator) / fator;
  }

  protected async persistirResultado(dados: {
    tipo: TipoAnalise;
    referenciaPeriodo: string;
    parametros: Prisma.InputJsonValue;
    resumoMetricas: Prisma.InputJsonValue;
    detalhes: Prisma.InputJsonValue;
    origemExecucao: string;
  }) {
    return this.prisma.resultadoAnalitico.create({
      data: {
        tipo: dados.tipo,
        referenciaPeriodo: dados.referenciaPeriodo,
        parametros: dados.parametros,
        resumoMetricas: dados.resumoMetricas,
        detalhes: dados.detalhes,
        origemExecucao: dados.origemExecucao
      }
    });
  }
}
