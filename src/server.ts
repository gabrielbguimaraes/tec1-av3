import { AgendadorAnalitico } from "./analytics/AgendadorAnalitico.js";
import { env } from "./config/env.js";
import { construirApp } from "./http/app.js";
import { prisma } from "./infra/prisma.js";
import { WorkerRelatorios } from "./queue/WorkerRelatorios.js";

async function iniciar(): Promise<void> {
  const app = await construirApp({ prisma });
  const worker = new WorkerRelatorios(prisma);
  const agendador = new AgendadorAnalitico(prisma);

  agendador.iniciar();

  let encerrando = false;
  const shutdown = async (): Promise<void> => {
    if (encerrando) {
      return;
    }
    encerrando = true;
    agendador.parar();
    await worker.fechar();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`greencode API escutando na porta ${env.PORT}`);
}

iniciar().catch(async (erro) => {
  console.error(erro);
  await prisma.$disconnect();
  process.exit(1);
});
