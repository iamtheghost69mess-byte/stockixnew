# Stockix — Remediation Plan

**Based on:** `architecturefile.md` (audit dated 2026-06-20)  
**Last updated:** 2026-06-20  
**Document type:** Engineering Remediation Plan — NO CODE CHANGES UNTIL APPROVED  
**Scope:** All findings from the full architecture audit  
**Methodology:** Issues are grouped by criticality tier, each with exact affected files, root cause, step-by-step resolution instructions, acceptance criteria, effort estimate, and inter-issue dependencies.

---

## Decisions Log

All open questions from the pre-approval review have been resolved. These decisions are now locked into this document.

| Decision | Chosen |
|---------|--------|
| ISSUE-006 `@repo/ui` path | **Path A** — promote to real shared Shadcn package |
| ISSUE-007 API versioning blast radius | **Staged** — API first, then consumers one at a time |
| ISSUE-012 Trace collector | **Grafana Tempo** — integrates with existing Grafana stack |
| ISSUE-001 C:\ cleanup timing | **Deferred** — pending team re-clone coordination |
| ISSUE-003 Secrets manager | **Deferred** — keeping `.env` approach for now; revisit when scaling |

---

## How to Read This Document

```
Issue ID     — Unique identifier (used for dependency tracking)
Status       — ACTIVE / DEFERRED / OUT OF SCOPE
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

**Status:** DEFERRED — Pending team re-clone coordination  
**Severity:** CRITICAL  
**Effort:** S  
**Depends on:** Nothing

**Root Cause:**  
A Windows absolute path (`C:\Users\Jad\Desktop\stokcix\stockixnew\services\stockix-finance`) was accidentally committed as a directory to the repository root, likely from a `git add` on a Windows development machine that treated the path string as a literal directory name.

**Why deferred:**  
Removing from git history requires a force-push that rewrites all branches. Every team member must re-clone after. This is a team coordination event. The issue is documented and tracked here. It will be executed during the next planned downtime window.

**Affected:**
```
stockixnew/C:                              (literal directory)
stockixnew/C:/Users/                       (subtree)
stockixnew/C:\Users\Jad\Desktop\stokcix\stockixnew\services\stockix-finance/
  └── data/
  └── docker/
```

**Resolution — Step by Step (execute when team is ready):**

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

3. **Force-push all branches** after history rewrite. Coordinate with all team members — everyone must re-clone.

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

**Status:** ACTIVE — Architecture design phase  
**Severity:** CRITICAL  
**Effort:** XL  
**Depends on:** Nothing (can design independently; ISSUE-015 covers execution)

**Root Cause:**  
The PMS domain (properties, bookings, guests with passport/visa/DOB fields) was built on top of the control-plane PostgreSQL database to accelerate development. A `TODO(security)` comment in the codebase acknowledges this is a security violation. The control-plane DB is accessible to SaaS operators who manage tenants — it must never contain tenant guest PII.

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

1. **Chosen isolation strategy: Option C — Separate `stockix_pms` database on the same Postgres server.**  
   Rationale: lowest migration cost, same infra topology, no per-tenant database sprawl, full schema separation from control plane. Enforced by a separate Drizzle client pointing to `PMS_DATABASE_URL`.

2. **Create a new `@repo/pms-db` package** (`packages/pms-db/`):
   - Move all `pms_*` table definitions out of `packages/db/src/schema.ts`
   - Create `packages/pms-db/src/schema.ts` with only PMS tables
   - Define a new Drizzle client configured against `PMS_DATABASE_URL`
   - Add `packages/pms-db` to `pnpm-workspace.yaml` and `turbo.json`

3. **Update `services/pms/` to use `@repo/pms-db` instead of `@repo/db`:**
   - Change all imports: `from "@repo/db/schema"` → `from "@repo/pms-db/schema"`
   - Update `services/pms/src/db.ts` to connect to `PMS_DATABASE_URL`
   - Add `PMS_DATABASE_URL` to `@repo/config` pms config module

4. **Remove `pms_*` tables from `packages/db/src/schema.ts`:**
   - Also remove `pmsAuditLog` — it belongs in the PMS database, not alongside `adminAuditLog`
   - Write a data migration script: `scripts/migrate-pms-to-isolated-db.mjs`

5. **Update provisioning worker** to create the `stockix_pms` database on tenant provision and drop it on tenant delete:
   - Files: `apps/api/src/org-provision.ts`, infra-worker provisioning logic

6. **Remove all direct `pms_*` DB queries from `apps/api/src/routes/`:**
   - PMS data must only be accessed via the PMS service HTTP API, never via direct DB query from the control plane

7. **Data migration script** (run on staging first, then production):
   ```sql
   -- Run inside scripts/migrate-pms-to-isolated-db.mjs
   -- Creates stockix_pms database and copies all 19 PMS tables
   CREATE DATABASE stockix_pms;
   \c stockix_pms
   -- For each table:
   INSERT INTO stockix_pms.pms_properties SELECT * FROM stockix_platform.pms_properties;
   -- (repeat for all 19 tables)
   ```

8. **Update infra:** Add `PMS_DATABASE_URL` to `infra/prod/docker-compose.yml` PMS service env block.

**Acceptance Criteria:**
- `grep -r "pms_" packages/db/src/schema.ts | wc -l` returns `0`
- PMS service `DATABASE_URL` is different from control-plane `DATABASE_URL`
- A SaaS operator querying the control-plane DB sees zero PMS tables
- All existing PMS functionality works via the PMS service API

---

### ISSUE-003 · Secrets in Environment Variables — No Secrets Manager

**Status:** DEFERRED — Keeping `.env` approach intentionally for now  
**Severity:** HIGH  
**Effort:** L  
**Depends on:** Nothing

**Why deferred:**  
The current `.env`-based approach is adequate for the current single-server deployment. The operational overhead of introducing a secrets manager (AWS Secrets Manager / HashiCorp Vault) is not justified until the platform moves to multi-server or managed container infrastructure (see ISSUE-017). This issue will be revisited when ISSUE-017 is executed.

**Minimum mitigations already in place (do not remove):**
- Per-tenant secrets (`mysqlPassword`, `jwtSecret`, `financeAdminPassword`) are encrypted at rest as `enc:v1:*` using `DEPLOYMENT_SECRET_KEY` in `tenant_deployments` table — do not change this pattern
- Gitleaks secret scanning runs in CI — do not disable
- `.env` files are on the server filesystem, not in the repository — maintain this discipline

**When this is revisited:**  
Implement AWS Secrets Manager with IAM instance role at the time ISSUE-017 (container orchestration migration) is executed, so secrets management and infrastructure HA are addressed together.

---

## TIER 1 — URGENT

---

### ISSUE-004 · Duplicate `@repo/shared` Package Name Collision

**Status:** ACTIVE  
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
pnpm-workspace.yaml                                         — ! exclusion for finance shared
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
   Update every import path to `@stockix/finance-shared`.

3. **Remove the `!` exclusion from `pnpm-workspace.yaml`** — since the name no longer conflicts, the exclusion is no longer needed. Verify:
   ```bash
   pnpm list --filter "@stockix/finance-shared"
   ```

4. **Update the finance internal `lerna.json`** if it references the old package name.

5. **Verify resolution is clean:**
   ```bash
   pnpm why @repo/shared --filter "@stockix/server"
   # Should report: not found (Finance server no longer depends on @repo/shared)
   pnpm list @repo/shared
   # Should list exactly one package: packages/shared
   ```

**Acceptance Criteria:**
- `grep '"name"' services/stockix-finance/packages/shared/package.json` returns `"@stockix/finance-shared"`
- `pnpm list @repo/shared` lists exactly one package (from `packages/shared/`)
- All Finance server and webapp builds succeed without errors

---

### ISSUE-005 · Scratch Files at Repository Root

**Status:** ACTIVE  
**Severity:** MEDIUM  
**Effort:** S  
**Depends on:** Nothing

**Root Cause:**  
Multiple developer scratch files were left at the repository root: SQL query files (`query.sql`, `query2.sql`, `query3.sql`, `proxy.sql`), shell scripts (`update.sh`, `update2.sh`, `update3.sh`), a developer note (`answerhow.md`), and `decrypt-env.mjs`. These create noise and may contain sensitive operational details.

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
provisioning.lock    — Unexplained purpose, needs investigation
```

