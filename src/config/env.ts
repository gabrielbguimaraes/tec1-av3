import dotenv from "dotenv";

dotenv.config();

const DEFAULT_DATABASE_URL =
  "postgresql://greencode:greencode@localhost:5432/greencode_db?schema=public";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
}

export interface EnvConfig {
  PORT: number;
  DATABASE_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  JWT_SECRET: string;
  API_VERSION: string;
  ENABLE_CRON: boolean;
  CRON_SCHEDULE: string;
}

export const env: EnvConfig = {
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_HOST: process.env.REDIS_HOST ?? "localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT ?? 6379),
  JWT_SECRET: process.env.JWT_SECRET ?? "greencode-jwt-secret-key-2026",
  API_VERSION: process.env.API_VERSION ?? "1.0.0",
  ENABLE_CRON: (process.env.ENABLE_CRON ?? "true").toLowerCase() === "true",
  CRON_SCHEDULE: process.env.CRON_SCHEDULE ?? "0 2 * * *"
};
