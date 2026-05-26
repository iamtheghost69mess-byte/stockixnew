# pos-backend

Express.js **tenant API** for the POS product: authentication, RBAC, catalog, tables/orders, kitchen, inventory, accounting, procurement hooks, printing, and public guest endpoints (e.g. self-order).

## Documentation

- **Architecture, module status, and route inventory:** [`../../SYSTEM_AUDIT_MASTER.md`](../../SYSTEM_AUDIT_MASTER.md)

Use that document for Accounting / Inventory / POS behavior, known integrity gaps (e.g. order `paid` vs GL posting), and mounted paths. OpenAPI specs live under `openapi/` (including `tenant-pos-v1.yaml`).

### Platform organizations (SaaS / internal)

- **Commercial license** (`licenseStartsAt`, `licenseEndsAt`): tenant-facing window. On **create org**, if the client omits these fields, the API sets **start = creation time** and **end = one calendar year later (UTC)**. They can still be cleared or overridden via `PATCH /organizations/:id/license`.
- **Entitlements** (`PATCH /organizations/:id/entitlements`): caps **`maxUsers`** and **`maxLocations`** cannot be set **below** the current live user count or location count (returns **400**).
- **Hostess (POS)**: new tenants get default bootstrap roles including **hostess** in default credentials. Orgs that already had users before that role existed are **not** auto-backfilled; add the user manually or run a one-off migration.

## Run locally

```bash
npm install   # from monorepo root, or here if workspace-aware
npm run dev   # nodemon app.js
```

Copy and edit environment variables from `.env.example`.

## Common scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | API with nodemon |
| `npm run start` | Production-style `node app.js` |
| `npm test` | Unit + OpenAPI contract tests (see **Testing**) |
| `npm run migrate:schema` | Schema migrations helper |
| `npm run seed:dev` | Dev staff seed (see `scripts/`) |

Workers (if you use them): `npm run worker:platform`, `npm run worker:print`.

## Testing

Run commands from **`apps/pos-backend/`** unless noted. From the Stockix repo root you can use `pnpm test:pos` (unit/contract only) or `pnpm --filter pos-backend <script>`.

### Prerequisites (common)

| Need | Used by |
|------|---------|
| `MONGODB_URI` | Most integration selftests, `test:isolation`, accounting/inventory DB suites |
| `JWT_SECRET`, `PLATFORM_JWT_SECRET` (32+ chars in prod) | Auth, SaaS integration, platform API tests |
| API **running** on `8010` (or `API_BASE` / `PLATFORM_DASHBOARD_TEST_BASE_URL`) | HTTP smokes: `test:inventory:http-smoke`, `test:saas-owner-dashboard` |
| `RUN_*=1` gate env vars | Some scripts skip unless explicitly enabled (see each row) |
| Redis | Optional for many tests; unset `REDIS_URL` locally to avoid long `/ready` timeouts in `test:saas-integration` |

**E2E checklists (manual):** [docs/section-2.1-e2e-checklist.md](../../../../docs/section-2.1-e2e-checklist.md), [docs/section-2.3-license-e2e-checklist.md](../../../../docs/section-2.3-license-e2e-checklist.md).

---

### Default suite (no server required)

| npm script | What it runs |
|------------|----------------|
| `npm test` | `node --test tests/unit/*.test.js` + `tests/openapi-contract.test.js` + `tests/tenant-openapi-contract.test.js` |
| `npm run test:openapi` | OpenAPI contract tests only |

**Unit coverage highlights** (`tests/unit/`): lifecycle/access (`organization-lifecycle-access`, `organization-provisioning-status`, `bootstrap-credential-reveal`, `stxi-license-validate`), license window, RBAC/platform auth, inventory costing/adjust/offline keys, stock-take serial guard, accounting posting, entitlements, orders/payments, observability, and more.

---

### SaaS, platform, and multi-tenant integration

| npm script | Script file | Notes |
|------------|-------------|--------|
| `npm run test:saas-integration` | `scripts/saas-integration-selftest.js` | In-process Express + Mongo seed: tenant + platform APIs, org lifecycle, invitations. Env: `SELFTEST_KEEP_DATA=1` to keep seed data. |
| `npm run test:saas-owner-dashboard` | `scripts/saas-owner-dashboard-api-test.js` | **Requires running API.** `PLATFORM_OWNER_EMAIL` + `PLATFORM_OWNER_PASSWORD`. Flags: `--seed-owner`, `--include-refresh`, `--json`. |
| `npm run test:platform` | `scripts/platform-api-selftest.js` | Platform v1 API smoke (health, auth shape). |
| `npm run test:subdomain-org` | `scripts/subdomain-org-selftest.js` | Subdomain → org resolution, PIN login scoping, device org order. |
| `npm run test:org-tenant-url` | `scripts/organization-tenant-url-selftest.js` | Tenant URL / host mapping checks. |
| `npm run test:isolation` | `tests/isolation.test.js` | Cross-tenant API isolation. **`RUN_ISOLATION=1`** required. |

---

### Auth, tokens, and RBAC

