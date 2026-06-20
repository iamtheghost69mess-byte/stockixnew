// Ensure env bootstrapping runs before any env reads in this module.
import "./env";

export const chatwootConfig = {
  /** Public URL of the shared Chatwoot instance */
  baseUrl: process.env.CHATWOOT_BASE_URL ?? "",
  /** Super admin API token for account provisioning */
  apiAccessToken: process.env.CHATWOOT_API_ACCESS_TOKEN ?? "",
  /** Rails SECRET_KEY_BASE */
  secretKeyBase: process.env.CHATWOOT_SECRET_KEY_BASE ?? "",
  /** Brand name shown in Chatwoot UI */
  brandName: process.env.CHATWOOT_BRAND_NAME ?? "Stockix",
  /** Installation name for Chatwoot telemetry */
  installationName: process.env.CHATWOOT_INSTALLATION_NAME ?? "Stockix",
} as const;
