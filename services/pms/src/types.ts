import type { StockixTokenPayload } from "@repo/auth";

/** Hono environment type shared across all PMS route modules. */
export type PmsEnv = {
  Variables: {
    stockix: StockixTokenPayload;
  };
};