| npm script | Script file | Notes |
|------------|-------------|--------|
| `npm run test:phase1` | `scripts/phase1-check.sh` | Bash: PIN login → token → role 403. **Requires running server** + `ADMIN_PIN` / `WAITER_PIN`. |
| `npm run test:phase1:tokens` | `scripts/phase1-tokens-selftest.js` | JWT issue/verify helpers (no server). |
| `npm run test:staff-entitlements` | `scripts/staff-entitlements-selftest.js` | `maxUsers` seat cap. **`RUN_STAFF_ENTITLEMENTS_SELFTEST=1`** + `MONGODB_URI`. |
| `npm run test:rbac` | `scripts/rbac-smoke-test.js` | RBAC smoke against API or in-process. |
| `npm run test:rbac:matrix` | `scripts/rbac-permissions-matrix-test.js` | Permission matrix vs routes. |
| `npm run test:rbac:defaults` | `scripts/rbac-default-roles-test.js` | Default role permission bundles. |

---

### Floor and tables

| npm script | Script file | Notes |
|------------|-------------|--------|
| `npm run test:table-floor` | `scripts/table-floor-phase1-selftest.js` | Table/floor phase-1 API behavior. |
| `npm run test:floor-full` | `scripts/floor-feature-full-selftest.js` | Full floor feature selftest. |

---

### Inventory

| npm script | Script file | Notes |
|------------|-------------|--------|
| `npm run test:inventory` | `scripts/inventory-deduct-selftest.js` | Stock deduct / fulfillment logic (Mongo). |
| `npm run test:inventory:http-smoke` | `scripts/inventory-http-smoke.js` | **Requires running API** + dev seed (`seed:dev`). Optional `API_BASE`, `INVENTORY_SMOKE_PIN`. |
| `npm run test:inventory:integration` | `scripts/inventory-integration-seed-test.js` | Seeded inventory scenario + order flow hooks (Mongo). |

---

### Accounting

| npm script | Script file | Notes |
|------------|-------------|--------|
| `npm run test:accounting` | `accounting-api-check.js` + `accounting-bank-import.js` | Full accounting capability areas (Mongo); optional `ACCOUNTING_HTTP=1` for live HTTP. |
| `npm run test:accounting:mandatory` | `accounting-mandatory-automated.js` | PDF selftest + studio verification when `MONGODB_URI` set. |
| `npm run test:accounting:studio` | `scripts/accounting-studio-verification.js` | Service-layer AR/AP/reports smoke. |
| `npm run test:accounting:pdf` | `scripts/accounting-pdf-selftest.js` | PDF generation sanity (no DB). |
| `npm run test:accounting:bank-import` | `scripts/accounting-bank-import.js` | Bank import parsing/checks. |

---

### Printing, sockets, and API surface

| npm script | Script file | Notes |
|------------|-------------|--------|
| `npm run test:print:live` | `scripts/print-order-live-test.js` | Live print pipeline (hardware/env dependent). |
| `npm run test:socket-redis` | `scripts/socket-redis-adapter-selftest.js` | Socket.IO Redis adapter wiring. |
| `npm run test:api-surface` | `scripts/full-api-surface-test.js` | Broad route surface exercise (heavy; needs env). |

---

### POS monorepo shortcuts (`services/posnew/`)

From `services/posnew/` (proxies to this package):

| Script | Maps to |
|--------|---------|
| `pnpm run test:saas-integration` | `pos-backend` `test:saas-integration` |
| `pnpm run test:inventory:http-smoke` | `pos-backend` `test:inventory:http-smoke` |
| `pnpm run test:accounting:mandatory` | `pos-backend` `test:accounting:mandatory` |
| `pnpm run test:print:live` | `pos-backend` `test:print:live` |
| `pnpm run test:printer-phases` | `scripts/test-printer-phases.sh` |
| `pnpm run test:printers` | `tools/fake-printers/run-all.js` |
| `pnpm run test:qa-checklist` | `scripts/zerowix-qa-checklist-selftest.js` |

From **Stockix repo root**: `pnpm test:pos` → `pos-backend` `npm test` only.

---

### Manual / helper scripts (no `package.json` entry)

| Run directly | Purpose |
|--------------|---------|
| `node scripts/order-lifecycle-selftest.js` | Loads order lifecycle modules; optional Mongo connectivity check (no writes). |
| `node scripts/setup_testing_master_data.js` | Seeds master data for manual QA (see script header). |

---

### Quick copy-paste

```bash
# Fast, no Mongo (unit + contracts)
npm test

# SaaS multi-tenant (in-process; needs MONGODB_URI)
npm run test:saas-integration

# License / lifecycle units
node --test tests/unit/organization-lifecycle-access.test.js tests/unit/stxi-license-validate.test.js

# Staff seat cap (gated)
RUN_STAFF_ENTITLEMENTS_SELFTEST=1 npm run test:staff-entitlements

# Cross-tenant isolation (gated)
RUN_ISOLATION=1 npm run test:isolation
```

## Entry point

Application bootstrap and route mounting: `app.js`.
