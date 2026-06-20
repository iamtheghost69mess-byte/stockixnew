# Stockix — Remediation Plan

**Based on:** `architecturefile.md` (audit dated 2026-06-20)  
**Document type:** Engineering Remediation Plan — READ ONLY, NO CODE CHANGES  
**Scope:** All findings from the full architecture audit  
**Methodology:** Issues are grouped by criticality tier, each with exact affected files, root cause, step-by-step resolution instructions, acceptance criteria, effort estimate, and inter-issue dependencies.

---

## How to Read This Document

Each issue card follows this structure:

```
Issue ID     — Unique identifier (used for dependency tracking)
Title        — What is wrong
Severity     — CRITICAL / HIGH / MEDIUM / LOW
Effort       — S (< 1 day), M (1 week), L (1 month), XL (1 quarter+)
Depends on   — Other issue IDs that must be resolved first
Root Cause   — Why this exists
Affected     — Exact files / directories
Resolution   — Step-by-step instructions
Acceptance   — How to verify the fix is complete
```

---

## Remediation Tiers

| Tier | Label | Timeline |
|------|-------|----------|
| 0 | **BLOCKER** — Security / data integrity violations | Immediately |
| 1 | **URGENT** — Repository hygiene, naming collisions | This sprint |
| 2 | **HIGH** — Architecture standards, API contracts | Next sprint |
| 3 | **MEDIUM** — Developer experience, observability | Next quarter |
| 4 | **LONG-TERM** — Scaling, framework unification | 6–12 months |

---

## TIER 0 — BLOCKERS

---

### ISSUE-001 · `C:\` Windows Path Directory Committed to Repository

**Severity:** CRITICAL  
**Effort:** S  
**Depends on:** Nothing

**Root Cause:**  
A Windows absolute path (`C:\Users\Jad\Desktop\stokcix\stockixnew\services\stockix-finance`) was accidentally committed as a directory to the repository root, likely from a `git add` on a Windows development machine that treated the path string as a literal directory name.

**Affected:**
```
stockixnew/C:                              (literal directory)
stockixnew/C:/Users/                       (subtree)
stockixnew/C:\Users\Jad\Desktop\stokcix\stockixnew\services\stockix-finance/
  └── data/
  └── docker/
```

**Resolution — Step by Step:**

1. **Audit what is inside the directories before deletion.**
   ```bash
   find "C:" -type f | sort
   find "C:\\Users\\Jad\\Desktop\\stokcix\\stockixnew\\services\\stockix-finance" -type f | sort
   ```
   Confirm no legitimate project files were placed there.

2. **Remove from git history using BFG Repo Cleaner (preferred) or `git filter-repo`.**
   ```bash
   # Option A — BFG (faster, safer)
   java -jar bfg.jar --delete-folders "C:" --no-blob-protection
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive

   # Option B — git filter-repo (requires Python tool)
   git filter-repo --path "C:" --invert-paths
   ```

3. **Force-push all branches** after history rewrite (coordinate with all team members to re-clone).

4. **Verify removal.**
   ```bash
   git log --all --full-history -- "C:" | wc -l
   # Should return 0
   ```

5. **Add to `.gitignore`** to prevent recurrence:
   ```
   # Windows path artifacts
   C:/
   C:\
   ```

**Acceptance Criteria:**
- `find . -maxdepth 1 -name "C:" -o -name "C:\\" | wc -l` returns `0`
- `git log --all -- "C:"` returns no commits
- `.gitignore` contains the Windows path patterns

---

### ISSUE-002 · PMS Guest Data Co-Located with Control-Plane Database

**Severity:** CRITICAL  
**Effort:** XL  
**Depends on:** Nothing (can plan independently; must be sequenced carefully in execution)

**Root Cause:**  
The PMS domain (properties, bookings, guests with passport/visa/DOB fields) was built on top of the control-plane PostgreSQL database to accelerate development. A `TODO(security)` comment in the codebase acknowledges this is a security violation. The control-plane DB is accessible to SaaS operators who manage tenants — it should never contain tenant guest PII.

**Affected:**
```
packages/db/src/schema.ts                   — All pms_* table definitions (lines 663–1194)
services/pms/src/db.ts                      — Shares @repo/db connection
services/pms/src/routes/*.ts                — All route files use @repo/db/schema imports
services/pms/src/lib/finance-sync.ts        — Reads pmsBookings, pmsPayments
services/pms/src/ical/sync.ts               — Reads pmsCalendarEvents, pmsIcalChannels
packages/db/src/migrations/                  — PMS migration files will need splitting
```

**Resolution — Step by Step:**

1. **Database isolation strategy decision (choose one):**
   - **Option A (Recommended for current scale):** Dedicated per-tenant PMS PostgreSQL schema within the shared Postgres instance, enforced via Row-Level Security (RLS) with a `pms_app` role that has `BYPASSRLS=false`.
   - **Option B (Enterprise-grade):** Separate PostgreSQL instance per tenant for PMS, provisioned alongside the Finance stack. Higher operational cost but complete isolation.
   - **Option C (Simplest migration path):** Move PMS tables to a separate `stockix_pms` database on the same Postgres server, with strict app-level tenant scoping. Maintains current infra topology but separates schemas.

2. **Create a new dedicated `@repo/pms-db` package** (or `packages/pms-db/`):
   - Move all `pms_*` table definitions out of `packages/db/src/schema.ts`
   - Create a new Drizzle schema file: `packages/pms-db/src/schema.ts`
   - Define a new Drizzle client configured against the PMS-specific database

3. **Update `services/pms/` to use `@repo/pms-db` instead of `@repo/db`:**
   - Change all imports: `from "@repo/db/schema"` → `from "@repo/pms-db/schema"`
   - Update `services/pms/src/db.ts` to connect to the PMS database URL

4. **Remove `pms_*` tables from `packages/db/src/schema.ts`:**
   - Also remove `pmsAuditLog` which currently lives alongside `adminAuditLog`
   - Write a database migration that copies existing PMS data from the control-plane DB to the new PMS DB

5. **Update provisioning worker** to create/drop the PMS database alongside Finance database on tenant provision/delete:
   - Files: `apps/api/src/org-provision.ts`, infra-worker provisioning logic

6. **Update control-plane API** routes that proxy to PMS — remove any direct DB queries to PMS tables from `apps/api/src/routes/`:
   - PMS data must only be accessed via the PMS service API, never via direct DB query from the control plane

