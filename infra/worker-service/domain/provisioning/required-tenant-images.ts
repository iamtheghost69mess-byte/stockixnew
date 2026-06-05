/** Docker label on infra/pos-tenant-stack/Dockerfile.pos-frontend-stub */
export const POS_FRONTEND_STUB_LABEL = "io.stockix.image";

/**
 * Finance stack images referenced by infra/tenant-stack/docker-compose.yml.
 * Includes the data-service images (prebuild-mysql, prebuild-redis) — these are
 * locally built tags and do NOT exist on Docker Hub. compose runs with --no-build,
 * so if they are absent Docker attempts a registry pull and gets "access denied".
 * Listing them here causes assertRequiredTenantImages() to fail fast with a clear
 * "run pnpm docker:prebuild" message before compose ever starts.
 */
export const REQUIRED_STOCKIX_TENANT_IMAGES = [
  "stockix-webapp:local",
  "stockix-server:local",
  "stockix-database-migration:local",
  "stockix-nginx:local",
  "stockix-prebuild-mysql:latest",
  "stockix-prebuild-redis:latest",
] as const;

/** POS stack images (infra/pos-tenant-stack) — warn if missing when provisioning POS modules */
export const RECOMMENDED_POS_TENANT_IMAGES = [
  "stockix-pos-backend:local",
  "stockix-pos-frontend:local",
] as const;
