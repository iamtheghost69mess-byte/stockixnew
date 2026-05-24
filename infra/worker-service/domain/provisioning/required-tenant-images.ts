/** Finance stack images referenced by infra/tenant-stack/docker-compose.yml */
export const REQUIRED_STOCKIX_TENANT_IMAGES = [
  "stockix-webapp:local",
  "stockix-server:local",
  "stockix-database-migration:local",
  "stockix-nginx:local",
] as const;

/** POS stack images (infra/pos-tenant-stack) — warn if missing when provisioning POS modules */
export const RECOMMENDED_POS_TENANT_IMAGES = [
  "stockix-pos-backend:local",
  "stockix-pos-frontend:local",
] as const;
