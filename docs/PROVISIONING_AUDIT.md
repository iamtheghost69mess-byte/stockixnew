# Provisioning + License + Organization Audit

**Date:** 2026-05-23  
**Scope:** Read-only audit of license modules, tenant provisioning, org bootstrap, PIN, branches, and warehouses.  
**Question:** Can we provision POS-only, accounting-only, or both? What is created automatically?

---

## 1. License Module Support

| Module | License schema | JWT | Dashboard form |
|--------|---------------|-----|----------------|
| accounting | ✅ | ✅ | ✅ |
| pos | ✅ | ✅ | ✅ |
| accounting + pos | ✅ | ✅ | ✅ |
| pms | ✅ | ✅ | ✅ |
| chat | ✅ | ✅ | ✅ |

### 1.1 Schema and migrations

- **`tenants.modules`** — JSON text column, default `'["accounting"]'` (`packages/db/src/schema.ts`).
- **`licenses.modules`** — JSON text column, default `'["accounting"]'` (same file).
- Migrations: `packages/db/drizzle/0027_tenant_modules.sql`, `0028_license_modules.sql` add the columns.
- **Allowed values** (enforced in API/worker): `accounting`, `pos`, `pms`, `chat` (`@repo/auth` `StockixModule`, worker Zod schema, license generate body).

### 1.2 License generation

`POST /licenses/generate` accepts `modules: z.array(z.enum(["accounting","pos","pms","chat"])).default(["accounting"])` and persists `JSON.stringify(body.modules)` (`apps/api/src/license-http.ts`).

- ✅ `modules=['pos']`
- ✅ `modules=['accounting']`
- ✅ `modules=['accounting','pos']`

### 1.3 Product JWT

- `signProductToken` includes `modules` in the JWT payload (from input or loaded from `tenants.modules`) (`apps/api/src/services/auth/stockix-product-token.ts`).
- `@repo/auth` exports `StockixModule` and `StockixTokenPayload.modules` (`packages/auth/src/index.ts`).
- Tests: `apps/api/tests/stockix-product-token.test.ts`.

### 1.4 Dashboard create-tenant wizard

`apps/dashboard/components/tenant-create-wizard.tsx`:

- Multi-select checkboxes for **Accounting**, **POS**, **PMS**, **Chat** (`AVAILABLE_MODULES`).
- Default selection: `["accounting"]`; at least one module required (toggle falls back to accounting if empty).
- Submitted as `modules` on `POST /tenants` via tenants page handler.

**Verdict:** Licensing and UI fully support module selection. **Runtime provisioning** only honors module choice when `PROVISION_MODULE_GATING=1` (see §2).

---

## 2. Provisioning Scenarios

| Scenario | Supported (schema/UI) | What deploys (worker) | Notes |
|----------|----------------------|------------------------|-------|
| Accounting only | ✅ | Finance stack (`infra/tenant-stack`) | Default path; full bootstrap + Traefik |
| POS only | ✅ (license/UI) | **Depends on `PROVISION_MODULE_GATING`** | See below |
| Accounting + POS | ✅ | Finance stack + POS stack (non-fatal) | POS after Finance completes |
| PMS / Chat | ✅ (license/UI) | Optional stacks when gated | Same gating flag |

### 2.1 `PROVISION_MODULE_GATING`

```ts
// infra/worker-service/src/module-stacks.ts
export function isModuleGatingEnabled(): boolean {
  return process.env.PROVISION_MODULE_GATING === "1";
}
```

| Value | Behavior |
|-------|----------|
| **`0` (default)** | `infra/prod/.env.example`, repo `.env` — **module list is ignored for Finance**. Every provision runs the full Finance docker stack, bootstrap admin, and `tenant.build_organization`, even if `modules=['pos']` only. POS stack still runs afterward if `pos` is in modules (errors are non-fatal). |
| **`1`** | If `accounting` ∉ modules → **skip Finance** (no compose, no bootstrap, no Traefik). Run `provisionPosStack` / `provisionPmsStack` / Chatwoot only; mark tenant `active` and return. |

**POS-only with gating ON:** Only `docker compose` for `infra/pos-tenant-stack` (project `stockix-pos-{slug}`). No Finance URL, no `oneTimeAdminPassword` from Finance (random fallback returned).

### 2.2 Stack contents

