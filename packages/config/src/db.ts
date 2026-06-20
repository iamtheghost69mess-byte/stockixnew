import { env, readRequiredString } from "./env.js";

export const dbConfig = {
  get databaseUrl() {
    return env.DATABASE_URL ?? readRequiredString("DATABASE_URL");
  },
  get waitTimeoutMs() {
    return env.DB_WAIT_TIMEOUT_MS;
  },
} as const;
