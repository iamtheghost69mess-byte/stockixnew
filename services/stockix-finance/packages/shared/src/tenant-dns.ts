/**
 * Builds the Docker Swarm DNS name for a tenant service.
 * Pattern: stockix_tenant_{slug}_{service}:{port}
 * Example: stockix_tenant_acme_corp_pos-backend:8010
 *
 * NEVER use 127.0.0.1 or localhost for inter-container communication.
 * This is the single source of truth for all tenant service URL construction.
 */
export function buildTenantServiceUrl(
  slug: string,
  service: 'pos-backend' | 'pos-frontend' | 'finance-server' | 'pms-api' | 'pms-frontend' | 'server',
  port: number
): string {
  // Replace hyphens with underscores per swarm spec
  const normalizedSlug = slug.replace(/-/g, '_');
  const stackName = `stockix_tenant_${normalizedSlug}`;
  // Finance service is named "server" in tenant-stack/docker-compose.yml
  const actualService = service === 'finance-server' ? 'server' : service;
  return `http://${stackName}_${actualService}:${port}`;
}
