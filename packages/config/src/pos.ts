import { env } from "./env.js";

export const posConfig = {
  /** Base URL for POS platform API — used by apps/api proxy routes */
  platformBaseUrl: process.env.POS_PLATFORM_BASE_URL ?? "http://localhost:8010",
  /** Service API key for Stockix → POS server-to-server calls */
  platformApiKey: process.env.POS_PLATFORM_API_KEY ?? "",
  /** Absolute path to POS app root for worker provisioning */
  appRoot: process.env.POS_APP_ROOT ?? "services/posnew",
  /** Public URL of the POS frontend (used in error messages / provisioning payloads) */
  get frontendUrl() {
    return env.POS_FRONTEND_URL ?? "";
  },
} as const;