7. **Run data migration** (staging first, then production):
   ```sql
   -- Example: copy pms_properties from stockix_platform to stockix_pms
   INSERT INTO stockix_pms.pms_properties SELECT * FROM stockix_platform.pms_properties;
   -- Repeat for all 19 PMS tables
   ```

8. **Update infra:** Add `PMS_DATABASE_URL` env var to `infra/prod/docker-compose.yml` for the PMS service.

**Acceptance Criteria:**
- `grep -r "pms_" packages/db/src/schema.ts | wc -l` returns `0`
- PMS service connects to a different `DATABASE_URL` than the control plane
- A SaaS operator querying the control-plane DB sees zero PMS tables
- All existing PMS functionality works via the PMS service

---

### ISSUE-003 · All Secrets in Environment Variables — No Secrets Manager

**Severity:** HIGH (classified as Tier 0 due to compliance risk)  
**Effort:** L  
**Depends on:** Nothing

**Root Cause:**  
All production secrets (JWT keys, database passwords, API keys, encryption keys) are passed as Docker Compose environment variables sourced from `.env` files on the server filesystem. There is no audit trail for secret access, no automatic rotation, and no central revocation capability.

**Affected:**
```
infra/prod/docker-compose.yml               — All environment blocks
infra/prod/.env (on server, not in repo)    — Secret values at rest
infra/tenant-stack/docker-compose.yml       — Per-tenant secrets
packages/config/src/index.ts               — All readOptionalString() / readRequiredString() calls
```

**Resolution — Step by Step:**

1. **Choose a secrets backend:**
   - **Option A (AWS-native):** AWS Secrets Manager + IAM instance role on the EC2 instance
   - **Option B (Self-hosted):** HashiCorp Vault in dev mode → production mode
   - **Option C (Minimum viable):** `docker secret` with Docker Swarm (if migrating to Swarm)

2. **Categorize secrets by rotation frequency:**
   ```
   HIGH rotation (quarterly):
     - PLATFORM_API_SECRET
     - WORKER_SECRET
     - AUTH_TOKEN_SECRET
     - SESSION_SECRET
     - LICENSE_SIGNING_SECRET
     - DEPLOYMENT_SECRET_KEY

   MEDIUM rotation (annually or on breach):
     - POSTGRES_PASSWORD
     - SHARED_MYSQL_ROOT_PASSWORD
     - TENANT_REDIS_PASSWORD
     - CF_DNS_API_TOKEN

   LOW rotation (per-tenant, set once):
     - Per-tenant JWT_SECRET
     - Per-tenant DB_PASSWORD
     - Per-tenant mysqlPassword / mysqlRootPassword (in tenant_deployments table)
   ```

3. **Implement secret fetching at container startup** — use an init container or entrypoint wrapper:
   ```bash
   # entrypoint-wrapper.sh (AWS Secrets Manager example)
   export PLATFORM_API_SECRET=$(aws secretsmanager get-secret-value \
     --secret-id stockix/prod/platform-api-secret --query SecretString --output text)
   exec node dist/index.js
   ```

4. **Migrate per-tenant secrets** — the `tenant_deployments` table already stores `mysqlPassword`, `mysqlRootPassword`, `jwtSecret`, and `financeAdminPassword` as `enc:v1:*` encrypted values using `DEPLOYMENT_SECRET_KEY`. This is good practice. Extend this pattern to also store the `DEPLOYMENT_SECRET_KEY` itself in the secrets manager.

5. **Update `@repo/config/src/index.ts`** — no changes needed to the config API itself; secrets are still passed as env vars at runtime, just sourced from the secrets manager instead of a `.env` file.

6. **Add secret rotation runbook** to `docs/`:
   - How to rotate each secret
   - How to deploy without downtime during rotation

**Acceptance Criteria:**
- No production secret values exist in `.env` files on the server filesystem (only references to secrets manager paths)
- Secret rotation for `PLATFORM_API_SECRET` can be performed without a full deploy
- Access to secrets is logged and auditable

---

## TIER 1 — URGENT

---

### ISSUE-004 · Duplicate `@repo/shared` Package Name Collision

**Severity:** HIGH  
**Effort:** S  
**Depends on:** Nothing

**Root Cause:**  
`services/stockix-finance/packages/shared/package.json` declares `"name": "@repo/shared"` — identical to `packages/shared/package.json`. The `pnpm-workspace.yaml` uses a `!` exclusion to prevent the finance copy from being hoisted, but this is fragile. Any developer who modifies the workspace config or adds a new consumer inside the finance sub-monorepo could accidentally resolve the wrong package.

**Affected:**
```
services/stockix-finance/packages/shared/package.json      — Name field
services/stockix-finance/packages/shared/src/*.ts          — All source files
services/stockix-finance/packages/server/package.json      — Imports @repo/shared
services/stockix-finance/packages/webapp/package.json      — Imports @repo/shared
```

**Resolution — Step by Step:**

1. **Rename the finance copy's package name** in `services/stockix-finance/packages/shared/package.json`:
   ```json
   {
     "name": "@stockix/finance-shared"
   }
   ```

2. **Update all consumers inside `services/stockix-finance/`** that import `@repo/shared`:
   ```bash
   grep -r "from '@repo/shared" services/stockix-finance/ --include="*.ts" -l
   grep -r "require('@repo/shared" services/stockix-finance/ --include="*.ts" -l
   ```
   Update each import to use `@stockix/finance-shared`.

3. **Update `pnpm-workspace.yaml`** — remove the `!services/stockix-finance/packages/shared` exclusion since the name no longer conflicts. Verify the workspace resolves correctly:
   ```bash
   pnpm list --filter "@stockix/finance-shared"
   ```

4. **Update the finance internal `lerna.json`** if it references the old package name.

5. **Verify no external dependency on `@repo/shared`** from inside the finance package leaks to the monorepo root:
   ```bash
   pnpm why @repo/shared --filter "@stockix/server"
   ```

**Acceptance Criteria:**
- `cat services/stockix-finance/packages/shared/package.json | grep '"name"'` returns `@stockix/finance-shared`
- `pnpm list @repo/shared` lists exactly one package (from `packages/shared/`)
- All Finance server and webapp builds succeed without errors

---

### ISSUE-005 · Scratch Files at Repository Root