**Finance (`infra/tenant-stack/docker-compose.yml`)**  
Services: `nginx`, `webapp`, `server` (Nest API), `mysql`, `redis`, `mongo`, `gotenberg`, etc.  
- Image/build: local `stockix-*:local` from `STOCKIX_TENANT_APP_ROOT` (finance monorepo).  
- Exposed: `PUBLIC_PROXY_PORT` → host (allocated per tenant, stored in `tenant_deployments.internal_port`).  
- Env: written via `buildTenantEnvMap` / tenant `.env` (MySQL passwords, JWT, admin email, optional S3, `STOCKIX_TENANT_ID`, internal API secret).

**POS (`infra/pos-tenant-stack/docker-compose.yml`)**  
Services: `pos-backend`, `pos-frontend`, `pos-mongo`, `pos-redis`.  
- Ports: `127.0.0.1:${POS_HOST_PORT:-8010}:8010`, frontend `3001:3000` (localhost only).  
- Worker passes: `TENANT_ID`, `AUTH_TOKEN_SECRET`, `POS_APP_ROOT`, `COMPOSE_PROJECT_NAME`.  
- **`TENANT_ID` is not referenced anywhere under `services/posnew/`** — compose sets it but POS backend does not read it today.

**Module helpers:** `infra/worker-service/src/module-stacks.ts` — `provisionPosStack`, `provisionPmsStack`, `shouldProvisionFinanceStack`.

### 2.3 Traefik / public URLs

- **Finance:** `writeTenantTraefikConfig(slug, port, rootDomain)` → `Host(\`${slug}.${domain}\`)` → upstream `http://{host}:{port}` (`infra/worker-service/domain/traefik-config.ts`).  
- **Base URL in provision result:** `{scheme}://{slug}.{ROOT_DOMAIN}` (`provision-runtime.ts`).  
- **POS:** No Traefik config generated. No `{slug}-pos.{domain}` pattern in code. POS is localhost-bound ports only.

### 2.4 Provision job payload

**API** `POST /tenants` (`apps/api/src/index.ts`):

```json
{
  "slug", "name", "ownerId", "adminEmail", "adminFirstName", "adminLastName",
  "planSlug", "modules", "assignExistingLicenseId", "provisionRequestedById"
}
```

**Worker** validates same fields (`infra/worker-service/src/worker.ts` `provisionPayloadSchema`).  
`planSlug` and `modules` are stored on `tenants` at insert time and reconciled again when the job completes (license auto-assign uses payload modules).

---

## 3. What Gets Created Automatically

### 3.1 Finance (accounting module) — full provision path

| Item | Auto-created? | Value / mechanism |
|------|--------------|-------------------|
| Control-plane tenant row | ✅ | `tenants` + `tenant_deployments`, status `provisioning` → `active` |
| Docker Finance stack | ✅ | `stockix-tenant-{slug}` compose project |
| Finance DB tenant | ✅ | `POST /api/internal/provision-user` → `TenantsManager.createTenant()` if no `tenantId` |
| Admin user | ✅ | Email = provision `admin_email`; password = **deterministic HMAC** `bootstrapAdminPassword(slug)` from `DEPLOYMENT_SECRET_KEY` (shown once as `oneTimeAdminPassword`) |
| Organization build | ✅ | `tenant.build_organization` → sign-in + `POST /api/organization/build` (async job poll) |
| Organization name | ✅ | `OrgBuildSettings.name` = tenant `name` (MENA defaults for locale/currency) |
| Chart of accounts | ✅ | Tenant migrate + `seedTenant()` (e.g. `20190423085242_seed_accounts.ts`) |
| Default warehouse | ❌ on standard build | Created only when **multi-warehouses is activated** (`ActivateWarehousesService` → `CreateInitialWarehouse`, name from i18n `warehouses.primary_warehouse`, code `10001`) |
| Walk-in customer | ❌ | Not seeded; Bigcapital sync expects `defaultWalkInCustomerId` in POS `IntegrationConfig` (manual) |
| Traefik route | ✅ | `{slug}.{ROOT_DOMAIN}` |
| License | ✅ | Auto-insert `licenses` row on job complete if none assigned (`product: platform`, `modules` from payload) |
| `finance_tenant_id` | ✅ | Stored on `tenant_deployments.finance_tenant_id` when worker returns numeric tenant id |
| Control-plane org mapping | ✅ | `organizations` row with `finance_organization_id` when build returns org id |

**Finance roles (provision-user):** `admin` → membership role `owner`; also `accountant`, `viewer` (`InternalProvision.controller.ts`).

### 3.2 POS (pos module) — worker path

