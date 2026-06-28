# @repo/shared Package Diagnostic

> **Scope: audit only — no fixes applied.**

---

## 1. Where @repo/shared actually lives

```
find . -name "package.json" -not -path "*/node_modules/*" | xargs grep -l '"name": "@repo/shared"'
```

**Results (non-worktree):**

| Path | Notes |
|------|-------|
| `./packages/shared/package.json` | ✅ Canonical location — repo root |
| `./services/stockix-finance/packages/shared/package.json` | ⚠ Finance monorepo's own @repo/shared (separate scope) |

Worktree copies (`.claude/worktrees/`) are isolated agents — ignore for this audit.

**Canonical location: `/home/jad/dev/stokcix/stockixnew/packages/shared/`**

---

## 2. packages/shared/package.json — complete content

```json
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
```

**Key facts:**
- `"type": "module"` — ESM package
- No `main`, no `module`, no `files`, no `scripts` — exports-only
- `"./tenant-dns": "./src/tenant-dns.ts"` — **`tenant-dns` IS exported** ✅
- `"./roles": "./src/roles.ts"` — **`roles` IS exported** ✅

---

## 3. packages/shared/tsconfig.json — complete content

```json
{
  "extends": "../typescript-config/base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["es2022"],
    "typeRoots": ["./node_modules/@types", "../../node_modules/@types"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

---

## 4. Files in packages/shared/src/

```
total 64
drwxr-xr-x 2 jad jad 4096 Jun 28 02:39 .
drwxr-xr-x 4 jad jad 4096 Jun 15 00:19 ..
-rw-r--r-- 1 jad jad 3298 Jun 19 20:09 audit-log.ts
-rw-r--r-- 1 jad jad 1042 May 28 00:51 deployment-secrets.test.ts
-rw-r--r-- 1 jad jad 4715 Jun 21 00:55 deployment-secrets.ts
-rw-r--r-- 1 jad jad 2042 Jun 21 00:10 feature-flags.ts
-rw-r--r-- 1 jad jad 1705 May 28 00:51 finance-api.ts
-rw-r--r-- 1 jad jad 2492 May 28 00:51 permissions.ts
-rw-r--r-- 1 jad jad 1275 May 28 00:51 pos-entitlements-from-modules.test.ts
-rw-r--r-- 1 jad jad 1557 May 28 00:51 pos-entitlements-from-modules.ts
-rw-r--r-- 1 jad jad  295 May 28 00:51 roles.ts
-rw-r--r-- 1 jad jad 1984 Jun 19 15:16 structured-logger.ts
-rw-r--r-- 1 jad jad 1180 May 28 00:51 stxi-license-key.test.ts
-rw-r--r-- 1 jad jad 3298 May 28 00:51 stxi-license-key.ts
-rw-r--r-- 1 jad jad  875 Jun 28 02:39 tenant-dns.ts
```

**`tenant-dns.ts` exists ✅ — located at `packages/shared/src/tenant-dns.ts`**

### Content of tenant-dns.ts

```typescript
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
```

---

## 5. pnpm-workspace.yaml — complete content

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/pms"
  - "services/pms/frontend"
  - "services/stockix-finance"
  - "services/stockix-finance/packages/*"
  - "services/stockix-finance/shared/*"
```

`packages/*` covers `packages/shared` → `@repo/shared` is a valid workspace member ✅

---

## 6. Root tsconfig paths

**There is no root-level `tsconfig.json` or `tsconfig.base.json`.**

The shared base config lives at `packages/typescript-config/base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "incremental": false,
    "isolatedModules": true,
    "lib": ["es2022", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2022"
  }
}
```

**This base config has NO `paths` and NO `baseUrl`.** Resolution of `@repo/shared` depends entirely on each consuming package's own tsconfig and `node_modules` symlinks from pnpm.

---

## 7. @repo/shared imports in apps/api/src/