**Severity:** MEDIUM  
**Effort:** S  
**Depends on:** Nothing

**Root Cause:**  
Multiple developer scratch files were left at the repository root: SQL query files (`query.sql`, `query2.sql`, `query3.sql`, `proxy.sql`), shell scripts (`update.sh`, `update2.sh`, `update3.sh`), a developer note (`answerhow.md`), and `decrypt-env.mjs`. These create noise in the root directory and may contain sensitive operational details.

**Affected:**
```
query.sql
query2.sql
query3.sql
proxy.sql
update.sh
update2.sh
update3.sh
answerhow.md
decrypt-env.mjs      — Potentially sensitive (decrypt env utility)
provisioning.lock    — Unexplained purpose
```

**Resolution — Step by Step:**

1. **Audit each file for sensitive content before deletion:**
   ```bash
   cat query.sql query2.sql query3.sql proxy.sql
   cat update.sh update2.sh update3.sh
   cat decrypt-env.mjs
   cat answerhow.md
   ```

2. **For any file with reusable operational value**, move it to the appropriate location:
   - SQL files → `scripts/sql/` or `docs/`
   - Shell scripts → `scripts/` with proper naming and documentation
   - `decrypt-env.mjs` → `scripts/decrypt-env.mjs` if legitimately needed (verify it does not expose secrets)

3. **For true scratch files**, delete them:
   ```bash
   git rm query.sql query2.sql query3.sql proxy.sql answerhow.md
   git rm update.sh update2.sh update3.sh
   ```

4. **Investigate and document `provisioning.lock`:**
   - Read its contents: `cat provisioning.lock`
   - If it is a global mutex for the provisioning system, add a comment in `CLAUDE.md` explaining its role
   - If it is stale, remove it and add to `.gitignore`

5. **Add root-pollution prevention to `.gitignore`:**
   ```
   *.lock
   !pnpm-lock.yaml
   scratch/
   *.scratch.sql
   ```

6. **Add a lint rule** in `scripts/architecture-validation.mjs` that fails if unexpected files appear at the repo root.

**Acceptance Criteria:**
- `ls *.sql *.sh 2>/dev/null | wc -l` returns `0`
- All remaining files at root have a documented purpose
- `provisioning.lock` is either documented or removed

---

### ISSUE-006 · `@repo/ui` Is a Non-Functional Stub

**Severity:** HIGH  
**Effort:** M  
**Depends on:** Nothing (can start independently; ISSUE-013 builds on it)

**Root Cause:**  
`packages/ui/` was created as a placeholder for a shared component library but never populated. It contains only `button.tsx`, `card.tsx`, and `code.tsx` — generic stubs with no Shadcn primitives. Meanwhile, `apps/dashboard/components/ui/` contains 35+ production Shadcn components, and `services/posnew/apps/pos-frontend2/src/components/ui/` has its own separate copy. The `@repo/ui` entry in `apps/dashboard/package.json` as a dependency is misleading since it is not actually used for any UI components in production pages.

**Affected:**
```
packages/ui/src/button.tsx                  — Stub (3 lines)
packages/ui/src/card.tsx                    — Stub
packages/ui/src/code.tsx                    — Stub
packages/ui/package.json                    — "exports": "./*": "./src/*.tsx"
apps/dashboard/package.json                 — "@repo/ui": "workspace:*"
apps/dashboard/components/ui/*.tsx          — 35+ production Shadcn components (duplicated from standard)
services/posnew/apps/pos-frontend2/src/components/ui/*.tsx  — 11 separate Shadcn components
```

**Decision Required:** Choose between two paths:

**Path A — Promote `@repo/ui` to a real shared package (Recommended)**  
Populates the shared package with the dashboard's existing Shadcn components.

**Path B — Remove `@repo/ui` and document the duplication as intentional**  
Acknowledge that dashboard and POS are independent products and do not need UI convergence.

**Resolution for Path A — Step by Step:**

1. **Audit the dashboard `components/ui/` directory** and list all 35+ components with their shadcn versions and any custom modifications.

2. **Establish `packages/ui/` as the authoritative Shadcn package:**
   ```
   packages/ui/
   ├── package.json                   — Add peer deps: react, tailwindcss, clsx, class-variance-authority
   ├── src/
   │   ├── button.tsx                 — Move from dashboard
   │   ├── dialog.tsx
   │   ├── form.tsx
   │   ├── input.tsx
   │   ├── table.tsx
   │   ├── select.tsx
   │   ├── ... (all 35 components)
   │   └── index.ts                   — Barrel export
   ├── tailwind.config.ts             — Shared Tailwind config
   └── tsconfig.json
   ```

3. **Update `packages/ui/package.json`:**
   ```json
   {
     "name": "@repo/ui",
     "exports": {
       ".": "./src/index.ts",
       "./*": "./src/*.tsx"
     },
     "peerDependencies": {
       "react": "^19.0.0",
       "tailwindcss": "^4.0.0"
     },
     "dependencies": {
       "class-variance-authority": "^0.7.1",
       "clsx": "^2.1.1",
       "tailwind-merge": "^3.5.0",
       "lucide-react": "^1.14.0"
     }
   }
   ```

4. **Update dashboard imports:**
   ```bash
   # Find all imports from local ui
   grep -r "from.*components/ui/" apps/dashboard --include="*.tsx" --include="*.ts" -l
   # Each one needs: "@/components/ui/button" → "@repo/ui/button"
   ```

5. **Update POS frontend** to consume `@repo/ui` for components it has in common.

6. **Add `@repo/ui` as a build target in `turbo.json`** so it is compiled before consumers.

**Resolution for Path B — Step by Step:**
1. Remove `"@repo/ui": "workspace:*"` from `apps/dashboard/package.json`
2. Delete `packages/ui/` or replace its content with a `README.md` explaining the intentional duplication
3. Document in `CLAUDE.md` that dashboard and POS maintain independent UI layers

**Acceptance Criteria (Path A):**
- `packages/ui/src/` contains ≥ 30 Shadcn components
- `apps/dashboard/components/ui/` directory is deleted or contains only app-specific overrides
- `pnpm build` in `packages/ui` produces a working output
- Dashboard renders correctly after import migration

---

## TIER 2 — HIGH PRIORITY

---

### ISSUE-007 · No API Versioning on Control Plane

**Severity:** HIGH  
**Effort:** M  
**Depends on:** Nothing