**Resolution — Step by Step:**

1. **Read each file before touching it** — audit for sensitive content or reusable logic:
   ```bash
   cat query.sql query2.sql query3.sql proxy.sql
   cat update.sh update2.sh update3.sh
   cat decrypt-env.mjs
   cat answerhow.md
   cat provisioning.lock
   ```

2. **For files with reusable operational value**, move to the correct location:
   - SQL files → `scripts/sql/` with descriptive names
   - Shell scripts → `scripts/` with proper naming
   - `decrypt-env.mjs` → `scripts/decrypt-env.mjs` if needed (verify no secret values inside)

3. **For true scratch files**, remove from tracking:
   ```bash
   git rm query.sql query2.sql query3.sql proxy.sql answerhow.md
   git rm update.sh update2.sh update3.sh
   ```

4. **Investigate `provisioning.lock`:**
   - If it is a global mutex used by the provisioning system → document its purpose in `CLAUDE.md`
   - If it is stale → remove it and add to `.gitignore`

5. **Add root-pollution prevention to `.gitignore`:**
   ```
   # Scratch files — do not commit to root
   scratch/
   *.scratch.sql
   *.tmp
   ```

6. **Add enforcement** in `scripts/architecture-validation.mjs` — a lint rule that fails CI if unexpected file extensions appear at the repo root.

**Acceptance Criteria:**
- `ls *.sql *.sh 2>/dev/null | wc -l` returns `0`
- All remaining files at root have a documented purpose
- `provisioning.lock` is either documented in `CLAUDE.md` or removed

---

### ISSUE-006 · `@repo/ui` Must Become the Single Shared Shadcn Package

**Status:** ACTIVE — Path A chosen  
**Severity:** HIGH  
**Effort:** M  
**Depends on:** Nothing (ISSUE-013 follows this)

**Decision:** Path A — promote `@repo/ui` to a real shared Shadcn package. This is the authoritative choice. Path B (remove and document duplication) is not being pursued.

**Root Cause:**  
`packages/ui/` exists as a placeholder with only 3 stub files. `apps/dashboard/components/ui/` contains 35+ production Shadcn components and `services/posnew/apps/pos-frontend2/src/components/ui/` has an independent 11-component copy. Three Shadcn implementations exist simultaneously. `@repo/ui` must become the single source of truth.

**Affected:**
```
packages/ui/src/button.tsx                  — Stub, to be replaced
packages/ui/src/card.tsx                    — Stub, to be replaced
packages/ui/src/code.tsx                    — Stub, to be replaced
packages/ui/package.json                    — Needs full dependency update
packages/ui/tsconfig.json                   — Needs creation
apps/dashboard/components/ui/*.tsx          — 35+ components, to be moved here
apps/dashboard/package.json                 — Already declares @repo/ui: workspace:*
services/posnew/apps/pos-frontend2/src/components/ui/*.tsx  — 11 components to reconcile
turbo.json                                  — @repo/ui must be a build target
```

**Resolution — Step by Step:**

1. **Audit the full dashboard `components/ui/` directory** — list every component, note any custom modifications beyond standard Shadcn defaults.

2. **Update `packages/ui/package.json`** with proper dependencies:
   ```json
   {
     "name": "@repo/ui",
     "version": "0.0.0",
     "private": true,
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
       "lucide-react": "^0.511.0",
       "@radix-ui/react-dialog": "latest",
       "@radix-ui/react-select": "latest",
       "@radix-ui/react-popover": "latest",
       "@radix-ui/react-dropdown-menu": "latest"
     }
   }
   ```
   (Add all Radix UI deps that the dashboard currently uses — grep `package.json` for `@radix-ui/*`.)

3. **Create `packages/ui/tsconfig.json`:**
   ```json
   {
     "extends": "@repo/typescript-config/react-library.json",
     "compilerOptions": {
       "outDir": "dist"
     },
     "include": ["src/**/*.ts", "src/**/*.tsx"],
     "exclude": ["node_modules", "dist"]
   }
   ```

4. **Move all 35+ components** from `apps/dashboard/components/ui/` to `packages/ui/src/`:
   - Copy each file — do not delete from dashboard until all imports are updated
   - Create `packages/ui/src/index.ts` with a barrel export for all components

5. **Update dashboard imports** — mass replace throughout `apps/dashboard/`:
   ```bash
   # @/components/ui/button → @repo/ui/button
   # This must be done for ALL ~35 components across ALL pages and components
   grep -r '@/components/ui/' apps/dashboard --include="*.tsx" --include="*.ts" -l
   ```
   For each file, update the import path.

6. **Delete `apps/dashboard/components/ui/`** after all imports are migrated and the dashboard builds cleanly.

