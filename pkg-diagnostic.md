### 1. find . -name 'package.json' -not -path '*/node_modules/*' | xargs grep -l '"name": "@repo/shared"' 2>/dev/null
./packages/shared/package.json
./services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-a774dc62ac938ecea/packages/shared/package.json
./.claude/worktrees/agent-a774dc62ac938ecea/services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-a9496aa30896c2060/packages/shared/package.json
./.claude/worktrees/agent-a9496aa30896c2060/services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-a1a3d39a7fd48d178/packages/shared/package.json
./.claude/worktrees/agent-a1a3d39a7fd48d178/services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-aaacc46c772525ff0/packages/shared/package.json
./.claude/worktrees/agent-aaacc46c772525ff0/services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-a8643e5780cb55460/packages/shared/package.json
./.claude/worktrees/agent-a8643e5780cb55460/services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-aa2524a669e430f71/packages/shared/package.json
./.claude/worktrees/agent-aa2524a669e430f71/services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-af94ccfcc56aba792/packages/shared/package.json
./.claude/worktrees/agent-af94ccfcc56aba792/services/stockix-finance/packages/shared/package.json
./.claude/worktrees/agent-a0778551d56d9ebd8/packages/shared/package.json
./.claude/worktrees/agent-a0778551d56d9ebd8/services/stockix-finance/packages/shared/package.json

### 2. cat packages/shared/package.json
{
  "name": "@repo/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./roles": "./src/roles.ts",
    "./permissions": "./src/permissions.ts",
    "./stxi-license-key": "./src/stxi-license-key.ts",
    "./audit-log": "./src/audit-log.ts",
    "./finance-api": "./src/finance-api.ts",
    "./pos-entitlements-from-modules": "./src/pos-entitlements-from-modules.ts",
    "./deployment-secrets": "./src/deployment-secrets.ts",
    "./structured-logger": "./src/structured-logger.ts",
    "./feature-flags": "./src/feature-flags.ts",
    "./tenant-dns": "./src/tenant-dns.ts"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "drizzle-orm": "^0.45.1",
    "ioredis": "^5.4.2"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "vitest": "^4.1.5"
  }
}

### 3. cat packages/shared/src/tenant-dns.ts
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

### 4. find . -name 'tenant-dns.ts' -not -path '*/node_modules/*'
./packages/shared/src/tenant-dns.ts
./services/stockix-finance/packages/shared/src/tenant-dns.ts

### 5. cat pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/pms"
  - "services/pms/frontend"
  - "services/stockix-finance"
  - "services/stockix-finance/packages/*"
  - "services/stockix-finance/shared/*"

### 6. grep -rn 'paths' tsconfig.base.json 2>/dev/null || grep -rn 'paths' tsconfig.json 2>/dev/null

### 7. cat apps/api/tsconfig.json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false,
    "declaration": false,
    "declarationMap": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
### 8. cat infra/worker-service/tsconfig.json
{
  "extends": "../../packages/typescript-config/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "baseUrl": "../../",
    "paths": {
      "@repo/config": ["packages/config/src/index.ts"],
      "@repo/db": ["packages/db/src/index.ts"],
      "@repo/db/*": ["packages/db/src/*"],
      "@repo/shared/*": ["packages/shared/src/*"]
    }
  },
  "include": ["src/**/*.ts", "domain/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}

### 9. grep -rn 'packages/shared' apps/ infra/ --include='*.json' | grep -v node_modules
infra/worker-service/tsconfig.json:11:      "@repo/shared/*": ["packages/shared/src/*"]

### 10. grep -rn '@repo/shared' apps/api/src/ infra/worker-service/ --include='*.ts' | head -20
apps/api/src/finance-license.client.ts:156:import { buildTenantServiceUrl } from "@repo/shared/tenant-dns";
apps/api/src/pos-public-url.ts:3:import { buildTenantServiceUrl } from "@repo/shared/tenant-dns";
apps/api/src/routes/platform-roles.ts:3:import { ALL_PERMISSIONS, hasPermission } from "@repo/shared/permissions";
apps/api/src/routes/pos-proxy-http.ts:24:import { buildTenantServiceUrl } from "@repo/shared/tenant-dns";
apps/api/src/routes/feature-flags.ts:8:import { invalidateFlagCache } from "@repo/shared/feature-flags";
apps/api/src/routes/pms-proxy-http.ts:30:import { buildTenantServiceUrl } from "@repo/shared/tenant-dns";
apps/api/src/routes/auth/index.ts:9:import { capabilitiesFromPermissions } from "@repo/shared/permissions";
apps/api/src/routes/admin.ts:15:import { ROLES } from "@repo/shared/roles";
apps/api/src/routes/tenants-shared.ts:44:import { decryptDeploymentSecret } from "@repo/shared/deployment-secrets";
apps/api/src/routes/tenants-shared.ts:45:import { ROLE_RANK, type Role } from "@repo/shared/roles";
apps/api/src/routes/owners.ts:12:import { ROLES } from "@repo/shared/roles";
apps/api/src/routes/api-keys.ts:3:import { ALL_PERMISSIONS, hasPermission } from "@repo/shared/permissions";
apps/api/src/routes/internal.ts:2:import { buildTenantServiceUrl } from "@repo/shared/tenant-dns";
apps/api/src/routes/audit-log.ts:11:} from "@repo/shared/audit-log";
apps/api/src/org-access-scope.ts:3:import { hasPermission } from "@repo/shared/permissions";
apps/api/src/middleware/rbac.ts:4:import { ROLE_RANK, type Role } from "@repo/shared/roles";
apps/api/src/middleware/rbac.ts:5:import { hasAllPermissions } from "@repo/shared/permissions";
apps/api/src/middleware/auth.ts:2:import { ROLES } from "@repo/shared/roles";
apps/api/src/permissions/route-permissions.ts:1:import type { Permission } from "@repo/shared/permissions";
apps/api/src/permissions/resolve-owner-permissions.ts:2:import { permissionsForRoleSlug } from "@repo/shared/permissions";