**Root Cause:**  
The control plane API has no version prefix. All routes are mounted directly at `/tenants`, `/licenses`, `/owners`, etc. Any breaking change requires a coordinated deploy of API + dashboard + all external consumers (POS backend, Finance server, third-party integrations using `sk_live_*` API keys) simultaneously. The POS platform API (`/api/platform/v1`) demonstrates the correct pattern already.

**Affected:**
```
apps/api/src/app/create-control-plane-app.ts    — Route registration entry point
apps/api/src/routes/register-control-plane-routes.ts
apps/api/src/routes/*.ts                         — All route handlers
apps/api/src/middleware/known-api-paths.ts       — Known path list must be updated
docs/openapi/stockix-platform.openapi.yaml       — API spec paths
apps/dashboard/app/api/**/*.ts                   — All dashboard Route Handlers that call the API
services/posnew/apps/pos-backend/**/*.js         — POS calls to control plane
services/stockix-finance/packages/server/**/*.ts — Finance calls to control plane internal routes
```

**Resolution — Step by Step:**

1. **Decision: versioning strategy.** Two options:

   - **Option A — Path prefix versioning (Recommended):** Mount all existing routes under `/v1/`. New breaking changes go to `/v2/` while `/v1/` continues to work for legacy clients.
   - **Option B — Header versioning:** `Accept-Version: 1` header. Harder to test in browsers, not REST-standard.

2. **Update `register-control-plane-routes.ts`** to mount all route groups under `/v1`:
   ```typescript
   // Before
   registerTenantRoutes(app, db);     // → /tenants/*
   registerLicenseApi(app, db);       // → /licenses/*

   // After
   const v1 = app.basePath("/v1");
   registerTenantRoutes(v1, db);     // → /v1/tenants/*
   registerLicenseApi(v1, db);       // → /v1/licenses/*
   ```

3. **Maintain unversioned path aliases temporarily** for backwards compatibility during transition:
   - Keep `/tenants/*` pointing to the same handlers as `/v1/tenants/*` for 3 months (deprecation period)
   - Add `Deprecation: true` and `Sunset: {date}` headers to unversioned responses

4. **Update `apps/api/src/middleware/known-api-paths.ts`** to include both `/v1/*` and the legacy paths during transition.

5. **Update the OpenAPI spec** — change all paths from `/tenants` to `/v1/tenants`, etc.

6. **Update dashboard Route Handlers** — change all API calls:
   ```typescript
   // Before: fetch(`${API_URL}/tenants`)
   // After:  fetch(`${API_URL}/v1/tenants`)
   ```

7. **Update POS and Finance internal routes** — grep for all `STOCKIX_API_URL` or equivalent calls and append `/v1`.

8. **Update CLAUDE.md route map** to reflect `/v1` prefix for all routes.

**Acceptance Criteria:**
- `curl https://api.domain/v1/health` returns `200 OK`
- `curl https://api.domain/health` still returns `200 OK` (unversioned health is always OK to keep)
- All dashboard functionality works after the path update
- CI route audit scripts (`pnpm run check:routes`, `pnpm run check:known-paths`) pass

---

### ISSUE-008 · Finance Build System Uses Lerna — Not in Turborepo Pipeline

**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** ISSUE-004 (rename finance shared package first)

**Root Cause:**  
`services/stockix-finance/package.json` defines `"scripts": { "build": "lerna run build" }`. Lerna is a separate build orchestration tool not integrated with the repo-wide Turborepo pipeline. This means:
- `pnpm run build` (Turborepo) does NOT build Finance
- Finance has no build caching via Turborepo's remote cache
- CI must run Finance's build separately (`finance-typecheck.yml` workflow proves this)

**Affected:**
```
services/stockix-finance/package.json           — Lerna scripts
services/stockix-finance/lerna.json             — Lerna config (if it exists)
.github/workflows/finance-typecheck.yml         — Separate CI workflow for Finance
turbo.json                                      — Currently does not include Finance
pnpm-workspace.yaml                             — Has Finance packages but not integrated in Turborepo tasks
```

**Resolution — Step by Step:**

1. **Audit current Lerna usage:**
   ```bash
   cat services/stockix-finance/lerna.json 2>/dev/null || echo "No lerna.json found"
   grep -r "lerna" services/stockix-finance/package.json
   ```

2. **Update each sub-package in `services/stockix-finance/packages/`** to have explicit `build`, `dev`, `check-types` scripts that do not rely on Lerna (they already do — Lerna just orchestrates them).

3. **Add Finance packages to `turbo.json` pipeline tasks:**
   ```json
   {
     "tasks": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": ["dist/**", "build/**"]
       },
       "@stockix/server#build": {
         "dependsOn": ["^build"],
         "outputs": ["build/**"],
         "inputs": ["src/**", "scripts/**", "tsconfig*.json"]
       },
       "@stockix/webapp#build": {
         "dependsOn": ["@stockix/server#build"],
         "outputs": ["dist/**"]
       }
     }
   }
   ```

4. **Remove Lerna as a dependency** from `services/stockix-finance/package.json` after verifying all build commands work independently:
   ```bash
   pnpm --filter "@stockix/server" build
   pnpm --filter "@stockix/webapp" build
   ```

5. **Update `.github/workflows/finance-typecheck.yml`** to use `turbo run check-types --filter=@stockix/server` instead of custom steps.

6. **Merge Finance typecheck into main deploy workflow** `deploy.yml`.

**Acceptance Criteria:**
- `pnpm run build` from repo root builds all packages including Finance
- `npx turbo run build --filter=@stockix/server` works and is cached on second run
- The separate `finance-typecheck.yml` CI workflow is either removed or merged
- No `lerna` references remain in `services/stockix-finance/package.json`

---

### ISSUE-009 · God Config — Single Package for All Service Configurations

**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** Nothing

**Root Cause:**  
`packages/config/src/index.ts` is a 752-line file that reads env vars for every service in the monorepo: Finance (`MONGODB_DATABASE_URL`, `AGENDA_*`, `JWT_SECRET`, `DB_CLIENT`), PMS (`PMS_PORT`, `PMS_BASE_URL`, `GEMINI_API_KEY`), POS (`POS_PLATFORM_API_KEY`), infrastructure (`TRAEFIK_*`, `DOCKER_COMPOSE_*`), and control plane. Every service imports `@repo/config` and receives the entire union of all env vars, including vars that do not apply to it. This also preserves a typo: `TENANT_DB_NAME_PERFIX` must stay because it is used in production.