7. **Reconcile POS frontend** — compare POS `components/ui/` against `@repo/ui/src/`:
   - Components that exist in both: remove POS copy, import from `@repo/ui`
   - Components unique to POS: keep in `services/posnew/apps/pos-frontend2/src/components/ui/` or move to `@repo/ui` if generally useful

8. **Add `@repo/ui` to `turbo.json`** build pipeline so it compiles before consumers:
   ```json
   "@repo/ui#build": {
     "outputs": ["dist/**"]
   }
   ```

**Acceptance Criteria:**
- `packages/ui/src/` contains ≥ 30 Shadcn components
- `apps/dashboard/components/ui/` directory does not exist (or contains zero component files)
- `pnpm --filter @repo/ui build` succeeds
- `pnpm --filter apps/dashboard build` succeeds with zero import errors
- Dashboard renders all pages correctly after migration (visual check required)

---

## TIER 2 — HIGH PRIORITY

---

### ISSUE-007 · API Versioning — Staged Rollout to `/v1`

**Status:** ACTIVE — Staged approach  
**Severity:** HIGH  
**Effort:** M  
**Depends on:** Nothing

**Decision:** Staged rollout — API server first, then each consumer in a separate step. This is the professional approach: the server deploys `/v1` routes while keeping legacy unversioned aliases alive (with deprecation headers), then consumers are migrated one at a time with no downtime risk.

**Root Cause:**  
The control plane API has no version prefix. All routes mount directly at `/tenants`, `/licenses`, `/owners`, etc. Any breaking change forces a simultaneous deploy of API + dashboard + POS backend + Finance server. The POS platform API already uses `/api/platform/v1` — the correct pattern is established, just not applied to the control plane.

**Affected:**
```
Stage 1 — API server:
  apps/api/src/routes/register-control-plane-routes.ts
  apps/api/src/middleware/known-api-paths.ts
  docs/openapi/stockix-platform.openapi.yaml

Stage 2 — Dashboard consumers:
  apps/dashboard/app/api/**/*.ts              — All Route Handlers calling the API

Stage 3 — POS backend consumers:
  services/posnew/apps/pos-backend/**/*.js   — All calls to STOCKIX_API_URL

Stage 4 — Finance server consumers:
  services/stockix-finance/packages/server/**/*.ts  — Internal route calls

Stage 5 — Deprecation sunset:
  apps/api/src/routes/register-control-plane-routes.ts  — Remove legacy aliases
  apps/api/src/middleware/known-api-paths.ts            — Remove unversioned paths
```

**Resolution — Stage by Stage:**

**Stage 1 — API Server (deploy first, before any consumer changes)**

1. **Update `register-control-plane-routes.ts`** — mount all route groups under `/v1` using Hono's `basePath`:
   ```typescript
   const v1 = app.basePath("/v1");
   registerTenantRoutes(v1, db);      // → /v1/tenants/*
   registerLicenseApi(v1, db);        // → /v1/licenses/*
   registerOwnerRoutes(v1, db);       // → /v1/owners/*
   registerAdminRoutes(v1, db);       // → /v1/admin/*
   registerApiKeyRoutes(v1, db);      // → /v1/api-keys
   // ... all other domain routes
   ```

2. **Keep legacy unversioned aliases alive** for the 90-day deprecation window. Mount the same route groups again at the root with a deprecation middleware that injects headers:
   ```typescript
   app.use("*", async (c, next) => {
     await next();
     if (!c.req.path.startsWith("/v1/")) {
       c.res.headers.set("Deprecation", "true");
       c.res.headers.set("Sunset", "2026-09-20"); // 90 days from now
       c.res.headers.set("Link", `<${c.req.url.replace(c.req.path, "/v1" + c.req.path)}>; rel="successor-version"`);
     }
   });
   registerTenantRoutes(app, db);    // → /tenants/* (deprecated)
   registerLicenseApi(app, db);      // → /licenses/* (deprecated)
   // ... repeat for all route groups (legacy aliases)
   ```

3. **Update `known-api-paths.ts`** — add all `/v1/*` paths to the known paths list. Do not remove the unversioned paths yet.

4. **Update OpenAPI spec** (`docs/openapi/stockix-platform.openapi.yaml`) — add `/v1` prefix to all paths. Keep unversioned paths with `deprecated: true`.

5. **Deploy Stage 1.** Verify:
   - `curl https://api.domain/v1/health` → `200 OK`
   - `curl https://api.domain/health` → `200 OK`
   - Deprecation response header is present on unversioned calls
   - All dashboard functionality still works (unversioned paths still alive)

**Stage 2 — Dashboard consumers (after Stage 1 is stable for ≥ 1 week)**

6. **Update all dashboard Route Handlers** in `apps/dashboard/app/api/`:
   ```bash
   # Grep all places that call the control plane API
   grep -r "PLATFORM_API_SECRET\|API_URL\|apiUrl" apps/dashboard/app/api --include="*.ts" -l
   ```
   Change every `fetch(`${API_URL}/tenants`)` → `fetch(`${API_URL}/v1/tenants`)`.

7. **Deploy Stage 2.** Verify all dashboard pages function correctly.

**Stage 3 — POS backend consumers (after Stage 2 is stable for ≥ 1 week)**

8. **Update POS backend** calls to the control plane:
   ```bash
   grep -r "STOCKIX_API_URL\|stockixApiUrl\|control.plane" services/posnew/apps/pos-backend --include="*.js" -l
   ```
   Append `/v1` to all control plane API base paths.

9. **Deploy Stage 3.** Verify POS → control plane flows work correctly.

**Stage 4 — Finance server consumers (after Stage 3 is stable)**

10. **Update Finance server** calls to the control plane internal routes:
    ```bash
    grep -r "STOCKIX_API_URL\|/internal/" services/stockix-finance/packages/server --include="*.ts" -l
    ```
    Update all `STOCKIX_API_URL` usages to include `/v1`.

11. **Deploy Stage 4.** Verify Finance → control plane internal flows work.

**Stage 5 — Deprecation sunset (90 days after Stage 1, date: 2026-09-20)**

12. **Remove all legacy unversioned aliases** from `register-control-plane-routes.ts`.

13. **Remove unversioned paths from `known-api-paths.ts`**.

14. **Update `CLAUDE.md` route map** to show `/v1` prefix for all routes.

**Acceptance Criteria:**
- After Stage 1: `curl /v1/health` → `200`; `curl /health` → `200`; `curl /tenants` → `200` with `Deprecation: true` header
- After Stage 2: Dashboard makes zero calls to unversioned paths (verify in browser network tab)
- After Stage 3: POS backend makes zero calls to unversioned paths
- After Stage 4: Finance server makes zero calls to unversioned paths
- After Stage 5: `curl /tenants` → `404`; all CI route checks pass