```
apps/api/src/org-access-scope.ts:3:         import { hasPermission } from "@repo/shared/permissions";
apps/api/src/routes/feature-flags.ts:8:     import { invalidateFlagCache } from "@repo/shared/feature-flags";
apps/api/src/routes/admin.ts:15:            import { ROLES } from "@repo/shared/roles";
apps/api/src/routes/api-keys.ts:3:          import { ALL_PERMISSIONS, hasPermission } from "@repo/shared/permissions";
apps/api/src/routes/audit-log.ts:11:        import { ... } from "@repo/shared/audit-log";
apps/api/src/routes/platform-roles.ts:3:    import { ALL_PERMISSIONS, hasPermission } from "@repo/shared/permissions";
apps/api/src/routes/auth/index.ts:9:        import { capabilitiesFromPermissions } from "@repo/shared/permissions";
apps/api/src/license-utils.ts:2:            import { generateStxiLicenseKey } from "@repo/shared/stxi-license-key";
apps/api/src/finance-tenant-resolve.ts:2:   import { normalizeFinanceApiJson } from "@repo/shared/finance-api";
apps/api/src/middleware/rbac.ts:4-5:        import { ROLE_RANK, type Role } from "@repo/shared/roles";
apps/api/src/middleware/auth.ts:2:          import { ROLES } from "@repo/shared/roles";
apps/api/src/permissions/*.ts:              import { PERMISSIONS, ... } from "@repo/shared/permissions";
apps/api/src/lib/provision-events.ts:5:     import { decryptDeploymentSecret } from "@repo/shared/deployment-secrets";
apps/api/src/lib/logger.ts:1:              import { logger } from "@repo/shared/structured-logger";
apps/api/src/routes/tenants-shared.ts:44-45: import { decryptDeploymentSecret, ROLE_RANK } from "@repo/shared/*";
```

✅ Most api files use `@repo/shared/*` correctly via package imports.

**⚠ Six files use WRONG relative path imports instead:**

| File | Import used | Correct import |
|------|------------|----------------|
| `apps/api/src/finance-license.client.ts:156` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/pos-public-url.ts:3` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/internal.ts:2` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/pms-proxy-http.ts:30` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/pos-proxy-http.ts:24` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/auth/index.ts:10` | `"../../../packages/shared/src/roles.js"` | `"@repo/shared/roles"` |

---

## 8. @repo/shared imports in worker

```
infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.ts:4:
    import { encryptDeploymentSecret } from "@repo/shared/deployment-secrets";
infra/worker-service/domain/provisioning/adapters/seed-finance-pos-defaults.ts:1:
    import { parseFinanceApiJsonText } from "@repo/shared/finance-api";
infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts:1:
    import { parseFinanceApiJsonText } from "@repo/shared/finance-api";
infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts:2-3:
    import { buildPosEntitlementsForProvision } from "@repo/shared/pos-entitlements-from-modules";
    import { buildTenantServiceUrl } from "@repo/shared/tenant-dns";
infra/worker-service/domain/provisioning/adapters/activate-finance-warehouses.ts:1:
    import { parseFinanceApiJsonText } from "@repo/shared/finance-api";
infra/worker-service/domain/provisioning/adapters/finance-auth-client.ts:1:
    import { normalizeFinanceApiJson } from "@repo/shared/finance-api";
infra/worker-service/src/provision-runtime.ts:13:
    import { decryptDeploymentSecret, encryptDeploymentSecret } from "@repo/shared/deployment-secrets";
infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts:1:
    import { normalizeFinanceApiJson } from "@repo/shared/finance-api";
infra/worker-service/domain/provisioning/adapters/copy-coa-across-stacks.ts:1:
    import { parseFinanceApiJsonText } from "@repo/shared/finance-api";
infra/worker-service/src/lib/logger.ts:1:
    import { logger as structuredLogger } from "@repo/shared/structured-logger";
infra/worker-service/src/org-provision-runtime.ts:5:
    import { ... } from "@repo/shared/finance-api";
infra/worker-service/src/provisioning-workflows/utils.ts:3:
    import { encryptDeploymentSecret, decryptDeploymentSecret } from "@repo/shared/deployment-secrets";