**Also found: The typo `TENANT_DB_NAME_PERFIX` (misspelling of PREFIX)**  
Evidence: `config/src/index.ts` line 275, 516 — `env.TENANT_DB_NAME_PREFIX ?? env.TENANT_DB_NAME_PERFIX`

**Affected:**
```
packages/config/src/index.ts               — 752 lines, all env vars
apps/api/package.json                      — Imports @repo/config
services/pms/package.json                  — Imports @repo/config
packages/platform-worker-shared/package.json — Imports @repo/config
```

**Resolution — Step by Step:**

1. **Refactor `packages/config/src/index.ts` into domain-specific modules** within the same package (do NOT split into separate packages — that creates versioning overhead):
   ```
   packages/config/src/
   ├── index.ts           — Re-exports all configs + env bootstrap (keep for backwards compat)
   ├── env.ts             — Raw env reads (private, used by domain configs)
   ├── api.ts             — apiConfig (control plane)
   ├── dashboard.ts       — dashboardConfig
   ├── db.ts              — dbConfig
   ├── infra.ts           — infraConfig (worker, Docker, Traefik)
   ├── mail.ts            — mailConfig
   ├── pms.ts             — pmsConfig
   ├── pos.ts             — posConfig
   ├── chatwoot.ts        — chatwootConfig
   ├── license.ts         — licenseConfig
   └── modules.ts         — moduleGatingConfig
   ```

2. **Move typed exports into domain files.** Example for `pms.ts`:
   ```typescript
   export const pmsConfig = {
     port: parseInt(process.env.PMS_PORT ?? "3003", 10),
     baseUrl: process.env.PMS_BASE_URL ?? "http://localhost:3003",
     geminiApiKey: process.env.GEMINI_API_KEY ?? "",
   } as const;
   ```

3. **Update `packages/config/src/index.ts`** to simply re-export from domain files:
   ```typescript
   export { apiConfig } from "./api.js";
   export { pmsConfig } from "./pms.js";
   // etc.
   ```

4. **Handle the `TENANT_DB_NAME_PERFIX` typo:**
   - Keep the typo as a read in `env.ts` with a `@deprecated` JSDoc comment
   - Add a deprecation log warning at startup if the typo variant is set but not the correct one:
     ```typescript
     if (process.env.TENANT_DB_NAME_PERFIX && !process.env.TENANT_DB_NAME_PREFIX) {
       console.warn("[config] TENANT_DB_NAME_PERFIX is deprecated — please rename to TENANT_DB_NAME_PREFIX in your .env");
     }
     ```
   - Add `TENANT_DB_NAME_PREFIX` as the canonical name in production `.env.example`
   - Remove the typo variant in 1 major version (after all deployments confirmed updated)

5. **Update package exports in `packages/config/package.json`:**
   ```json
   {
     "exports": {
       ".": "./src/index.ts",
       "./api": "./src/api.ts",
       "./pms": "./src/pms.ts",
       "./infra": "./src/infra.ts"
     }
   }
   ```

**Acceptance Criteria:**
- `packages/config/src/index.ts` is under 100 lines (re-exports only)
- Each domain config file is under 100 lines
- `services/pms/` imports only from `@repo/config/pms`, not the full config
- `TENANT_DB_NAME_PERFIX` deprecation warning is logged when the typo variant is used

---

## TIER 3 — MEDIUM PRIORITY

---

### ISSUE-010 · POS Backend Has No TypeScript — Untyped JavaScript

**Severity:** MEDIUM  
**Effort:** L  
**Depends on:** Nothing (incremental migration)

**Root Cause:**  
`services/posnew/apps/pos-backend/` is written in CommonJS JavaScript (`app.js`, all controllers, models, routes). There are no TypeScript files, no `tsconfig.json`, and no type checking in CI. Runtime errors that TypeScript would catch at compile time can reach production.

**Affected:**
```
services/posnew/apps/pos-backend/app.js             — Entry point
services/posnew/apps/pos-backend/controllers/        — All controllers
services/posnew/apps/pos-backend/models/             — Mongoose models
services/posnew/apps/pos-backend/routes/             — Express routes
services/posnew/apps/pos-backend/services/           — Business logic
services/posnew/apps/pos-backend/middlewares/        — Express middleware
```

**Resolution — Step by Step (Incremental, no big-bang):**

1. **Add TypeScript tooling without touching existing files:**
   ```bash
   # Add to services/posnew/apps/pos-backend/package.json
   "devDependencies": {
     "typescript": "^5.9.0",
     "@types/express": "^5.0.0",
     "@types/node": "^22.0.0",
     "@types/mongoose": "^5.11.0",
     "ts-node": "^10.9.0"
   }
   ```

2. **Create `tsconfig.json` with `allowJs: true` and `checkJs: false` initially:**
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "CommonJS",
       "allowJs": true,
       "checkJs": false,
       "strict": false,
       "outDir": "dist",
       "rootDir": ".",
       "resolveJsonModule": true
     },
     "include": ["**/*.ts", "**/*.js"],
     "exclude": ["node_modules", "dist"]
   }
   ```
   This allows new `.ts` files to coexist with existing `.js` files.

3. **Enable `checkJs: true` incrementally on a per-file basis** using `// @ts-check` comment at the top of each file as it is reviewed.

4. **Start TypeScript migration with new files only** — any new feature added to the POS backend must be written in TypeScript from day one.

5. **Migrate high-risk files first:**
   - `middlewares/authMiddleware.js` (authentication — highest security impact)
   - `services/platformService.js` (platform API integration)
   - `middlewares/globalErrorHandler.js`

6. **Add TypeScript check to CI:**
   ```yaml
   - name: POS backend type check
     run: pnpm --filter pos-backend exec tsc --noEmit
   ```

7. **Convert Mongoose models to use TypeScript interfaces:**
   ```typescript
   // models/orderModel.ts
   import mongoose, { Document, Schema } from "mongoose";
   interface IOrder extends Document { ... }
   ```

**Acceptance Criteria:**
- `services/posnew/apps/pos-backend/tsconfig.json` exists
- All new files added to pos-backend are TypeScript
- `pnpm --filter pos-backend exec tsc --noEmit` runs in CI without errors
- At least 5 high-risk files migrated to TypeScript