---

### ISSUE-008 · Finance Build System Uses Lerna — Not in Turborepo Pipeline

**Status:** ACTIVE  
**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** ISSUE-004 (rename finance shared package first)

**Root Cause:**  
`services/stockix-finance/package.json` uses Lerna to orchestrate builds. This is entirely separate from the repo-wide Turborepo pipeline — `pnpm run build` does not build Finance, Finance gets no Turborepo build caching, and CI runs a separate `finance-typecheck.yml` workflow to compensate.

**Affected:**
```
services/stockix-finance/package.json           — Lerna scripts
services/stockix-finance/lerna.json             — Lerna config
.github/workflows/finance-typecheck.yml         — Separate CI workflow
turbo.json                                      — Missing Finance tasks
pnpm-workspace.yaml                             — Finance packages present but not in Turborepo tasks
```

**Resolution — Step by Step:**

1. **Audit current Lerna configuration:**
   ```bash
   cat services/stockix-finance/lerna.json 2>/dev/null || echo "No lerna.json"
   grep -r "lerna" services/stockix-finance/package.json
   ```

2. **Verify each Finance sub-package already has standalone scripts** (they do — Lerna just runs them):
   ```bash
   pnpm --filter "@stockix/server" build   # Should work without Lerna
   pnpm --filter "@stockix/webapp" build   # Should work without Lerna
   ```

3. **Add Finance packages to `turbo.json` pipeline:**
   ```json
   {
     "tasks": {
       "@stockix/server#build": {
         "dependsOn": ["^build"],
         "outputs": ["build/**"],
         "inputs": ["src/**", "scripts/**", "tsconfig*.json", "webpack.*.js"]
       },
       "@stockix/server#check-types": {
         "dependsOn": [],
         "cache": false
       },
       "@stockix/webapp#build": {
         "dependsOn": ["@stockix/server#build"],
         "outputs": ["dist/**"],
         "inputs": ["src/**", "tsconfig*.json", "vite.config.*"]
       }
     }
   }
   ```

4. **Remove Lerna from `services/stockix-finance/package.json`:**
   - Delete `"build": "lerna run build"` script
   - Remove `lerna` from `devDependencies`
   - Delete `services/stockix-finance/lerna.json`

5. **Update `services/stockix-finance/package.json` scripts** to delegate to Turborepo:
   ```json
   {
     "scripts": {
       "build": "turbo run build --filter=@stockix/*",
       "check-types": "turbo run check-types --filter=@stockix/*",
       "dev": "turbo run dev --filter=@stockix/*"
     }
   }
   ```

6. **Update `.github/workflows/finance-typecheck.yml`** — replace custom Lerna steps with:
   ```yaml
   - name: Finance type check
     run: pnpm turbo run check-types --filter=@stockix/server
   ```
   Or merge entirely into the main `deploy.yml` workflow.

**Acceptance Criteria:**
- `pnpm run build` from repo root builds Finance packages
- `npx turbo run build --filter=@stockix/server` is cached on second run (cache hit)
- `lerna` is not referenced anywhere in `services/stockix-finance/`
- `finance-typecheck.yml` either removed or updated to use Turborepo

---

### ISSUE-009 · God Config — Single 752-Line File for All Services

**Status:** ACTIVE  
**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** Nothing

**Root Cause:**  
`packages/config/src/index.ts` is 752 lines and reads environment variables for every service simultaneously: Finance, PMS, POS, infrastructure, control plane, mail, Chatwoot. Every service that imports `@repo/config` receives the entire union of all env vars. This couples all services to one file and makes it impossible to validate only the env vars relevant to a given service. Also preserves a backwards-compatible typo: `TENANT_DB_NAME_PERFIX` (misspelling of PREFIX).

**Affected:**
```
packages/config/src/index.ts               — 752-line god config
packages/config/package.json               — exports map
apps/api/package.json                      — imports @repo/config
services/pms/package.json                  — imports @repo/config
packages/platform-worker-shared/package.json — imports @repo/config
```

**Resolution — Step by Step:**

1. **Refactor into domain modules within the same package** — do NOT split into separate packages (creates versioning overhead). The `index.ts` becomes a re-export barrel only:
   ```
   packages/config/src/
   ├── index.ts       — Re-exports only (< 50 lines)
   ├── env.ts         — Raw process.env reads (private module)
   ├── api.ts         — apiConfig: control plane env vars
   ├── dashboard.ts   — dashboardConfig: Next.js / session vars
   ├── db.ts          — dbConfig: DATABASE_URL, pool sizes, migration settings
   ├── infra.ts       — infraConfig: Docker, Traefik, worker secrets
   ├── mail.ts        — mailConfig: SMTP, Resend API key
   ├── pms.ts         — pmsConfig: PMS_PORT, PMS_BASE_URL, PMS_DATABASE_URL
   ├── pos.ts         — posConfig: POS_PLATFORM_API_KEY, POS_BACKEND_URL
   ├── license.ts     — licenseConfig: LICENSE_SIGNING_SECRET, STXI format vars
   ├── chatwoot.ts    — chatwootConfig: CHATWOOT_* vars
   └── modules.ts     — moduleGatingConfig: feature gates per module
   ```

2. **Create `env.ts`** — a private raw-read module:
   ```typescript
   // Not exported from index.ts — only consumed by domain config files
   export const env = process.env;
   ```

3. **Create each domain config file.** Example for `pms.ts`:
   ```typescript
   import { env } from "./env.js";
   export const pmsConfig = {
     port: parseInt(env.PMS_PORT ?? "3003", 10),
     baseUrl: env.PMS_BASE_URL ?? "http://localhost:3003",
     pmsDbUrl: env.PMS_DATABASE_URL ?? env.DATABASE_URL ?? "",
     geminiApiKey: env.GEMINI_API_KEY ?? "",
   } as const;
   ```

4. **Handle `TENANT_DB_NAME_PERFIX` typo** in `db.ts`:
   ```typescript
   // @deprecated — use TENANT_DB_NAME_PREFIX (correct spelling)
   const legacyPrefix = env.TENANT_DB_NAME_PERFIX;
   if (legacyPrefix && !env.TENANT_DB_NAME_PREFIX) {
     console.warn("[config] TENANT_DB_NAME_PERFIX is deprecated — rename to TENANT_DB_NAME_PREFIX in .env");
   }
   export const dbConfig = {
     tenantDbNamePrefix: env.TENANT_DB_NAME_PREFIX ?? legacyPrefix ?? "stockix_tenant_",
     // ...
   };
   ```

