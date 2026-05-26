# Provisioning, License & Plans — Complete Reference

Single source of truth for: how tenants are created, licensed, migrated, and production readiness.

**Last consolidated:** 2026-05-24  
**Supersedes:** `PROVISIONING_AUDIT.md`, `PLANS_LICENSE_AUDIT.md`, `MIGRATION_SYSTEM_REPAIR_REPORT.md`, `PRODUCTION_READINESS_REPORT.md`, `STAGING_VERIFICATION.md`, `VERIFICATION_REPORT.md`, `accountmissing2.md` (ops portions)

---

## Table of Contents

1. [Provision Flow (step by step)](#1-provision-flow-step-by-step)
2. [Module Scenarios](#2-module-scenarios)
3. [License System](#3-license-system)
4. [Plans & Limits](#4-plans--limits)
5. [Migration System](#5-migration-system)
6. [What Gets Created Automatically](#6-what-gets-created-automatically)
7. [Gap Status](#7-gap-status)
8. [Production Readiness](#8-production-readiness)
9. [Staging Verification Checklist](#9-staging-verification-checklist)

---

## 1. Provision Flow (step by step)

### Entry points

| Trigger | Path |
|---------|------|
| Dashboard wizard | `POST /api/tenants` via BFF |
| API | `apps/api/src/index.ts` — validates modules, plan, owner |
| Job | `tenant_lifecycle_jobs` type `tenant.provision` |
| Worker | `infra/worker-service` claims job → `executeProvisionRuntime` |

**Payload fields:** `slug`, `name`, `ownerId`, `adminEmail`, `adminFirstName`, `adminLastName`, `planSlug`, `modules`, `assignExistingLicenseId`.

### A. `modules=['accounting','pos']`, `PROVISION_MODULE_GATING=0` (local default)

1. Insert `tenants` + `tenant_deployments` (`provisioning`).
2. **Finance path (always when gating off):** secrets, tenant `.env`, `docker compose up` Finance stack.
3. `tenant.bootstrap_admin` → `POST /api/internal/provision-user`.
4. `tenant.build_organization` → COA seed, org build poll.
5. If bundle: `tenant.activate_warehouses`, `tenant.seed_pos_defaults`.
6. `edge.publish` → Traefik `{slug}.{ROOT_DOMAIN}`.
7. `syncFinanceLicense`.
8. `provisionPosStack` → POS compose (non-fatal on failure when gating off).
9. `bootstrapPosOrganization` → platform org + PIN bootstrap.
10. `tenant.wire_pos_integration` → IntegrationConfig (when accounting+pos).
11. API job complete → `active`, auto-license, persist Finance/POS IDs.

### B. `modules=['pos']`, `PROVISION_MODULE_GATING=1` (prod)

1. Control-plane DB insert only for Finance skip.
2. **Skip** Finance compose, bootstrap, Traefik Finance URL.
3. `provisionPosStack` only → localhost/public POS Traefik routes.
4. Mark tenant `active`; synthetic password (not Finance bootstrap).
5. POS org still created via platform API if bootstrap runs.

### C. `modules=['accounting']` only

Same as A without steps 8–10 (no POS stack).

### D. Sub-organization (`organization.provision`)

- **One Finance Docker stack per Stockix tenant.** Additional organizations are new Finance `tenants` rows on that same stack, not separate compose projects.
- Dashboard: `POST /tenants/:tenantId/organizations` → worker job `organization.provision` ([org-provision-runtime.ts](../infra/worker-service/src/org-provision-runtime.ts)).
- Steps: `provision-user` on parent stack → sign-in → `build_organization` → COA `copy-from` parent Finance tenant → `set-parent` → `syncFinanceLicense` for child Finance `tenantId` using parent Stockix plan limits.
- COA copy failures set `organizations.provisioning_error` (non-fatal); org still becomes `active`.
- Separate-stack child tenants (`tenant.provision` with `parentTenantSlug`) use export/import COA ([copy-coa-across-stacks.ts](../infra/worker-service/domain/provisioning/adapters/copy-coa-across-stacks.ts)); failures are journaled as `tenant.copy_coa` warn events.
- Self-service org creation inside the Finance webapp alone is **not** supported for SaaS tenants (internal `TenantsManager` only).
- See [PLATFORM_REFERENCE.md §6](./PLATFORM_REFERENCE.md#6-multi-organization-architecture).

### Partial failure (accounting + pos)

If POS fails after Finance succeeds → tenant status **`partial`**, Finance deployment `active`, `last_error` set, `partial_failure_kind` = `pos_failed` | `wire_failed`.

| Repair | API | When |
|--------|-----|------|
| POS only | `POST /tenants/:id/retry-provision` `{ "retryPosOnly": true }` | `partial_failure_kind=pos_failed` |
| Wire only | `POST /tenants/:id/retry-provision` `{ "retryWireOnly": true }` | `partial_failure_kind=wire_failed` |
| Stuck provisioning | Same endpoint when `tenants.status=provisioning` and no running job | Resumes journal via prior `correlationId` when available |

**Wire resume (May 2026):** If journal has `tenant.wire_pos_integration` but `GET /api/platform/v1/organizations/:id/integration/bigcapital/health` reports unhealthy, the worker re-runs wire instead of skipping.

**Combined org guard:** On stacks with `FINANCE_INTERNAL_BASE_URL`, platform `POST /organizations` allows only the first org (or `Idempotency-Key: stockix-provision-*`). Additional orgs use control-plane `POST /tenants/:tenantId/organizations`.

Dashboard tenant detail shows targeted CTAs and integration checklist fields.

### Finance tenant link & stuck provisioning

- On provision job **complete**, API calls `resolveAndPersistFinanceTenantId` when the worker result omits `financeTenantId`.
- Background **stuck reconciler** (60s): aligns completed jobs still marked `provisioning`; auto-links `finance_tenant_id` when deployment is `active`.
- Readiness check `finance_tenant_id_missing` when `accounting` ∈ modules.

### Encrypted tenant `.env`

Sensitive keys in `infra/tenant-env/{slug}/.env` use **`enc:v1:`** (AES-256-GCM, `DEPLOYMENT_SECRET_KEY`). Finance server decrypts at boot (`bootstrap-decrypt-env.ts`). After upgrading Finance images, run `node apps/api/scripts/reencrypt-tenant-envs.mjs` for existing tenants.

### Setup wizard (SaaS-provisioned)

Worker calls `POST /api/internal/organization/setup/complete` after `tenant.build_organization` (journaled as `tenant.complete_setup_wizard`). First Finance login should skip `/setup/complete`.

### Provision progress stream (SSE)

`GET /tenants/provision-stream/:correlationId` replays `tenant_provision_events` once on connect, then pushes live rows via `subscribeProvision` (`apps/api/src/provision-bus.ts`). Worker and API inserts call `pg_notify('stockix_provision_event', …)`; the API runs `LISTEN` on startup (`provision-notify-listener.ts`) so events reach the bus without polling the events table. The stream loop only polls job terminal state and sends keepalive pings.

### Tenant branding (`tenant_config`)

- Control plane: `GET/PUT /tenants/:tenantId/config` (dashboard Branding tab).
- Provision seeds a default `tenant_config` row from tenant name.
- Worker maps config into tenant `.env` as `REACT_APP_STOCKIX_*` for Finance webapp builds.
- `PUT` config triggers `POST /api/internal/organization/branding/sync` on the Finance stack (org metadata name/color/logo URI).

### Finance internal API responses (snake_case)

Finance applies a global HTTP serializer: JSON bodies use **snake_case** keys (e.g. `primary_warehouse_id`, `walk_in_customer_id`). The worker and API **must** normalize responses via `@repo/shared/finance-api` (`normalizeFinanceApiJson` / `parseFinanceApiJsonText`) before validating camelCase fields. Without this, provision can fail with `activate_warehouses_failed:missing_primaryWarehouseId` even when Finance succeeded.

---

## 2. Module Scenarios

| Scenario | Schema/UI | Deploys (gating ON) | Auto-creates | Ready? |
|----------|-----------|---------------------|--------------|--------|
| Accounting only | ✅ | Finance stack | Finance tenant, admin, COA, Traefik, license | **Mostly YES** |
| POS only | ✅ | POS stack only | Docker + Mongo; org via platform API | **Partial** — org/PIN via bootstrap API |
| Accounting + POS | ✅ | Finance + POS + wire | Both stacks + IntegrationConfig wire | **YES*** after item mapping |
| PMS only | ✅ | PMS stack | PMS containers | **Partial** — validate staging |
| Chat only | ✅ | Chatwoot account id | Shared Chatwoot stack account | **Partial** |
| All modules | ✅ | All stacks | Combined above | Staging validation required |

### Local Chatwoot (`services/chatlive`)

Run the shared Chat stack on **http://localhost:3200** for manual or provisioning tests (dashboard stays on port 3000):

```bash
docker build -t stockix-chatlive:local -f services/chatlive/docker/Dockerfile services/chatlive/
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env up -d chatwoot-postgres chatwoot-redis
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env run --rm chatwoot bundle exec rails db:chatwoot_prepare   # first time
CHATWOOT_FRONTEND_URL=http://localhost:3200 docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env up -d chatwoot
```

Set `CHATWOOT_BASE_URL=http://localhost:3200` and `CHATWOOT_API_ACCESS_TOKEN` in root `.env` after Super Admin onboarding. Full steps, Windows Docker port workaround, and stop/reset commands: **`services/chatlive/README.md`** (Stockix local testing section).

### `PROVISION_MODULE_GATING`

```ts
// infra/worker-service/src/module-stacks.ts
process.env.PROVISION_MODULE_GATING === "1"
```

| Value | Behavior |
|-------|----------|
| `0` | **Ignores modules for Finance** — always full Finance stack even if `modules=['pos']` only |
| `1` | Skip Finance when `accounting` ∉ modules; provision only selected stacks |

**Production:** Set `PROVISION_MODULE_GATING=1` after validating three combinations.

### Stack contents

| Stack | Compose | Project name |
|-------|---------|--------------|
| Finance | `infra/tenant-stack/docker-compose.yml` | `stockix-tenant-{slug}` |
| POS | `infra/pos-tenant-stack/docker-compose.yml` | `stockix-pos-{slug}` |
| PMS | `infra/pms-tenant-stack/docker-compose.yml` | `stockix-pms-{slug}` |

### Module matrix test (`pnpm provision:modules`)

End-to-end gate for **accounting only**, **POS only**, and **accounting+POS**:

```bash
pnpm infra:worker:build          # then restart worker (see below)
pnpm pos:images:build            # first time / after POS Dockerfile changes
pnpm provision:modules -- --preflight
pnpm provision:modules -- --only accounting
pnpm provision:modules -- --only pos
pnpm provision:modules -- --only both
pnpm provision:modules
```

Requires: API + worker, Docker, seeded owners, `PROVISION_MODULE_GATING=1` for true POS-only (no Finance). Script: `apps/api/scripts/provision-module-matrix.mjs`.

**Worker bundle reload:** `pnpm dev` starts `infra/worker-service/.runtime/worker.js` once. After changing worker code, run `pnpm infra:worker:build` and **restart the worker** (or restart `pnpm dev`). Otherwise an old bundle can still fail steps like `activate_warehouses` even though source is fixed. Startup logs include `runtimeBundleMtime`.

**POS images:** Set `POS_APP_ROOT` to `services/posnew` (default). Before provisioning POS modules:

```bash
pnpm pos:images:build              # stockix-pos-backend:local + stub frontend (fast; needs packages/auth/dist — see .dockerignore)
pnpm pos:images:build -- --backend-only   # API/worker only
pnpm pos:images:build -- --full-frontend  # real Next.js image (slow; optional)
```

Provision starts `pos-mongo`, `pos-redis`, `pos-backend`, `pos-platform-worker` (BullMQ `org_bootstrap`), `pos-bigcapital-worker`, and `pos-frontend` only when `stockix-pos-frontend:local` exists (stub satisfies compose/Traefik). The worker runs `docker compose up -d` **without** `--build` so it uses these tags only; run `pnpm pos:images:build` before the first POS tenant.

**Finance API keys:** Internal HTTP responses use snake_case; workers normalize via `@repo/shared/finance-api` (`parseFinanceApiJsonText`).

Test tenants use slug prefix `mod-*`; remove rows and `docker compose -p stockix-mod-*` projects when cleaning up.

---

## 3. License System

### License schema (`licenses` table)

| Field | Purpose |
|-------|---------|
| `licenseKey` | `STKX-XXXX-XXXX-XXXX` (random 12 bytes) |
| `product` | `platform` \| `pos_desktop` \| `bundle` |
| `planSlug` | String ref to `plans.slug` (no FK) |
| `modules` | JSON array — `accounting`, `pos`, `pms`, `chat` |
| `tenantId` | FK → tenants (nullable until assign) |
| `status` | `unassigned` \| `active` \| `revoked` \| `expired` |
| `maxOrganizations`, `maxActivations` | Limits (see bugs below) |
| `gracePeriodDays` | Default 7 |
| `isPerpetual`, `expiresAt`, `validFrom` | Expiry model |

### Module support

| Module | Schema | JWT | Dashboard wizard |
|--------|--------|-----|------------------|
| accounting | ✅ | ✅ | ✅ |
| pos | ✅ | ✅ | ✅ |
| pms | ✅ | ✅ | ✅ |
| chat | ✅ | ✅ | ✅ |

**Generate:** `POST /licenses/generate` with `modules` array.  
**Product JWT:** `signProductToken` includes `modules` from tenant or payload.

### Auto-assign on provision

On job complete (unless `assign_existing_license_id`):

- Inserts `licenses` row: `product: platform`, `planSlug` from payload, `isPerpetual: true`, `modules` from payload.
- Updates `tenants.planSlug`.
- **Bug:** `maxOrganizations` often stays default `1` — not copied from plan (see §7).

### Sync to Finance

**Endpoint:** `POST {tenantInternalBaseUrl}/api/internal/license/sync`  
**Auth:** `x-internal-secret` = `INTERNAL_API_SECRET`  
**Target:** MySQL `tenant_licenses` in Finance stack.

| Event | Sync? |
|-------|-------|
| Provision complete (finance tenant id known) | ✅ |
| License assign / extend / revoke | ✅ |
| Worker expiry scan | ⚠️ **Partial** — status flips in Postgres; finance sync/email gaps |
| Generate unassigned | ❌ |

**Finance enforcement:** `LicenseGuard.middleware.ts` — suspended/expired → 402; grace blocks writes only.

### Expiry flow

- Worker cron `expireDueLicenses` every 5 min: sets `status='expired'` where past `expiresAt`.
- Emails: `sendLicenseExpiringEmail` (30-day warning on sync paths); `sendLicenseExpiredEmail` exists but **was not wired from worker expiry** (audit finding — verify current code).
- Tenant suspend maps to finance `suspended`.

### Revoke / suspend

- Revoke: `POST /licenses/:id/revoke` → `revoked`, deactivates activations, finance sync (maps to finance `suspended`).
- Tenant-level suspend separate from license status.

### POS activations

- `POST /licenses/activate` — hardware fingerprint, offline JWT (`LICENSE_SIGNING_SECRET`).
- Enforces `maxActivations` on license row.
- **Bug:** Allows `unassigned` status (see §7).

---

## 4. Plans & Limits

### Plans table (`plans`)

| Field | Default | Purpose |
|-------|---------|---------|
| `slug` | unique | `starter`, `growth`, `pro`, `enterprise` (seeded) |
| `maxOrganizations` | 1 | `-1` = unlimited |
| `maxActivations` | 1 | POS device activations (plan default) |
| `isActive` | true | Soft delete sets false |

**Not on plans:** price, billing interval (intentional gap for future billing).

### API routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/plans` | **Public** (audit flag — consider auth) |
| POST/PATCH/DELETE | `/plans` | `super_admin` |
| POST | `/licenses/generate` | `super_admin` |
| GET | `/licenses`, analytics, export | `read_only`+ |
| POST | assign, extend, revoke | role-gated |

### Limit enforcement

| Limit | Where enforced |
|-------|----------------|
| `maxOrganizations` | `plan-limits.ts` → org creation; Finance `assertCanCreateOrganization` (fix May 2026) |
| `maxActivations` | `/licenses/activate` only |
| Finance `maxUsers` | Sync maps from **plan.maxActivations** (semantic mismatch — devices vs users) |

### Known limit bugs (from audit)

1. **Plan limits not copied to license row** on generate/provision → org limit often stuck at 1.
2. **Finance sync reads plan limits; org gate reads license limits** → split brain.
3. **Multiple licenses per tenant** — `.limit(1)` without ORDER BY → ambiguous "current" license.

---

## 5. Migration System

**Scope:** `packages/db` — Drizzle ORM + PostgreSQL control plane.

### How it works

- Migrations: `packages/db/drizzle/*.sql` + `drizzle/meta/_journal.json`
- Tracking: `drizzle.__drizzle_migrations`
- Command: `pnpm db:migrate` → `packages/db/scripts/migrate.ts`
- **Never** use `drizzle-kit push` for production apply.

### Root cause (historical)

- Silent `baselineMigrationJournal()` marked migrations applied without running SQL.
- Journal missing entry for `0014_clumsy_dagger.sql`.

### Repair status (May 2026)

- 31 migrations; idempotent triple-run verified.
- Explicit repair: `STOCKIX_MIGRATION_REPAIR=baseline pnpm --filter @repo/db db:repair:baseline` (one-time only).

### Safe operations

```bash
# Normal (repeatable)
pnpm db:migrate

# After schema change
pnpm --filter @repo/db db:generate

# Finance (separate DB)
cd services/stockix-finance/packages/server
pnpm cli:system:migrate:latest
pnpm cli:tenants:migrate:latest
```

### Rules going forward

- Never auto-baseline without `STOCKIX_MIGRATION_REPAIR=baseline`
- Never edit applied `.sql` files — add new migration
- Every `.sql` must have `_journal.json` entry
- Run `pnpm db:migrate` before API/worker in prod and local `pnpm dev`

---

## 6. What Gets Created Automatically

### Finance (`accounting` module)

| Item | Auto? | Mechanism |
|------|-------|-----------|
| Control-plane tenant + deployment | ✅ | Postgres insert |
| Docker Finance stack | ✅ | `stockix-tenant-{slug}` |
| Finance DB tenant + admin | ✅ | `provision-user`; password = HMAC bootstrap |
| Organization + COA | ✅ | `build_organization` |
| Default warehouse | ✅ (accounting+pos path) | `tenant.activate_warehouses` → Finance `POST /api/internal/tenants/:id/activate-warehouses` |
| Walk-in customer | ❌ on standard build | Seeded for accounting+pos bundle via `tenant.seed_pos_defaults` |
| Traefik route | ✅ | `{slug}.{ROOT_DOMAIN}` |
| License row | ✅ | On job complete if none assigned |
| `finance_tenant_id` | ✅ | When bootstrap succeeds |
| Control-plane org row | ✅ | `finance_organization_id` when build returns id |

### POS (`pos` module)

| Item | Auto? | Mechanism |
|------|-------|-----------|
| POS docker stack | ✅ if `pos` ∈ modules | `stockix-pos-{slug}` |
| POS organization | ✅ | `bootstrapPosOrganization` → platform API |
| PIN users (admin, waiter, …) | ✅ | `org_bootstrap` job — random 6-digit PINs |
| Default branch Main/MAIN | ✅ | createOrg + bootstrap |
| MongoDB | ✅ empty | Per-tenant volume |
| IntegrationConfig wire | ✅ | When accounting+pos bundle |
| Traefik POS hosts | ✅ | `{slug}-pos`, `{slug}-pos-api` |

### POS PIN login

- 4–6 digits, org-scoped via subdomain optional.
- Bootstrap creates role users with random PINs stored in `organization.defaultCredentials` (masked after bootstrap).

### Bootstrap PIN one-time reveal (peek / consume)

| Step | Endpoint | Behavior |
|------|----------|----------|
| Poll readiness | `GET /api/platform/v1/organizations/:id/provisioning-status` | `readyForPinLogin`; includes `fullCredentials` via **peek** (repeatable polls) |
| Worker persists | Stockix job complete | Encrypted `pos_bootstrap_pins` on provision trace + 15 min cache |
| Consume store | `POST /api/platform/v1/organizations/:id/provisioning-credentials/consume` | Deletes Redis/memory reveal blob after worker captured PINs |
| Operator UI | Dashboard provision status / tenant create | `posDefaultCredentials` + `TenantPosBootstrapBanner` |

Manual sign-off: [section-2.1-e2e-checklist.md](./section-2.1-e2e-checklist.md).

### POS-only entitlements

Stockix worker passes `entitlements` on org create using `@repo/shared/pos-entitlements-from-modules`: `modules: ["pos"]` → `{ inventory: true, accounting: false }`.

### Credentials repair

`POST /api/platform/v1/organizations/:id/repair-credentials` rebuilds masked `defaultCredentials` from bootstrap users (`name`/`username` === `role`). Does not recover plaintext PINs. CLI: `repairCredentials.js` delegates to the same sync helper.

---

## 7. Gap Status

### Provisioning gaps

| Gap | Severity | Status |
|-----|----------|--------|
| `PROVISION_MODULE_GATING=0` by default | Critical | **OPEN** — set `=1` in prod after validation |
| POS failure non-fatal on combined path | Medium | **Mitigated** — `partial` + targeted retry (POS / wire) |
| `TENANT_ID` env unused in POS backend | High | **OPEN** — weak Stockix↔POS link except org field |
| Dashboard tenant detail lacks modules display | Low | **OPEN** |
| Walk-in / warehouse for integrations | Medium | **Partial** — bundle seed only |

### License/plan bugs

| # | Issue | Severity |
|---|-------|----------|
| C1 | Plan `maxOrganizations` not copied to license on generate/provision | Critical |
| C2 | Finance sync uses plan limits; org gate uses license limits | Critical |
| C3 | Expiry worker does not sync finance / send expired email | Critical |
| H1 | `/licenses/activate` allows `unassigned` licenses | High |
| H2 | Multiple licenses per tenant — arbitrary `.limit(1)` | High |
| H3 | GET `/plans` public | High |
| M3 | Dashboard plan filter hardcoded starter/growth/pro/enterprise | Medium |

### Scenario readiness

| Scenario | Ready? | Blocking |
|----------|--------|----------|
| Accounting only | **Mostly YES** | Module gating off OK; integration seeds manual |
| POS only | **NO** (gating off) / **Partial** (gating on) | Gating off still deploys Finance; gating on needs org bootstrap |
| Accounting + POS | **Partial → YES** after wire + mapping | Item mapping manual; smoke test |

---

## 8. Production Readiness

### Production hardening report (May 2026)

**Verdict at audit time:** **NO** — blocking:

1. Finance system + tenant migrations not confirmed on prod host
2. Production secrets + Resend SMTP
3. E2E signup/license smoke on live tenant hosts
4. `infra-worker` healthcheck absent in prod compose

### Fixes applied in hardening pass

- API security headers (HSTS, CSP, etc.) in production
- Finance global exception filter (no stack leak in prod)
- LicenseGuard 60s in-memory cache
- System DB pool timeouts
- Process crash handlers (API + Finance)

### Manual actions before production

| Item | Who |
|------|-----|
| `pnpm db:migrate` on prod Postgres | Ops |
| Finance `cli:system:migrate:latest` + `cli:tenants:migrate:latest` | Ops/DBA |
| `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, Resend domain | Ops |
| `INTERNAL_API_SECRET` matches all tenant Finance stacks | Ops |
| `pnpm env:sync-prod --confirm-server` on deploy host | Ops |
| `pnpm docker:prebuild` + `pnpm docker:check` | Ops |
| `PROVISION_MODULE_GATING=1` after module tests | Ops |
| Live staging checklist (§9) | QA |

### Known technical debt

| Priority | Item |
|----------|------|
| High | LicenseGuard allows requests when no `organization-id` or no license row |
| Medium | Redis for license cache when multiple Finance replicas |
| Medium | `infra-worker`, `socket-proxy` lack healthchecks |
| Low | Platform API pre-existing MFA token test flake |

### Consolidated verdict

| Layer | Status |
|-------|--------|
| Application code (Finance SaaS tasks 1–10) | **YES** |
| Multi-product rebuild | **YES** (automated gates) |
| Go-live | **YES** after §9 staging sign-off + prod migrations/secrets |

---

## 9. Staging Verification Checklist

Run after deploy with live Finance stack, worker, and API.

### Migrations (Phase 0)

- [x] `pnpm db:migrate` on Stockix Postgres (dev/local)
- [x] `pnpm cli:system:migrate:latest` on finance MariaDB (dev/local)
- [x] `pnpm cli:tenants:migrate:latest` on finance (dev/local)
- [ ] Repeat on **staging/prod** before cutover

### Worker (Phase 0)

- [x] `pnpm infra:worker:build` → `infra/worker-service/.runtime/worker.js`
- [x] **Restart worker after rebuild** when using `pnpm dev` (stale bundle otherwise)
- [x] `buildTenantSignupEnv()` writes only `SIGNUP_DISABLED=true` (unit test)
- [ ] Redeploy worker on **staging/prod**

### Signup & provision

- [ ] `POST /api/auth/register` with signup disabled → **403** (on **tenant Finance** URL, not platform :4000)
- [ ] `/auth/register` redirects to login when disabled
- [ ] `POST /api/internal/provision-user` with `x-internal-secret` creates user

### Setup wizard

- [x] Congrats step removed; redirect to `/setup/complete` when ready + incomplete
- [ ] Dashboard blocked until `POST /api/organization/setup/complete` (live)
- [ ] `setup_completed_at` set in DB (live)

### License

- [ ] License `suspended` → **402** on all API methods (live)
- [ ] Expired past grace → **402** all; within grace → GET OK, mutations **402** (live)
- [ ] Stockix license assign/extend/revoke updates `tenant_licenses` (live)
- [ ] UI: suspended overlay, grace banner (live)

### Owner dashboard users

- [ ] Tenant detail → **Finance users** card lists users (live)
- [ ] Create / edit / suspend / activate / reset password / delete via UI (live)
- [x] RBAC covered in `finance-users-http.test.ts`

### Org switcher & sub-org

- [ ] Switch tenant reloads app; org number subtitle shown (live)
- [ ] Sub-org provision copies COA + tax + settings (live)
- [x] `CopyParentTenantSettings.service.spec.ts`

### Module gating (rebuild)

- [ ] Tenant `modules=['pos']` only + `PROVISION_MODULE_GATING=1` → POS only, no Finance
- [ ] Tenant `modules=['accounting']` → Finance unchanged
- [ ] Tenant `modules=['accounting','pos']` → both + wire step
- [ ] POS JWT without `pos` module → 403

### Integration (accounting + pos)

- [ ] `finance_tenant_id` set on deployment
- [ ] IntegrationConfig auto-wired
- [ ] Paid order → Finance receipt; reverse → void

### Billing

- [x] Subscription endpoints return **501** when billing disabled (code)
- [x] No LemonSqueezy in setup wizard (code)

---

## Appendix — Key file references

| Area | Path |
|------|------|
| Tenant modules schema | `packages/db/src/schema.ts` |
| Provision runtime | `infra/worker-service/src/provision-runtime.ts` |
| Module gating | `infra/worker-service/src/module-stacks.ts` |
| License HTTP | `apps/api/src/license-http.ts` |
| Plan limits | `apps/api/src/plan-limits.ts` |
| Finance license sync | `apps/api/src/finance-license.client.ts` |
| License generate UI | `apps/dashboard/components/license-generate-dialog.tsx` |
| Tenant wizard | `apps/dashboard/components/tenant-create-wizard.tsx` |
| Migrate script | `packages/db/scripts/migrate.ts` |
| Finance provision-user | `InternalProvision.controller.ts` |
| POS org bootstrap | `orgBootstrapService.js`, `bootstrap-pos-org.ts` |