---

### ISSUE-011 · POS Backend Uses Unstructured Logging (`console.error`)

**Severity:** MEDIUM  
**Effort:** S  
**Depends on:** ISSUE-010 (partially — can do in JS)

**Root Cause:**  
`services/posnew/apps/pos-backend/app.js` and other files use `console.error()` and `console.log()` for logging. This is unstructured text output that cannot be parsed by Prometheus, Grafana, or log aggregation systems. The control plane and PMS both use structured JSON logging via `@repo/shared/structured-logger`.

**Affected:**
```
services/posnew/apps/pos-backend/app.js
services/posnew/apps/pos-backend/middlewares/globalErrorHandler.js
services/posnew/apps/pos-backend/workers/*.js
```

**Resolution — Step by Step:**

1. **Create `services/posnew/apps/pos-backend/lib/logger.js`** wrapping a structured logger:
   ```javascript
   // logger.js — structured JSON logger for POS backend
   function write(stream, payload) {
     stream.write(JSON.stringify(payload) + "\n");
   }
   
   module.exports = {
     info: (msg, meta = {}) => write(process.stdout, { level: "info", msg, ts: new Date().toISOString(), service: "pos-backend", ...meta }),
     warn: (msg, meta = {}) => write(process.stderr, { level: "warn", msg, ts: new Date().toISOString(), service: "pos-backend", ...meta }),
     error: (msg, error, meta = {}) => write(process.stderr, {
       level: "error", msg, ts: new Date().toISOString(), service: "pos-backend",
       error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
       ...meta
     }),
   };
   ```

2. **Replace all `console.log/warn/error` in high-traffic paths** with the new logger:
   ```bash
   grep -r "console\." services/posnew/apps/pos-backend --include="*.js" -l | wc -l
   ```

3. **Update `globalErrorHandler.js`** to use the structured logger for error responses.

4. **Update `app.js` startup logs** — process error handlers should use the logger.

5. **Add POS service name tag** — all log entries must include `"service": "pos-backend"` so logs can be filtered in Grafana.

**Acceptance Criteria:**
- `grep -r "console\." services/posnew/apps/pos-backend/app.js | wc -l` returns `0`
- POS logs appear as JSON in `docker logs {container}` output
- POS error logs include stack traces in the `error.stack` field

---

### ISSUE-012 · No Distributed Tracing Across Service Boundaries

**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** Nothing

**Root Cause:**  
OpenTelemetry is configured in `apps/api/src/instrumentation.ts` and `packages/platform-worker-shared/` but is NOT configured in `services/pms/`, `services/posnew/apps/pos-backend/`, or `services/stockix-finance/packages/server/`. Cross-service calls (control plane → PMS → Finance sync, or POS → Finance sync via BullMQ) generate traces that are broken — only the first hop is traced.

**Affected:**
```
services/pms/src/index.ts                        — No OpenTelemetry setup
services/pms/src/lib/finance-sync.ts             — Cross-service calls untraced
services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js  — Untraced
apps/api/src/instrumentation.ts                  — Only control plane traced
```

**Resolution — Step by Step:**

1. **Create a shared tracing setup** in `packages/platform-worker-shared/src/tracing.ts` (or extend `instrumentation.ts`):
   ```typescript
   export function initTracing(serviceName: string): void {
     const sdk = new NodeSDK({
       resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName }),
       traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
       instrumentations: [getNodeAutoInstrumentations()],
     });
     sdk.start();
   }
   ```

2. **Add tracing initialization to `services/pms/src/index.ts`:**
   ```typescript
   import { initTracing } from "@repo/platform-worker-shared/tracing";
   initTracing("stockix-pms");
   ```

3. **Add W3C Trace Context propagation headers** to PMS → Finance sync calls in `services/pms/src/lib/finance-sync.ts`:
   ```typescript
   // Add traceparent header to outbound Finance API calls
   headers: { "traceparent": context.propagator.inject(...) }
   ```

4. **Add tracing to POS backend** — install `@opentelemetry/sdk-node` and call `initTracing("stockix-pos-backend")` before Express app starts.

5. **Add `OTEL_EXPORTER_OTLP_ENDPOINT` env var** to all service Docker Compose files in `infra/prod/docker-compose.yml` pointing to a Jaeger or Tempo collector.

6. **Add Jaeger or Grafana Tempo** to `infra/prod/docker-compose.yml` as a trace collector.

7. **Add trace link in Grafana dashboards** — link Prometheus metrics to Jaeger traces using exemplars.

**Acceptance Criteria:**
- A provisioning event generates a trace visible in the trace UI that spans: control-plane API → worker → Finance internal API → Finance DB
- PMS iCal sync generates a trace
- `OTEL_EXPORTER_OTLP_ENDPOINT` is documented in `infra/prod/.env.example`

---

### ISSUE-013 · No Shared Shadcn Package — Dashboard and POS Have Duplicate UI

**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** ISSUE-006 (Path A must be chosen first)

**Root Cause:**  
(Covered in ISSUE-006 root cause.) After ISSUE-006 is resolved, this issue tracks the migration work specifically.

**Affected:**
```
apps/dashboard/components/ui/*.tsx          — 35+ components to move
services/posnew/apps/pos-frontend2/src/components/ui/*.tsx  — 11 components to reconcile
packages/ui/                               — Target destination
```

**Resolution — Step by Step:**

1. **Complete ISSUE-006 (Path A) first** — `@repo/ui` must be populated before this migration begins.

2. **Compare dashboard and POS ui directories** for divergence:
   ```bash
   diff <(ls apps/dashboard/components/ui/) <(ls services/posnew/apps/pos-frontend2/src/components/ui/)
   ```

3. **For components that exist in both** — merge into `@repo/ui`, resolving any style or prop differences by using composition (not prop explosion).

4. **For components unique to dashboard** — add to `@repo/ui` with clear naming.

5. **For components unique to POS** — evaluate whether they belong in `@repo/ui` or in a POS-specific package (`@restaurant-pos/ui` already exists — consider if it should extend `@repo/ui`).

6. **Migrate dashboard imports** — run the codemod:
   ```bash
   # Mass replace in dashboard
   find apps/dashboard -name "*.tsx" -o -name "*.ts" | \
   xargs sed -i 's|from "@/components/ui/|from "@repo/ui/|g'
   ```