5. **Reduce `packages/config/src/index.ts` to a barrel:**
   ```typescript
   export { apiConfig } from "./api.js";
   export { dashboardConfig } from "./dashboard.js";
   export { dbConfig } from "./db.js";
   export { infraConfig } from "./infra.js";
   export { mailConfig } from "./mail.js";
   export { pmsConfig } from "./pms.js";
   export { posConfig } from "./pos.js";
   export { licenseConfig } from "./license.js";
   export { chatwootConfig } from "./chatwoot.js";
   export { moduleGatingConfig } from "./modules.js";
   ```

6. **Update `packages/config/package.json` exports:**
   ```json
   {
     "exports": {
       ".": "./src/index.ts",
       "./api": "./src/api.ts",
       "./db": "./src/db.ts",
       "./pms": "./src/pms.ts",
       "./infra": "./src/infra.ts",
       "./mail": "./src/mail.ts",
       "./license": "./src/license.ts"
     }
   }
   ```

7. **Update consumers to import from domain paths** where they only need one domain's config:
   ```typescript
   // services/pms/src/index.ts
   import { pmsConfig } from "@repo/config/pms"; // not the full barrel
   ```

**Acceptance Criteria:**
- `packages/config/src/index.ts` is under 50 lines (re-exports only)
- No single domain config file exceeds 100 lines
- `services/pms/` imports only from `@repo/config/pms`
- Deprecation warning logs when `TENANT_DB_NAME_PERFIX` is set without `TENANT_DB_NAME_PREFIX`
- All services build and start without errors

---

## TIER 3 — MEDIUM PRIORITY

---

### ISSUE-010 · POS Backend Has No TypeScript — Untyped JavaScript

**Status:** ACTIVE — Incremental migration  
**Severity:** MEDIUM  
**Effort:** L  
**Depends on:** Nothing (start immediately, migrate incrementally)

**Root Cause:**  
`services/posnew/apps/pos-backend/` is entirely CommonJS JavaScript. No TypeScript, no `tsconfig.json`, no type checking in CI. Runtime type errors that TypeScript would catch at compile time can reach production undetected.

**Affected:**
```
services/posnew/apps/pos-backend/app.js             — Entry point
services/posnew/apps/pos-backend/controllers/        — All controllers
services/posnew/apps/pos-backend/models/             — Mongoose models
services/posnew/apps/pos-backend/routes/             — Express routes
services/posnew/apps/pos-backend/services/           — Business logic
services/posnew/apps/pos-backend/middlewares/        — Express middleware
services/posnew/apps/pos-backend/workers/            — BullMQ workers
```

**Resolution — Incremental (no big-bang rewrite):**

1. **Add TypeScript tooling without modifying existing `.js` files:**
   Add to `services/posnew/apps/pos-backend/package.json`:
   ```json
   {
     "devDependencies": {
       "typescript": "^5.9.0",
       "@types/express": "^5.0.0",
       "@types/node": "^22.0.0",
       "ts-node": "^10.9.0"
     }
   }
   ```

2. **Create `tsconfig.json`** with `allowJs: true` and `checkJs: false` (permissive mode — allows TypeScript and JavaScript to coexist):
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
       "resolveJsonModule": true,
       "esModuleInterop": true
     },
     "include": ["**/*.ts", "**/*.js"],
     "exclude": ["node_modules", "dist"]
   }
   ```

3. **Rule going forward:** Any new file added to `pos-backend/` must be TypeScript (`.ts`). No new `.js` files.

4. **Migrate the 3 highest-risk files first** (these touch auth and error handling):
   - `middlewares/authMiddleware.js` → `authMiddleware.ts`
   - `services/platformService.js` → `platformService.ts`
   - `middlewares/globalErrorHandler.js` → `globalErrorHandler.ts`

5. **Convert Mongoose models to TypeScript** — highest value for type safety:
   ```typescript
   // models/orderModel.ts
   import mongoose, { Document, Schema, Model } from "mongoose";
   export interface IOrder extends Document {
     orgId: string;
     status: "pending" | "completed" | "cancelled";
     total: number;
     // ...
   }
   const OrderSchema = new Schema<IOrder>({ ... });
   export const Order: Model<IOrder> = mongoose.model("Order", OrderSchema);
   ```

6. **Enable `checkJs: true` per-file** using `// @ts-check` at the top of each `.js` file as it is reviewed.

7. **Add TypeScript check to CI:**
   ```yaml
   - name: POS backend type check
     run: pnpm --filter pos-backend exec tsc --noEmit
   ```

**Acceptance Criteria:**
- `services/posnew/apps/pos-backend/tsconfig.json` exists
- All new `.js` additions are blocked by a PR review rule (or CI `find` check)
- The 3 high-risk files are migrated to TypeScript
- `tsc --noEmit` runs in CI with zero errors on TypeScript files

---

### ISSUE-011 · POS Backend Uses `console.error` — No Structured Logging

**Status:** ACTIVE  
**Severity:** MEDIUM  
**Effort:** S  
**Depends on:** Nothing (can be done in JavaScript — does not require ISSUE-010)

**Root Cause:**  
`app.js` and all error handlers use `console.log()` / `console.error()` for output. Unstructured text cannot be parsed by Prometheus, Grafana, or any log aggregation pipeline. The control plane and PMS both use structured JSON logging via `@repo/shared/structured-logger`.

**Affected:**
```
services/posnew/apps/pos-backend/app.js
services/posnew/apps/pos-backend/middlewares/globalErrorHandler.js
services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js
services/posnew/apps/pos-backend/workers/*.js
```

**Resolution — Step by Step:**

1. **Create `services/posnew/apps/pos-backend/lib/logger.js`:**
   ```javascript
   "use strict";
   function write(stream, payload) {
     stream.write(JSON.stringify(payload) + "\n");
   }
   module.exports = {
     info: (msg, meta = {}) =>
       write(process.stdout, { level: "info", msg, ts: new Date().toISOString(), service: "pos-backend", ...meta }),
     warn: (msg, meta = {}) =>
       write(process.stderr, { level: "warn", msg, ts: new Date().toISOString(), service: "pos-backend", ...meta }),
     error: (msg, err, meta = {}) =>
       write(process.stderr, {
         level: "error", msg, ts: new Date().toISOString(), service: "pos-backend",
         error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
         ...meta,
       }),
   };
   ```

2. **Grep for all `console.*` usages** to know the full scope:
   ```bash
   grep -r "console\." services/posnew/apps/pos-backend --include="*.js" -l
   ```

3. **Replace in `app.js`** — startup messages and uncaught exception handlers.

