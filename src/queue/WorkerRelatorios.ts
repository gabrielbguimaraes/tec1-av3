import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, StatusTarefa, TipoAnalise } from "@prisma/client";
import { Job, Worker } from "bullmq";
import { AnalisadorEficienciaOperacional } from "../analytics/AnalisadorEficienciaOperacional.js";
import { AnalisadorRentabilidadeEquipamento } from "../analytics/AnalisadorRentabilidadeEquipamento.js";
import { AnalisadorVidaUtilPreditivo } from "../analytics/AnalisadorVidaUtilPreditivo.js";
import { FabricaExportador } from "../analytics/exportadores/FabricaExportador.js";
import { DadosJobRelatorio, NOME_FILA_RELATORIOS } from "./FilaRelatorios.js";
import { obterOpcoesRedis } from "./redisConfig.js";

export class WorkerRelatorios {
  private readonly worker: Worker<DadosJobRelatorio>;
  private readonly analisadorEficiencia: AnalisadorEficienciaOperacional;
  private readonly analisadorRentabilidade: AnalisadorRentabilidadeEquipamento;
  private readonly analisadorVidaUtil: AnalisadorVidaUtilPreditivo;

  constructor(private readonly prisma: PrismaClient) {
    this.analisadorEficiencia = new AnalisadorEficienciaOperacional(prisma);
    this.analisadorRentabilidade = new AnalisadorRentabilidadeEquipamento(prisma);
    this.analisadorVidaUtil = new AnalisadorVidaUtilPreditivo(prisma);

    this.worker = new Worker<DadosJobRelatorio>(
      NOME_FILA_RELATORIOS,
      async (job) => this.processarJob(job),
      {
        connection: obterOpcoesRedis(),
        concurrency: 2
      }
    );

    this.worker.on("failed", async (job, erro) => {
      if (!job) {
        return;
      }
      const tentativasMax = job.opts.attempts ?? 3;
      const esgotado = job.attemptsMade >= tentativasMax;

      await this.prisma.tarefaRelatorio
        .update({
          where: { id: job.data.tarefaId },
          data: {
            tentativas: job.attemptsMade,
            erroMensagem: erro.message,
            status: esgotado ? StatusTarefa.FALHOU : StatusTarefa.PENDENTE
          }
        })
        .catch(() => undefined);
    });
  }

  private async processarJob(job: Job<DadosJobRelatorio>): Promise<void> {
    const { tarefaId, tipoAnalise, formato, organizacaoId, webhookUrl } = job.data;

    await this.prisma.tarefaRelatorio.update({
      where: { id: tarefaId },
      data: {
        status: StatusTarefa.PROCESSANDO,
        tentativas: job.attemptsMade + 1,
        erroMensagem: null
      }
    });

    const resultado = await this.executarAnalise(tipoAnalise, organizacaoId);
    const exportador = FabricaExportador.criar(formato);
    const arquivo = exportador.exportar(resultado);

    const diretorio = path.join(process.cwd(), "storage", "relatorios");
    await mkdir(diretorio, { recursive: true });
    const caminhoArquivo = path.join(diretorio, `${tarefaId}.${arquivo.extensao}`);
    await writeFile(caminhoArquivo, arquivo.conteudo, "utf-8");

    await this.prisma.tarefaRelatorio.update({
      where: { id: tarefaId },
      data: {
        status: StatusTarefa.CONCLUIDO,
        caminhoArquivo,
        resultadoAnaliticoId: resultado.resultadoAnaliticoId,
        concluidoEm: new Date()
      }
    });

    if (webhookUrl) {
      await this.notificarWebhook(webhookUrl, {
        tarefaId,
        status: StatusTarefa.CONCLUIDO,
        tipoAnalise,
        formato
      });
    }
  }

  private async executarAnalise(tipo: TipoAnalise, organizacaoId?: string) {
    const parametros = { organizacaoId, origemExecucao: "WORKER" };
    switch (tipo) {
      case TipoAnalise.EFICIENCIA_OPERACIONAL:
        return this.analisadorEficiencia.executar(parametros);
      case TipoAnalise.RENTABILIDADE_EQUIPAMENTO:
        return this.analisadorRentabilidade.executar(parametros);
      case TipoAnalise.VIDA_UTIL_PREDITIVA:
        return this.analisadorVidaUtil.executar(parametros);
    }
  }

  private async notificarWebhook(url: string, payload: unknown): Promise<void> {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      return;
    }
  }

  public async fechar(): Promise<void> {
    await this.worker.close();
  }
}
