import { FormatoExportacao, TipoAnalise } from "@prisma/client";
import { Queue } from "bullmq";
import { obterOpcoesRedis } from "./redisConfig.js";

export const NOME_FILA_RELATORIOS = "relatorios-analiticos";

export interface DadosJobRelatorio {
  tarefaId: string;
  tipoAnalise: TipoAnalise;
  formato: FormatoExportacao;
  organizacaoId?: string;
  webhookUrl?: string;
}

export class FilaRelatorios {
  private readonly fila: Queue<DadosJobRelatorio>;

  constructor() {
    this.fila = new Queue<DadosJobRelatorio>(NOME_FILA_RELATORIOS, {
      connection: obterOpcoesRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 200
      }
    });
  }

  public async enfileirar(dados: DadosJobRelatorio): Promise<string> {
    const job = await this.fila.add("gerar-relatorio", dados, {
      jobId: dados.tarefaId
    });
    return job.id ?? dados.tarefaId;
  }

  public async fechar(): Promise<void> {
    await this.fila.close();
  }
}