4. **Replace in `globalErrorHandler.js`** — all error logging must use `logger.error()`.

5. **Replace in all workers** — BullMQ worker job errors must use `logger.error()`.

6. **Add `"service": "pos-backend"` tag** to all log entries so Grafana can filter by service.

**Acceptance Criteria:**
- `grep "console\." services/posnew/apps/pos-backend/app.js | wc -l` returns `0`
- `docker logs {pos-backend-container}` output is valid JSON per line
- POS error logs include `error.stack` in the JSON payload

---

### ISSUE-012 · No Distributed Tracing — Grafana Tempo as Collector

**Status:** ACTIVE — Grafana Tempo chosen  
**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** Nothing

**Decision:** Grafana Tempo is the trace collector. Rationale: Grafana already runs in `infra/prod/docker-compose.yml`. Adding Tempo integrates traces directly with existing dashboards via TraceQL and exemplars, with zero additional UI to manage.

**Root Cause:**  
OpenTelemetry is configured only in `apps/api/src/instrumentation.ts` and `packages/platform-worker-shared/`. `services/pms/`, `services/posnew/apps/pos-backend/`, and `services/stockix-finance/packages/server/` have no tracing. Cross-service call chains (control plane → PMS → Finance sync; POS → Finance sync via BullMQ) produce broken traces — only the first hop is visible.

**Affected:**
```
services/pms/src/index.ts                        — No OpenTelemetry setup
services/pms/src/lib/finance-sync.ts             — Cross-service calls untraced
services/posnew/apps/pos-backend/app.js          — No OpenTelemetry setup
services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js  — Untraced
apps/api/src/instrumentation.ts                  — Extend initTracing helper here
packages/platform-worker-shared/src/             — Add shared initTracing() here
infra/prod/docker-compose.yml                    — Add Grafana Tempo service
```

**Resolution — Step by Step:**

1. **Create a shared `initTracing(serviceName)` function** in `packages/platform-worker-shared/src/tracing.ts`:
   ```typescript
   import { NodeSDK } from "@opentelemetry/sdk-node";
   import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
   import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
   import { Resource } from "@opentelemetry/resources";
   import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

   export function initTracing(serviceName: string): void {
     if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
     const sdk = new NodeSDK({
       resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName }),
       traceExporter: new OTLPTraceExporter({
         url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
       }),
       instrumentations: [getNodeAutoInstrumentations()],
     });
     sdk.start();
   }
   ```

2. **Add tracing to `services/pms/src/index.ts`** (before anything else runs):
   ```typescript
   import { initTracing } from "@repo/platform-worker-shared/tracing";
   initTracing("stockix-pms");
   ```

3. **Add W3C Trace Context propagation** to PMS → Finance sync in `services/pms/src/lib/finance-sync.ts`:
   - Inject `traceparent` header on all outbound HTTP calls to Finance
   - Use `@opentelemetry/api` context propagation API

4. **Add tracing to POS backend** in `services/posnew/apps/pos-backend/app.js`:
   ```javascript
   // Must be first line before any require()
   require("./lib/tracing").initTracing("stockix-pos-backend");
   ```
   Create `lib/tracing.js` (CommonJS version of the TypeScript helper above).

5. **Add Grafana Tempo to `infra/prod/docker-compose.yml`:**
   ```yaml
   tempo:
     image: grafana/tempo:latest
     command: ["-config.file=/etc/tempo.yaml"]
     volumes:
       - ./tempo/tempo.yaml:/etc/tempo.yaml
       - tempo-data:/var/tempo
     networks:
       - stockix-internal
     restart: unless-stopped

   volumes:
     tempo-data:
   ```

6. **Create `infra/prod/tempo/tempo.yaml`** config:
   ```yaml
   server:
     http_listen_port: 3200
   distributor:
     receivers:
       otlp:
         protocols:
           http:
             endpoint: 0.0.0.0:4318
   storage:
     trace:
       backend: local
       local:
         path: /var/tempo/traces
   ```

7. **Add `OTEL_EXPORTER_OTLP_ENDPOINT` to all service env blocks** in `infra/prod/docker-compose.yml`:
   ```yaml
   environment:
     OTEL_EXPORTER_OTLP_ENDPOINT: "http://tempo:4318"
   ```
   Apply to: `api`, `api-bullmq`, `pms` (when deployed), `pos-backend` (when deployed).

8. **Link Grafana to Tempo** — add Tempo as a data source in `infra/prod/grafana/provisioning/datasources/`:
   ```yaml
   apiVersion: 1
   datasources:
     - name: Tempo
       type: tempo
       url: http://tempo:3200
       isDefault: false
   ```

9. **Add `OTEL_EXPORTER_OTLP_ENDPOINT` to `infra/prod/.env.example`.**

**Acceptance Criteria:**
- A control-plane API request generates a trace visible in Grafana Explore → Tempo
- PMS iCal sync generates a trace with spans visible in Tempo
- POS BullMQ worker sync job appears in a connected trace
- `OTEL_EXPORTER_OTLP_ENDPOINT` is set and documented in `.env.example`
- Grafana Explore → Tempo shows traces for all 3 services

---

### ISSUE-013 · Unified Shadcn Migration — Dashboard and POS Consume `@repo/ui`

**Status:** ACTIVE — Follows ISSUE-006  
**Severity:** MEDIUM  
**Effort:** M  
**Depends on:** ISSUE-006 (Path A must be complete first)

**Root Cause:**  
After ISSUE-006 populates `@repo/ui`, this issue tracks the consumer migration: dashboard deletes its local `components/ui/` and POS frontend aligns its components with the shared package.

**Affected:**
```
apps/dashboard/components/ui/*.tsx                         — 35+ files to delete after migration
services/posnew/apps/pos-frontend2/src/components/ui/*.tsx — 11 files to reconcile
packages/ui/src/                                           — Target (populated by ISSUE-006)
```

**Resolution — Step by Step:**

1. **Confirm ISSUE-006 is complete** — `packages/ui/src/` has ≥ 30 components and `@repo/ui` builds cleanly.

2. **Diff the two local UI directories:**
   ```bash
   diff <(ls apps/dashboard/components/ui/ | sort) \
        <(ls services/posnew/apps/pos-frontend2/src/components/ui/ | sort)
   ```

3. **For components in both** — they are now in `@repo/ui` (from ISSUE-006). Remove the POS local copy, update POS imports:
   ```bash
   # In services/posnew/apps/pos-frontend2/
   grep -r '@/components/ui/' src --include="*.tsx" -l
   # Replace each: "@/components/ui/button" → "@repo/ui/button"
   ```

