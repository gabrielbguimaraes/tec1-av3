import { PrismaClient } from "@prisma/client";
import cron, { ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { AnalisadorEficienciaOperacional } from "./AnalisadorEficienciaOperacional.js";
import { AnalisadorRentabilidadeEquipamento } from "./AnalisadorRentabilidadeEquipamento.js";
import { AnalisadorVidaUtilPreditivo } from "./AnalisadorVidaUtilPreditivo.js";

export class AgendadorAnalitico {
  private tarefa: ScheduledTask | null = null;
  private readonly analisadorEficiencia: AnalisadorEficienciaOperacional;
  private readonly analisadorRentabilidade: AnalisadorRentabilidadeEquipamento;
  private readonly analisadorVidaUtil: AnalisadorVidaUtilPreditivo;

  constructor(prisma: PrismaClient) {
    this.analisadorEficiencia = new AnalisadorEficienciaOperacional(prisma);
    this.analisadorRentabilidade = new AnalisadorRentabilidadeEquipamento(prisma);
    this.analisadorVidaUtil = new AnalisadorVidaUtilPreditivo(prisma);
  }

  public iniciar(): void {
    if (!env.ENABLE_CRON || this.tarefa) {
      return;
    }

    this.tarefa = cron.schedule(env.CRON_SCHEDULE, async () => {
      await this.executarCiclo();
    });
  }

  public async executarCiclo(): Promise<void> {
    await this.analisadorEficiencia.executar({ origemExecucao: "CRON" });
    await this.analisadorRentabilidade.executar({ origemExecucao: "CRON" });
    await this.analisadorVidaUtil.executar({ origemExecucao: "CRON" });
  }

  public parar(): void {
    if (this.tarefa) {
      this.tarefa.stop();
      this.tarefa = null;
    }
  }
}