| Item | Auto-created? | Value / mechanism |
|------|--------------|-------------------|
| POS docker stack | ✅ (if `pos` ∈ modules) | `stockix-pos-{slug}`; failures logged non-fatal on accounting path |
| POS organization | ❌ **not by worker** | No call to `POST /api/platform/v1/organizations` during `provisionPosStack` |
| POS admin (email/password) | ❌ | Provision `admin_email` is for **Finance**, not POS |
| Default PIN users | ❌ on worker provision | Created only when **platform org is created** and bootstrap runs (see below) |
| Default branch | ❌ on worker provision | Same — requires org create + bootstrap |
| MongoDB | ✅ empty | Per-tenant `pos-mongo` volume |

**POS org creation (manual / platform API):** `POST` platform organizations (`platformOrgController.createOrg`):

1. Creates `Organization` + upserts `Location` **Main** / code **MAIN**.
2. Queues `org_bootstrap` job → `bootstrapOrganization({ organizationId })`.

**`bootstrapOrganization` (`orgBootstrapService.js`):**

| Step | Creates |
|------|---------|
| infrastructure | Location **Main** (if missing) |
| identity | RBAC config; if no users: one user per role (`admin`, `manager`, `waiter`, `cashier`, `kitchen`, `hostess`) with **random 6-digit PIN** (username = role name); stored in `organization.defaultCredentials` |
| accounting | `ensureDefaultAccountsAndConfig` |
| menu | Default categories |
| branding | Public menu branding |

**Dashboard:** Operators create POS orgs via **POS → Organizations** (`/pos/organizations`), not automatically at tenant provision.

### 3.3 POS PIN

| Question | Answer |
|----------|--------|
| PIN login? | ✅ `loginWithPin` in `authController.js` (4–6 digits, org-scoped via subdomain) |
| Default PIN for staff | **Random 6-digit** per bootstrap role user (not a fixed default) |
| Admin PIN | Bootstrap creates `admin` user with PIN like other roles — **not** the Finance admin email/password |
| Set on worker provision? | ❌ |
| After platform org create | ✅ via `org_bootstrap` queue; poll `readyForPinLogin` on provisioning status endpoint |

Staff without `passwordHash` **require** `pin` (`userModel.js`). Admin can also use email/password if created separately.

---

## 4. POS Users and Roles

| Role | Login method | Default credentials |
|------|-------------|---------------------|
| admin | PIN (bootstrap) or email+password if added | username `admin`, PIN in `defaultCredentials` (6 digits) |
| manager | PIN | username `manager`, random PIN |
| waiter | PIN | username `waiter`, random PIN |
| cashier | PIN | username `cashier`, random PIN |
| kitchen | PIN | username `kitchen`, random PIN |
| hostess | PIN | username `hostess`, random PIN |

Roles enum: `userModel.js` — `admin`, `manager`, `waiter`, `cashier`, `kitchen`, `hostess`.

---

## 5. Branches and Warehouses

| Question | Answer |
|----------|--------|
| POS default branch on worker provision? | ❌ |
| POS default branch on platform org create? | ✅ **Main** / `MAIN` (createOrg + bootstrap) |
| Inventory scope | Per-location (`locationModel`, stock balances per org/location) |
| Finance default warehouse on build? | ❌ unless multi-warehouse feature activated |
| POS location → Finance warehouse mapping? | ❌ no `locationMapping` / `branchId` / `warehouseId` in `integrationConfigModel.js` |
| Mapping used in sale receipt sync? | ❌ `bigcapitalSyncProcessor` payload has `customerId`, `depositAccountId`, `entries` — **no warehouse/branch** |

**Bigcapital sync prerequisites (manual config per POS org):** `financeTenantId`, `defaultWalkInCustomerId`, deposit accounts, item mappings.

---

## 6. Provision Flow (step by step)

### A. `modules=['accounting','pos']`, `PROVISION_MODULE_GATING=0` (current default)

1. **Dashboard/API** — `POST /tenants` with modules; job `tenant.provision` enqueued.
2. **Worker** — Insert `tenants` / `tenant_deployments`; `modules` JSON on tenant row.
3. **Finance path** (always) — Generate secrets; `docker compose up` tenant stack; health check.
4. **`tenant.bootstrap_admin`** — `POST /api/internal/provision-user` → new Finance tenant + admin user (`owner` role).
5. **`tenant.build_organization`** — Sign-in; organization build job (COA seed, settings); save `financeOrganizationId` to control plane.
6. **`edge.publish`** — Traefik `{slug}.{ROOT_DOMAIN}` → internal port.
7. **`syncFinanceLicense`** — Mark Finance license active for tenant id.
8. **`provisionPosStack`** — POS compose up (non-fatal on failure).
9. **API job complete** — Tenant `active`; auto license; `finance_tenant_id` on deployment; optional primary `organizations` row.
10. **Operator** — Save `oneTimeAdminPassword` from status stream; **separately** create POS org via platform API if needed.