4. **For POS-specific components** (in POS but not in dashboard) — evaluate:
   - If generally useful across products → move to `@repo/ui`
   - If POS-specific → keep in `services/posnew/apps/pos-frontend2/src/components/ui/` but add a comment explaining it is intentionally local

5. **Delete `apps/dashboard/components/ui/`** — all imports were migrated by ISSUE-006.

6. **Update `services/posnew/apps/pos-frontend2/package.json`** to declare `@repo/ui` as a workspace dependency:
   ```json
   {
     "dependencies": {
       "@repo/ui": "workspace:*"
     }
   }
   ```

7. **Verify both apps build and render correctly:**
   ```bash
   pnpm --filter apps/dashboard build
   pnpm --filter pos-frontend2 build
   ```

**Acceptance Criteria:**
- `ls apps/dashboard/components/ui/ 2>/dev/null | wc -l` returns `0`
- POS frontend imports shared components from `@repo/ui`
- Both dashboard and POS build with zero import errors
- Visual spot-check of 5 dashboard pages shows no broken UI

---

### ISSUE-014 · Dashboard Route Handlers Contain Business Logic

**Status:** ACTIVE  
**Severity:** LOW  
**Effort:** L  
**Depends on:** ISSUE-007 Stage 2 (dashboard must be migrated to `/v1` paths first)

**Root Cause:**  
`apps/dashboard/app/api/` contains Next.js Route Handlers that go beyond session management and act as a second API layer — some validate inputs, make decisions, and transform responses. This means the control plane API is not a complete standalone API product. External consumers using `sk_live_*` API keys bypass this logic entirely, creating divergent behavior.

**Affected:**
```
apps/dashboard/app/api/auth/*.ts            — Session cookie set/clear (intentional, keep)
apps/dashboard/app/api/tenants/*.ts         — Some contain transformation logic
apps/dashboard/app/api/licenses/*.ts        — Some contain business decisions
apps/dashboard/app/api/owners/*.ts          — Some contain validation
apps/dashboard/app/api/mfa/*.ts             — MFA flow (partially intentional)
```

**Resolution — Step by Step:**

1. **Audit every Route Handler file** — classify each function as one of:
   - **A — Session management** (sets/reads `stockix-session` cookie): keep in dashboard, intentional
   - **B — Pure proxy** (just forwards to `apps/api` with auth header): eliminate, call API from client
   - **C — Business logic** (validates, transforms, makes decisions): move to `apps/api`

2. **For Type B (pure proxies)** — delete the Route Handler. Update the client component to call the API directly using `fetch` with the session JWT in the Authorization header.

3. **For Type C (business logic)** — extract the logic and create a proper endpoint in `apps/api/src/routes/`. The Route Handler then becomes a Type B pure proxy, which is then also eliminated.

4. **Document Type A Route Handlers** — add a comment at the top of each intentional session handler explaining why it must stay in the dashboard (e.g., `// Sets HttpOnly session cookie — must live in dashboard, not in API`).

5. **Update the `CLAUDE.md` dashboard section** to document which Route Handlers are intentional and why.

**Acceptance Criteria:**
- All Route Handler files are classified and documented
- No Route Handler performs database queries directly or contains business rules
- The control plane API (`apps/api`) is the single source of truth for all non-session operations
- Session Route Handlers have a comment explaining their dashboard residency

---

## TIER 4 — LONG-TERM

---

### ISSUE-015 · PMS Database Migration Execution

**Status:** ACTIVE — Design in ISSUE-002, execute here  
**Severity:** CRITICAL  
**Effort:** XL  
**Depends on:** ISSUE-002 (architecture design complete), ISSUE-004 (package rename), ISSUE-008 (Turborepo integration)

**Note:** ISSUE-002 covers the architectural decision and data migration script design. This issue covers the actual staging-to-production execution timeline.

**Key execution milestones:**

1. **Month 1:** `@repo/pms-db` package created; PMS service wired to use it in a development branch; all PMS tables removed from `packages/db/src/schema.ts` in that branch; build verified.

2. **Month 2:** Staging migration executed. `stockix_pms` database created on staging Postgres server. `scripts/migrate-pms-to-isolated-db.mjs` runs and copies all 19 PMS tables. Staging environment runs fully with isolated PMS for a minimum of 2 weeks.

3. **Month 3:** Production migration with zero-downtime dual-write window (2 weeks). Both databases receive writes; reads come from the new `stockix_pms` database. Monitor for divergence.

4. **Month 4:** Dual-write disabled. Old PMS tables dropped from control-plane DB via migration. Backups updated to include `stockix_pms` database. `PMS_DATABASE_URL` added to all infrastructure configs permanently.

---

### ISSUE-016 · Finance Frontend Migration from Blueprint.js to Shadcn/Tailwind

**Status:** DEFERRED — Out of current engineering scope  
**Severity:** LOW  
**Effort:** XL  
**Depends on:** ISSUE-006, ISSUE-013

`services/stockix-finance/packages/webapp` uses Blueprint.js 4.x. The control plane and POS use Shadcn + Tailwind. This is a known design system inconsistency. Migration will proceed component-by-component once ISSUE-006 and ISSUE-013 are complete and the shared UI package is stable. No timeline set.

---

### ISSUE-017 · Single-Server Deployment — No High Availability

**Status:** ACTIVE — Long-term planning  
**Severity:** HIGH  
**Effort:** XL  
**Depends on:** ISSUE-015 (PMS isolation required before sharding)

**Root Cause:**  
All production workloads run on a single EC2 instance with Docker Compose. No load balancer, no failover, no horizontal scaling.

**Chosen path: Docker Swarm first, then ECS Fargate**

- **Phase 1 (Docker Swarm — 4–6 weeks):** Convert to Swarm mode on 2 nodes. `docker service create` replaces `docker compose up`. Traefik supports Swarm natively. Achieves basic HA quickly.
- **Phase 2 (AWS ECS Fargate — 8–12 weeks, 12 months out):** Port each service to a Fargate task definition. AWS ALB replaces Traefik. RDS PostgreSQL replaces self-managed Postgres. Secrets Manager integration added at this stage (completing ISSUE-003).

---

### ISSUE-018 · Metadata-Driven UI

**Status:** DEFERRED — Out of current engineering scope  
**Severity:** MEDIUM  
**Effort:** XL  
**Depends on:** ISSUE-006, ISSUE-013

No screens, forms, or navigation are generated from metadata today. The foundation exists (`featureFlags` table, `@repo/shared/permissions` strings, `tenants.modules` JSON array) but no registry system is built on top of it. This is a long-term product capability. No timeline set.

