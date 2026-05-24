/** Finance stack images referenced by infra/tenant-stack/docker-compose.yml */
export const REQUIRED_STOCKIX_TENANT_IMAGES = [
  "stockix-webapp:local",
  "stockix-server:local",
  "stockix-database-migration:local",
  "stockix-nginx:local",
] as const;
