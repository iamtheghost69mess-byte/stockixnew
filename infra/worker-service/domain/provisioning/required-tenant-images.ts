/** Docker label on infra/pos-tenant-stack/Dockerfile.pos-frontend-stub */
export const POS_FRONTEND_STUB_LABEL = "io.stockix.image";

/** Images referenced by infra/tenant-stack/docker-compose.yml (server + database_migration only). */
export const REQUIRED_STOCKIX_TENANT_IMAGES = [
  "stockix-server:local",
  "stockix-database-migration:local",

] as const;

/** POS stack images (infra/pos-tenant-stack) — warn if missing when provisioning POS modules */
export const RECOMMENDED_POS_TENANT_IMAGES = [
  "stockix-pos-backend:local",
  "stockix-pos-frontend:local",
] as const;