---

## Execution Sequencing

```
STEP 1  — ISSUE-005 · Delete scratch files from root
          (zero risk, cleans repo immediately)

STEP 2  — ISSUE-004 · Rename @repo/shared in Finance → @stockix/finance-shared
          (unblocks ISSUE-008)

STEP 3  — ISSUE-011 · POS structured logging
          (fast win, one new file + replacements)

STEP 4  — ISSUE-009 · Split god config into domain modules
          (wide but mechanical — every change is isolated to packages/config)

STEP 5  — ISSUE-008 · Finance Lerna → Turborepo
          (requires STEP 2 complete)

STEP 6  — ISSUE-006 · Promote @repo/ui to real shared Shadcn package
          (Path A — unblocks STEP 7)

STEP 7  — ISSUE-007 Stage 1 · Mount API routes under /v1, add legacy aliases with Deprecation headers
          (API server only, no consumer changes)

STEP 8  — ISSUE-007 Stage 2 · Migrate dashboard Route Handlers to /v1 calls
          (1 week after Stage 1 stable)

STEP 9  — ISSUE-007 Stage 3 · Migrate POS backend to /v1 calls
          (1 week after Stage 2 stable)

STEP 10 — ISSUE-007 Stage 4 · Migrate Finance server to /v1 calls
          (1 week after Stage 3 stable)

STEP 11 — ISSUE-010 · POS TypeScript tooling setup + first 3 files
          (incremental, can run in parallel with steps 6–10)

STEP 12 — ISSUE-012 · Distributed tracing with Grafana Tempo
          (Tempo added to infra, tracing init in PMS + POS)

STEP 13 — ISSUE-013 · Unified Shadcn migration (POS consumes @repo/ui)
          (requires STEP 6 complete)

STEP 14 — ISSUE-002 · PMS database isolation design + scripts
          (architecture phase, no production impact yet)

STEP 15 — ISSUE-015 · PMS database migration execution (staging → prod)
          (requires STEP 14 complete; 4-month timeline)

STEP 16 — ISSUE-007 Stage 5 · Remove legacy unversioned aliases (90-day sunset)
          (date: 2026-09-20)

STEP 17 — ISSUE-014 · Dashboard Route Handler business logic cleanup
          (after STEP 8 is complete and stable)

STEP 18 — ISSUE-017 · HA migration: Docker Swarm → ECS Fargate
          (long-term, after STEP 15)

DEFERRED — ISSUE-001 · C:\ git history cleanup (when team is ready to re-clone)
DEFERRED — ISSUE-003 · Secrets manager (when ISSUE-017 ECS phase begins)
OUT OF SCOPE — ISSUE-016 · Finance Blueprint.js migration
OUT OF SCOPE — ISSUE-018 · Metadata-driven UI
```

---

## Dependency Graph

```
ISSUE-001 ─── (no deps) — DEFERRED
ISSUE-002 ─── (no deps) ──► ISSUE-015
ISSUE-003 ─── (no deps) — DEFERRED until ISSUE-017
ISSUE-004 ─── (no deps) ──► ISSUE-008
ISSUE-005 ─── (no deps)
ISSUE-006 ─── (no deps) ──► ISSUE-013 ──► ISSUE-016 (deferred)
ISSUE-007 ─── (no deps, staged) ──► ISSUE-014
ISSUE-008 ─── ISSUE-004
ISSUE-009 ─── (no deps)
ISSUE-010 ─── (no deps, incremental)
ISSUE-011 ─── (no deps)
ISSUE-012 ─── (no deps)
ISSUE-013 ─── ISSUE-006
ISSUE-014 ─── ISSUE-007 Stage 2
ISSUE-015 ─── ISSUE-002 + ISSUE-004 + ISSUE-008
ISSUE-016 ─── ISSUE-006 + ISSUE-013 — OUT OF SCOPE
ISSUE-017 ─── ISSUE-015
ISSUE-018 ─── ISSUE-006 + ISSUE-013 — OUT OF SCOPE
```

---

## Issue Summary Table

| ID | Title | Tier | Severity | Effort | Status | Depends On |
|----|-------|------|---------|--------|--------|-----------|
| ISSUE-001 | Remove `C:\` artifact from git history | 0 | CRITICAL | S | DEFERRED | — |
| ISSUE-002 | PMS data isolation — architecture design | 0 | CRITICAL | XL | ACTIVE | — |
| ISSUE-003 | Secrets manager | 0 | HIGH | L | DEFERRED | ISSUE-017 |
| ISSUE-004 | Rename `@repo/shared` in Finance | 1 | HIGH | S | ACTIVE | — |
| ISSUE-005 | Remove scratch files from root | 1 | MEDIUM | S | ACTIVE | — |
| ISSUE-006 | Promote `@repo/ui` to real shared Shadcn (Path A) | 1 | HIGH | M | ACTIVE | — |
| ISSUE-007 | Add `/v1` API versioning — staged rollout | 2 | HIGH | M | ACTIVE | — |
| ISSUE-008 | Finance Lerna → Turborepo | 2 | MEDIUM | M | ACTIVE | ISSUE-004 |
| ISSUE-009 | Split god config into domain modules | 2 | MEDIUM | M | ACTIVE | — |
| ISSUE-010 | POS backend TypeScript migration | 3 | MEDIUM | L | ACTIVE | — |
| ISSUE-011 | POS backend structured logging | 3 | MEDIUM | S | ACTIVE | — |
| ISSUE-012 | Distributed tracing — Grafana Tempo | 3 | MEDIUM | M | ACTIVE | — |
| ISSUE-013 | Unified Shadcn migration (POS → `@repo/ui`) | 3 | MEDIUM | M | ACTIVE | ISSUE-006 |
| ISSUE-014 | Route Handler business logic → `apps/api` | 3 | LOW | L | ACTIVE | ISSUE-007 S2 |
| ISSUE-015 | PMS database migration execution | 4 | CRITICAL | XL | ACTIVE | ISSUE-002, ISSUE-004 |
| ISSUE-016 | Finance Blueprint.js → Shadcn | 4 | LOW | XL | OUT OF SCOPE | — |
| ISSUE-017 | HA / Docker Swarm → ECS migration | 4 | HIGH | XL | ACTIVE | ISSUE-015 |
| ISSUE-018 | Metadata-driven UI foundation | 4 | MEDIUM | XL | OUT OF SCOPE | — |

---

*All decisions are locked. This document is approved for execution when the engineer signs off below.*

**Approved by:** _____________________ **Date:** _____________________