7. **Delete `apps/dashboard/components/ui/`** after all imports are migrated and tests pass.

8. **Add package version constraints** — `@repo/ui` must use `"peerDependencies"` so consumers control their React and Tailwind versions.

**Acceptance Criteria:**
- `ls apps/dashboard/components/ui/ 2>/dev/null | wc -l` returns `0` (directory deleted)
- All dashboard pages render identically before and after migration
- POS frontend uses at least the common Shadcn components from `@repo/ui`
- `pnpm build` passes for both `apps/dashboard` and `services/posnew/apps/pos-frontend2`

---

### ISSUE-014 · Dashboard Route Handlers Contain Business Logic

**Severity:** LOW  
**Effort:** L  
**Depends on:** ISSUE-007 (API versioning adds confidence to the API layer)

**Root Cause:**  
`apps/dashboard/app/api/` contains Next.js Route Handlers that do more than proxy to the control plane API — some contain validation, transformation, and session management logic. This creates two API layers and makes the control plane API incomplete as a standalone product. External API consumers using `sk_live_*` API keys bypass this logic entirely.

**Affected:**
```
apps/dashboard/app/api/auth/*.ts            — Session cookie management
apps/dashboard/app/api/tenants/*.ts         — Tenant CRUD (wraps control plane)
apps/dashboard/app/api/licenses/*.ts        — License operations
apps/dashboard/app/api/owners/*.ts          — Owner management
apps/dashboard/app/api/mfa/*.ts             — MFA flow
```

**Resolution — Step by Step:**

1. **Audit each Route Handler** and classify it as:
   - **Pure proxy** (just forwards to `apps/api`) — can be simplified or removed
   - **Session management** (sets/clears cookies) — keep in dashboard, cannot move
   - **Business logic** (validates, transforms, makes decisions) — move to `apps/api`

2. **For pure proxy Route Handlers:**
   ```typescript
   // Before: dashboard/app/api/tenants/route.ts
   export async function GET(req: Request) {
     const res = await fetch(`${API_URL}/tenants`, { headers: { Authorization: ... } });
     return res; // pure proxy
   }

   // After: call API directly from client components using useSWR or fetch
   ```

3. **For business logic mixed into Route Handlers** — extract and move to the control plane API as proper endpoints.

4. **Document the intentional Route Handlers** (auth/session) that should stay in the dashboard.

**Acceptance Criteria:**
- Route Handlers that contain business logic are moved to `apps/api`
- Pure proxy Route Handlers are removed and replaced with direct client calls
- Session Route Handlers are documented as intentional
- The control plane API is the single source of truth for all business operations

---

## TIER 4 — LONG-TERM

---

### ISSUE-015 · PMS Data Must Be Isolated to Per-Tenant Database (Execution Phase)

**Severity:** CRITICAL (long-term execution of ISSUE-002 plan)  
**Effort:** XL  
**Depends on:** ISSUE-002 (planning completed), ISSUE-004, ISSUE-008

**Note:** ISSUE-002 covers the architectural decision. ISSUE-015 covers the migration execution. Keep them separate because the architectural decision can be made in Tier 0 while the actual migration executes as a longer project.

**Key execution milestones:**

1. **Month 1:** New `@repo/pms-db` package created, PMS service wired to use it in development, all PMS tables removed from `packages/db/schema.ts` in development branch.
2. **Month 2:** Staging migration — data copied from control-plane DB to new PMS database, staging environment runs with fully isolated PMS.
3. **Month 3:** Production migration with zero-downtime dual-write period (write to both DBs, read from new DB).
4. **Month 4:** Remove dual-write, delete PMS tables from control-plane DB, update backups.

---

### ISSUE-016 · Finance Frontend Must Migrate from Blueprint.js to Shadcn/Tailwind

**Severity:** LOW (long-term design consistency)  
**Effort:** XL  
**Depends on:** ISSUE-006 (shared UI package must exist first)