### B. `modules=['pos']`, `PROVISION_MODULE_GATING=1`

1. Steps 2 (DB insert) only for control plane.
2. **Skip** Finance compose, bootstrap, build, Traefik.
3. **`provisionPosStack`** only → localhost POS ports.
4. Mark tenant `active`; return synthetic/random password (not Finance).
5. **No** POS org/users/locations until manual platform org create.

### C. `modules=['accounting']` only

Same as A without step 8 (no `pos` in modules).

### D. Sub-organization (`organization.provision` job)

Separate flow: `org-provision-runtime.ts` registers user on **parent** Finance stack via internal provision-user, then build org under parent session (shared bootstrap password key = `parentTenantSlug`).

---

## 7. Gaps Found

| Gap | Severity | Impact |
|-----|----------|--------|
| `PROVISION_MODULE_GATING=0` by default | **Critical** | Selecting POS-only still deploys full Finance stack and cost |
| POS stack does not create org/users | **Critical** | Tenant provision ≠ usable POS; manual org + bootstrap required |
| `TENANT_ID` env unused in POS backend | **High** | No automatic link between Stockix tenant UUID and POS org |
| No Traefik/public URL for POS | **High** | POS only on `127.0.0.1` ports; not production-shaped |
| No POS ↔ Finance location/warehouse mapping | **High** | Sale receipts cannot target a specific warehouse/branch |
| Default warehouse not created on Finance build | **Medium** | Inventory receipts need warehouse activation or manual setup |
| Walk-in customer not auto-seeded | **Medium** | Bigcapital sync fails until `defaultWalkInCustomerId` configured |
| POS provision errors non-fatal on combined path | **Medium** | Tenant marked active while POS stack failed silently |
| Dashboard tenant detail lacks `modules` display | **Low** | Operators cannot see licensed modules on `[id]` page easily |

---

## 8. What Is Missing Before Production

- [ ] Set `PROVISION_MODULE_GATING=1` in production and test all three module combinations.
- [ ] Automate POS org bootstrap after `provisionPosStack` (platform API + map `stockixTenantId`).
- [ ] Wire `TENANT_ID` / control-plane id in POS backend for tenancy.
- [ ] Traefik (or ingress) for POS: public hostname pattern and TLS.
- [ ] Document operator runbook: Finance `oneTimeAdminPassword` rotation; POS `defaultCredentials` PIN retrieval.
- [ ] Seed or configure Finance walk-in customer + default warehouse (or activate warehouses) before enabling Bigcapital sync.
- [ ] Location → warehouse mapping in integration config and sync payload.
- [ ] Fail provision (or surface warning) when POS stack fails on bundle tenants.
- [ ] E2E tests for `tenant.provision` with `modules` permutations (only product-token tests exist today).

---

## 9. Final Verdict

| Scenario | Ready? | Blocking issues |
|----------|--------|-----------------|
| Accounting only | **Mostly YES** | Module gating off is OK for this path; warehouse/walk-in for integrations still manual |
| POS only | **NO** | Gating off deploys Finance anyway; gating on deploys containers but **no org/PIN/URL** |
| Accounting + POS | **Partial** | Finance path production-shaped; POS requires manual org + integration config; no shared branch/warehouse mapping |

**Summary:** The **license and control-plane data model** support POS-only, accounting-only, and combined tenants. **Automated provisioning** today fully bootstraps **Finance (accounting)** only. **POS** provisioning is **infrastructure-only** (Docker); organizations, users, PINs, and branches are created through the **POS platform API** (`POST /organizations` + `org_bootstrap`), not through the tenant provision worker.

---

## Appendix — Key file references

| Area | Path |
|------|------|
| Tenant modules schema | `packages/db/src/schema.ts` |
| Provision runtime | `infra/worker-service/src/provision-runtime.ts` |
| Module gating / POS stack | `infra/worker-service/src/module-stacks.ts` |
| Traefik | `infra/worker-service/domain/traefik-config.ts` |
| API provision endpoint | `apps/api/src/index.ts` (`POST /tenants`) |
| License generate | `apps/api/src/license-http.ts` |
| Finance provision-user | `services/stockix-finance/.../InternalProvision.controller.ts` |
| POS org bootstrap | `services/posnew/.../orgBootstrapService.js` |
| POS platform create org | `services/posnew/.../platformOrgController.js` |
| Dashboard wizard | `apps/dashboard/components/tenant-create-wizard.tsx` |