```

✅ **Worker has ZERO relative path imports to `packages/shared`.** All worker imports use `@repo/shared/*` correctly.

---

## 9. apps/api tsconfig.json — complete

```json
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
```

**Critical observations:**
- Extends `@repo/typescript-config/base.json` which has **no `paths`, no `baseUrl`**
- `"rootDir": "src"` — TypeScript will refuse to include files from outside `apps/api/src/` during compilation (causes TS6059)
- `"noEmit": false` — this is the build tsconfig, not a type-check-only config
- **No `paths` section** — resolution of `@repo/shared` relies entirely on pnpm workspace symlinks in `node_modules`

---

## 10. infra/worker-service tsconfig.json — complete

```json
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
```

**Critical observations:**
- `"baseUrl": "../../"` → repo root (`infra/worker-service/` is 2 levels down)
- `"@repo/shared/*": ["packages/shared/src/*"]` → resolves to `<repo-root>/packages/shared/src/*` ✅
- `"moduleResolution": "Bundler"` — more permissive than NodeNext; accepts `.ts` imports without extensions
- **No rootDir constraint** — worker can include files from anywhere under `include` patterns

---

## 11. Path alias drift analysis

### Searching `apps/` for relative packages/shared references

```bash
grep -rn "packages/shared" apps/ --include="*.json" | grep -v node_modules
```
**Result: (no output) — no JSON file in apps/ references `packages/shared`**

The relative imports are all in TypeScript source files, not tsconfigs or package.jsons.

### Searching `infra/` for packages/shared references in JSON

```bash
grep -rn "packages/shared" infra/ --include="*.json" | grep -v node_modules
```
**Result:**
```
infra/worker-service/tsconfig.json:11:  "@repo/shared/*": ["packages/shared/src/*"]
```

This is **correct** — it is the intentional tsconfig path alias with `baseUrl: "../../"` (repo root).

### The actual source of the bug

The 6 broken imports all live in TypeScript `.ts` files added recently, not in config files. They bypass the package exports map and use filesystem-relative paths instead.

---

## 12. @repo/shared exports map — does it export ./tenant-dns?

```json
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
}
```

✅ **`./tenant-dns` IS exported** from `@repo/shared`.  
✅ **`./roles` IS exported** from `@repo/shared`.

Both symbols needed by the broken files are accessible via proper `@repo/shared/tenant-dns` and `@repo/shared/roles` imports.

---

## 13. TypeScript check results

### `cd apps/api && npx tsc --noEmit`

```
src/finance-license.client.ts(156,39): error TS6059:
  File '.../packages/shared/src/tenant-dns.ts' is not under 'rootDir' '.../apps/api/src'.
  'rootDir' is expected to contain all source files.
  The file is in the program because:
    Imported via "../../../packages/shared/src/tenant-dns.js" from file
      '.../apps/api/src/finance-license.client.ts'
    Imported via "../../../packages/shared/src/tenant-dns.js" from file
      '.../apps/api/src/pos-public-url.ts'

src/routes/auth/index.ts(10,34): error TS2307:
  Cannot find module '../../../packages/shared/src/roles.js'
  or its corresponding type declarations.

src/routes/internal.ts(2,39): error TS2307:
  Cannot find module '../../../packages/shared/src/tenant-dns.js'
  or its corresponding type declarations.

src/routes/pms-proxy-http.ts(30,39): error TS2307:
  Cannot find module '../../../packages/shared/src/tenant-dns.js'
  or its corresponding type declarations.

src/routes/pos-proxy-http.ts(24,39): error TS2307:
  Cannot find module '../../../packages/shared/src/tenant-dns.js'
  or its corresponding type declarations.
```

**Error taxonomy:**

| Error | Files | Root cause |
|-------|-------|-----------|
| TS6059 "not under rootDir" | `finance-license.client.ts`, `pos-public-url.ts` | Path resolves correctly to real file, but TypeScript rejects it because `packages/shared/src/` is outside `apps/api/src/` (the configured `rootDir`) |
| TS2307 "cannot find module" | `routes/internal.ts`, `routes/pms-proxy-http.ts`, `routes/pos-proxy-http.ts`, `routes/auth/index.ts` | Path resolves to a non-existent location (wrong number of `../` levels) |

### `cd infra/worker-service && npx tsc --noEmit`

```
src/provision-runtime.ts(1607,17): error TS2322:
  Type 'number | undefined' is not assignable to type 'number'.
  Type 'undefined' is not assignable to type 'number'.

src/provision-runtime.ts(1614,19): error TS2339:
  Property 'warn' does not exist on type '(m: string) => void'.
```

✅ **Zero errors related to `@repo/shared`.** Worker resolves `@repo/shared` correctly via tsconfig paths.  
The 2 worker errors are unrelated type issues in `provision-runtime.ts` at lines 1607 and 1614.

---

## 14. Summary

### Where `@repo/shared` package.json actually lives
**`packages/shared/package.json`** — at repo root. Absolute path:  
`/home/jad/dev/stokcix/stockixnew/packages/shared/package.json`

### What the correct absolute path to `tenant-dns.ts` is
`/home/jad/dev/stokcix/stockixnew/packages/shared/src/tenant-dns.ts`  
✅ The file exists. ✅ It is exported as `"./tenant-dns"` in the package exports map.

### Why the error shows `apps/packages/shared` instead of `packages/shared`

**Exact path math:**

The 3 files in `apps/api/src/routes/` use `"../../../packages/shared/src/tenant-dns.js"`:

```
Starting directory: apps/api/src/routes/
../          → apps/api/src/
../../       → apps/api/
../../../    → apps/              ← STOPS HERE (only 3 levels)
../../../packages/shared/src/tenant-dns.js
           → apps/packages/shared/src/tenant-dns.js  ← DOES NOT EXIST
```

They needed one more level: `"../../../../packages/shared/src/tenant-dns.js"` to escape to the repo root.

The `routes/auth/index.ts` is one level deeper:

```
Starting directory: apps/api/src/routes/auth/
../../../    → apps/api/           ← only 3 levels
../../../packages/shared/src/roles.js
           → apps/api/packages/shared/src/roles.js  ← DOES NOT EXIST
```

This is where the `apps/packages/shared` path in the original error originates.

### What needs to change to fix the resolution

All 6 broken imports should be changed from relative paths to package imports:

| File | Current (BROKEN) | Should be |
|------|-----------------|-----------|
| `apps/api/src/finance-license.client.ts:156` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/pos-public-url.ts:3` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/internal.ts:2` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/pms-proxy-http.ts:30` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/pos-proxy-http.ts:24` | `"../../../packages/shared/src/tenant-dns.js"` | `"@repo/shared/tenant-dns"` |
| `apps/api/src/routes/auth/index.ts:10` | `"../../../packages/shared/src/roles.js"` | `"@repo/shared/roles"` |

`@repo/shared` is already declared as `"workspace:*"` in `apps/api/package.json` — no dependency change needed.

### Whether `tenant-dns.ts` is exported from the shared package exports map
**YES.** `"./tenant-dns": "./src/tenant-dns.ts"` is present in `packages/shared/package.json`.

### Whether `roles.ts` is exported from the shared package exports map
**YES.** `"./roles": "./src/roles.ts"` is present in `packages/shared/package.json`.

### Whether any tsconfig path alias is pointing to the wrong location
**No tsconfig path aliases are wrong.**

- `packages/typescript-config/base.json` (shared base): no paths, no baseUrl — correct
- `apps/api/tsconfig.json`: no paths, no baseUrl — resolves `@repo/shared` via pnpm workspace symlinks in `node_modules` — correct
- `infra/worker-service/tsconfig.json`: `baseUrl: "../../"` (repo root) + `"@repo/shared/*": ["packages/shared/src/*"]` — correctly points to `packages/shared/src/` — correct

**The bug is entirely in TypeScript source files, not in tsconfig paths.** Six recently-added files in `apps/api/src/` bypass the `@repo/shared` package system and use raw filesystem-relative imports. Three of those files use the wrong `../` depth, placing the resolved path inside the non-existent `apps/packages/` directory.