**Root Cause:**  
`services/stockix-finance/packages/webapp` uses Blueprint.js 4.x (Palantir's enterprise React UI library, CSS-heavy, class-based). The control plane dashboard and POS use Shadcn + Tailwind CSS. This means three different design systems exist across the platform, making a consistent white-label brand impossible.

**Resolution approach:**  
Component-by-component migration using a facade pattern. Do NOT attempt a big-bang rewrite. Start with new Finance features built in Shadcn, and migrate existing screens one at a time during maintenance windows.

**Key milestones:**

1. **Identify the top 10 most-used Finance screens** — these are the migration targets that deliver the most visual consistency.
2. **Build Shadcn-based versions in a parallel `/new/` route** for each screen before cutting over.
3. **Migrate the Finance authentication screen first** (highest visibility, lowest complexity).
4. **Set a deprecation date for Blueprint.js** — 18 months from project start.

---

### ISSUE-017 · Single-Server Deployment — No Horizontal Scaling or High Availability

**Severity:** HIGH (long-term SLA risk)  
**Effort:** XL  
**Depends on:** ISSUE-015 (PMS isolation must happen first to allow per-tenant sharding)

**Root Cause:**  
All production workloads run on a single EC2 instance managed by Docker Compose. There is no:
- Load balancer in front of the API
- Second server for failover
- Container orchestration (Kubernetes/ECS/Swarm)
- Horizontal scaling for any service

**Resolution options:**

**Option A — Docker Swarm (Minimum viable HA, lowest migration cost):**
- Convert to Docker Swarm mode on 2+ nodes
- `docker service create` replaces `docker compose up`
- Traefik supports Swarm natively
- Estimated effort: 4-6 weeks

**Option B — AWS ECS Fargate (Managed containers, no server management):**
- Port each service to a Fargate task definition
- AWS ALB replaces Traefik
- RDS PostgreSQL replaces self-managed Postgres
- Estimated effort: 8-12 weeks

**Option C — Kubernetes (Enterprise-grade, most complex):**
- All services become Kubernetes Deployments
- Helm charts for each service
- Estimated effort: 6+ months

**Recommended path:** Option A (Swarm) as an intermediate step to achieve basic HA quickly, then migrate to Option B (ECS) within 12 months.

---

### ISSUE-018 · No Metadata-Driven UI — Platform Cannot Generate Screens from Config

**Severity:** MEDIUM (long-term product capability)  
**Effort:** XL  
**Depends on:** ISSUE-006 (shared UI), ISSUE-013 (shared Shadcn)

**Root Cause:**  
Screens, forms, tables, and navigation are all hardcoded. The platform has no capability to generate UI from metadata — which limits the ability to build tenant-configurable interfaces, dynamic permission-gated modules, or the configurability expected of an enterprise SaaS platform.

**Foundation to build on (already exists):**
- `featureFlags` table in Postgres with `tenantOverrides` JSONB — can drive UI gating
- `@repo/shared/permissions` permission strings — can drive rendering decisions
- `tenants.modules` JSON array — can drive module-level navigation

**Resolution — Phase 1 (Foundation):**

1. **Form registry** — a JSON schema that defines form fields, validation, and submit targets. Use it to render React Hook Form + Zod schemas dynamically. Start with a single form (e.g. tenant branding settings).

2. **Table registry** — a JSON schema that defines columns, types, sort keys, and filter options for TanStack Table. Start with the licenses table.

3. **Navigation registry** — a JSON array stored in the database that defines sidebar links, permission guards, and module gates. Replace hardcoded `app-sidebar.tsx` navigation with a registry-driven component.

**Resolution — Phase 2 (Platform capability):**

4. **Screen registry** — a mapping of `moduleKey → screenConfig` that defines which screens are available for a given tenant module. Drive the dashboard navigation from this registry.

5. **Report registry** — define report schema (columns, groupings, filters) as metadata; render using a shared `<MetadataReport>` component.

---

## Execution Sequencing

The following table shows the recommended order of execution accounting for all dependencies:

```
WEEK 1-2 (Tier 0 + Tier 1 quick wins):
  ISSUE-001 · Remove C:\ artifact from git history
  ISSUE-005 · Remove scratch files from root
  ISSUE-004 · Rename finance @repo/shared → @stockix/finance-shared

WEEK 3-6 (Tier 0 security + Tier 1 architecture):
  ISSUE-003 · Secrets manager implementation
  ISSUE-006 · Fix @repo/ui (choose Path A or B and execute)
  ISSUE-002 · Plan + design PMS database isolation (architecture phase only)

WEEK 7-12 (Tier 2 API + build pipeline):
  ISSUE-007 · Add /v1 API versioning to control plane
  ISSUE-008 · Migrate Finance Lerna → Turborepo (after ISSUE-004)
  ISSUE-009 · Split god config into domain configs

MONTH 3-4 (Tier 3 DX + observability):
  ISSUE-011 · POS structured logging
  ISSUE-012 · Distributed tracing across services
  ISSUE-013 · Unified Shadcn migration (after ISSUE-006 Path A)
  ISSUE-010 · POS TypeScript migration (incremental, start now)

MONTH 4-6 (Tier 0 execution):
  ISSUE-015 · PMS database migration to isolated store (execution)

MONTH 6-12 (Tier 4 long-term):
  ISSUE-014 · Dashboard Route Handler cleanup
  ISSUE-016 · Finance Blueprint.js → Shadcn migration
  ISSUE-017 · HA / Kubernetes migration
  ISSUE-018 · Metadata-driven UI foundation
```

---

## Dependency Graph

```
ISSUE-001 ─── (no deps)
ISSUE-002 ─── (no deps) ──► ISSUE-015
ISSUE-003 ─── (no deps)
ISSUE-004 ─── (no deps) ──► ISSUE-008
ISSUE-005 ─── (no deps)
ISSUE-006 ─── (no deps) ──► ISSUE-013 ──► ISSUE-016
ISSUE-007 ─── (no deps) ──► ISSUE-014
ISSUE-008 ─── ISSUE-004
ISSUE-009 ─── (no deps)
ISSUE-010 ─── (no deps, incremental)
ISSUE-011 ─── (no deps, ISSUE-010 helps)
ISSUE-012 ─── (no deps)
ISSUE-013 ─── ISSUE-006
ISSUE-014 ─── ISSUE-007
ISSUE-015 ─── ISSUE-002 + ISSUE-004 + ISSUE-008
ISSUE-016 ─── ISSUE-006 + ISSUE-013
ISSUE-017 ─── ISSUE-015
ISSUE-018 ─── ISSUE-006 + ISSUE-013
```

---

## Issue Summary Table

| ID | Title | Tier | Severity | Effort | Depends On |
|----|-------|------|---------|--------|-----------|
| ISSUE-001 | Remove `C:\` artifact from git history | 0 | CRITICAL | S | — |
| ISSUE-002 | PMS data isolation plan | 0 | CRITICAL | XL | — |
| ISSUE-003 | Implement secrets manager | 0 | HIGH | L | — |
| ISSUE-004 | Rename duplicate `@repo/shared` in Finance | 1 | HIGH | S | — |
| ISSUE-005 | Remove scratch files from repo root | 1 | MEDIUM | S | — |
| ISSUE-006 | Fix `@repo/ui` — make it real or remove it | 1 | HIGH | M | — |
| ISSUE-007 | Add `/v1` API versioning to control plane | 2 | HIGH | M | — |
| ISSUE-008 | Migrate Finance Lerna → Turborepo | 2 | MEDIUM | M | ISSUE-004 |
| ISSUE-009 | Split god config into domain modules | 2 | MEDIUM | M | — |
| ISSUE-010 | POS backend TypeScript migration | 3 | MEDIUM | L | — |
| ISSUE-011 | POS backend structured logging | 3 | MEDIUM | S | — |
| ISSUE-012 | Distributed tracing across services | 3 | MEDIUM | M | — |
| ISSUE-013 | Unified Shadcn migration | 3 | MEDIUM | M | ISSUE-006 |
| ISSUE-014 | Move business logic out of dashboard Route Handlers | 3 | LOW | L | ISSUE-007 |
| ISSUE-015 | PMS database migration execution | 4 | CRITICAL | XL | ISSUE-002, ISSUE-004 |
| ISSUE-016 | Finance Blueprint.js → Shadcn migration | 4 | LOW | XL | ISSUE-006, ISSUE-013 |
| ISSUE-017 | HA / container orchestration | 4 | HIGH | XL | ISSUE-015 |
| ISSUE-018 | Metadata-driven UI foundation | 4 | MEDIUM | XL | ISSUE-006, ISSUE-013 |

---

*This document is a plan only. No code has been changed. All issue resolutions are pending engineering approval and scheduling.*
