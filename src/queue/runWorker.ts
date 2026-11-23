import { prisma } from "../infra/prisma.js";
import { WorkerRelatorios } from "./WorkerRelatorios.js";

const worker = new WorkerRelatorios(prisma);

async function encerrar(): Promise<void> {
  await worker.fechar();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);

console.log("Worker greencode iniciado na fila relatorios-analiticos");
