import { env } from "./env.js";

export const pmsConfig = {
  /** Port the PMS Hono service listens on */
  port: parseInt(process.env.PMS_PORT ?? "3003", 10),
  /** Base URL for PMS API — used by apps/api proxy routes */
  baseUrl: process.env.PMS_BASE_URL ?? "http://localhost:3003",
  /** Absolute path to PMS app root for worker provisioning */
  appRoot: process.env.PMS_APP_ROOT ?? "services/pms",
  /** How often iCal feeds are synced in milliseconds */
  icalSyncIntervalMs: parseInt(process.env.PMS_ICAL_SYNC_INTERVAL_MS ?? "600000", 10),
  /** Google Gemini API key for passport OCR (optional) */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** Internal base URL for Finance API (used by PMS finance-sync). */
  financeInternalBaseUrl: process.env.FINANCE_INTERNAL_BASE_URL ?? "http://localhost:3000",
  /**
   * Dedicated PMS database URL (ADR-002).
   * Falls back to the shared control-plane DATABASE_URL when unset.
   */
  get databaseUrl(): string | undefined {
    const pmsUrl = process.env.PMS_DATABASE_URL?.trim();
    return pmsUrl || env.DATABASE_URL;
  },
} as const;
