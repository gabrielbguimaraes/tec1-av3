import { Redis } from "ioredis";
import { env } from "../config/env.js";

export function obterOpcoesRedis() {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: null
  };
}

export async function verificarConexaoRedis(): Promise<boolean> {
  const cliente = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1
  });

  try {
    await cliente.connect();
    const pong = await cliente.ping();
    return pong === "PONG";
  } finally {
    cliente.disconnect();
  }
}
