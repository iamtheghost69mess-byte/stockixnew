# Stockix Multi-Organization Architecture

**Audit scope:** `apps/dashboard`, `apps/api`, `packages/db` (Drizzle schema + SQL migrations), and **control-plane provisioning** under `infra/worker-service`. **Excluded by request:** `services/stockix-finance/**` internals (only referenced where the worker calls HTTP into that product).

**Note on `services/`:** In this repository, `services/` currently contains the **stockix-finance** monorepo only. The **Docker/compose provisioning worker** that implements multi-org stacks lives under **`infra/worker-service`**, not under `services/`. This document treats that worker as the “provisioner” component.

---

## Overview

Stockix’s “multi-organization” feature is a **control-plane (Postgres) data model** where many **`organizations`** rows belong to one **customer `tenants`** row (`organizations.tenant_id` → `tenants.id`, `ON DELETE CASCADE`). Each additional organization is presented in the owner dashboard as a **“sub-organization”** with its **own Docker Compose stack** (`stockix-{slug}`) and **subdomain** `{slug}.{rootDomain}`. The **first** organization row created for a tenant (by `created_at` order) is treated as **primary** in API/UI rules (suspend/delete guards), not via a dedicated `is_primary` column.

Provisioning is **asynchronous**: `POST /tenants/:tenantId/organizations` inserts an `organizations` row and enqueues a **`tenant.provision`** job (`tenant_lifecycle_jobs`). The **infra worker** creates a **new** `tenants` row whose **`slug` equals the organization slug** (this row powers the child stack and is **hidden** from `GET /tenants` via a `NOT EXISTS` filter). The worker bootstraps Stockix Finance inside that stack, optionally **inherits org settings** from the parent stack’s internal URL, then marks the control-plane `organizations` row **`active`** when the job completes.

**Billing / limits** are enforced at the **tenant** level using **`licenses.max_organizations`** on licenses assigned to that tenant (`tenant_id`), not per child stack.

**Important identity note:** The control-plane UUID stored in **`organizations.id`** is passed in the provision job payload as **`organizationId`**, but the worker’s `runProvisionJob` **does not pass that value into** `provisionTenant()` / `ProvisionInput` (see `infra/worker-service/src/worker.ts`). Organization build inside Finance uses **`organization-id` from the auth sign-in response** (`fetch-stockix-finance-build-org.ts`). Whether that equals `organizations.id` depends on **stockix-finance** behavior (out of this audit’s excluded scope)—treat as a **potential mapping gap** if strict 1:1 UUID alignment is required.

---

## Data Model

### Database engine

All tables below live in **Stockix control-plane Postgres** (`DATABASE_URL` for `apps/api`), defined in Drizzle and applied via SQL migrations under `packages/db/drizzle/`.

### `organizations` (multi-org / “sub-org” record)

**Source of truth (TypeScript):** `packages/db/src/schema.ts` lines **71–88**.

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK `defaultRandom()` | Control-plane organization id |
| `tenant_id` | `uuid` NOT NULL FK → `tenants.id` **`ON DELETE CASCADE`** | Parent **customer tenant** |
| `name` | `varchar(255)` | Display name |
| `slug` | `varchar(100)` **UNIQUE** | DNS-safe slug; also matches **child provision `tenants.slug`** |
| `subdomain` | `varchar(255)` **UNIQUE** | `{slug}.{rootDomain}` (see `apps/api/src/index.ts` `POST .../organizations`) |
| `status` | `varchar(50)` default `provisioning` | Comment in schema: `provisioning \| active \| suspended \| failed` |
| `provisioning_error` | `text` nullable | Set on provision job hard-fail (`apps/api/src/index.ts` `POST /internal/jobs/:jobId/fail`) |
| `created_at`, `updated_at` | `timestamptz` | |

**SQL migration (initial table):** `packages/db/drizzle/0013_blue_micromacro.sql` lines **1–15** (creates table + FK to `tenants`).

**Parent/child shape:** **Not** a self-referencing `organizations` tree. “Child org” = **`organizations`** row pointing at parent **`tenants.id`**, plus (after provision) a **separate `tenants` row** with `slug = organizations.slug` for the stack (see Provisioning Flow).

### `tenants` (customer / directory row + hidden child rows)

`packages/db/src/schema.ts` lines **49–68**: `id`, `slug` **UNIQUE**, `name`, `owner_id` → `owners`, admin fields, `status`, `plan_slug`, `created_at`.

### `tenant_deployments` (per-stack runtime metadata)

`packages/db/src/schema.ts` lines **133–170**: `tenant_id` FK **CASCADE**, `status`, `compose_project_name` **UNIQUE**, `internal_port`, encrypted secrets, `mongo_url`, errors, timestamps, index on `tenant_id`.

### `tenant_lifecycle_jobs` (async queue)

`packages/db/src/schema.ts` lines **244–268**: `type`, `status`, `tenant_id` nullable FK **CASCADE**, `correlation_id`, `payload` **jsonb**, retries, lease fields, indexes.

### `tenant_provision_events` (append-only trace)

`packages/db/src/schema.ts` lines **176–193**: `correlation_id`, optional `tenant_id` / `slug`, `phase`, `level`, `message`, `meta` jsonb, index `(correlation_id, created_at)`.

### `owner_organization_access` (support-agent scoping)

`packages/db/src/schema.ts` lines **91–111**: `owner_id`, `tenant_id`, `organization_id` FK **CASCADE** to `organizations`, **UNIQUE(owner_id, organization_id)**, indexes.

### `licenses` (plan limits including max orgs)

`packages/db/src/schema.ts` lines **290–333**: includes **`max_organizations`** (default **1**, **-1** = unlimited per comment at line **307**), `tenant_id`, dates, status, etc. Migration: `packages/db/drizzle/0014_clumsy_dagger.sql` line **1**.

### `tenant_config`, `plans`, audit, idempotency, etc.

See same `packages/db/src/schema.ts` file for full definitions (`tenant_config` **lines 114–127**, `plans` **271–288**, `admin_audit_log` **195–217**, `api_idempotency_keys` **219–242**, `license_activations` **335–371**, `blacklisted_fingerprints` **373–387**).

### Terms **not** found as tables/columns in control-plane schema

Repo-wide (control plane): no **`sub_organizations`**, **`tenant_children`**, **`org_children`**, **`parent_org`**, **`parent_tenant`**, **`parent_id` on organizations**, **`child_orgs`**, or **`workspaces`** tables in `packages/db/src/schema.ts` or `packages/db/drizzle/*.sql` for this feature.

---

## Provisioning Flow

### HTTP entry (dashboard → BFF → API)

1. **Dashboard** posts JSON to Next route: `apps/dashboard/app/api/tenants/[tenantId]/organizations/route.ts` lines **16–28** (`POST`, body forwarded).
2. **BFF** uses `apps/dashboard/lib/api-client.ts` `apiFetch` lines **9–38**: `Authorization: Bearer ${PLATFORM_API_SECRET}`, forwards **cookies** for owner session.
3. **Control API** `POST /tenants/:tenantId/organizations`: `apps/api/src/index.ts` lines **2703–2807**.

### API steps (`POST /tenants/:tenantId/organizations`)

From `apps/api/src/index.ts`:

- **RBAC:** `apps/api/src/middleware/rbac.ts` lines **48–54** — mutating `/tenants/.../organizations` requires **`support_agent`** minimum (not `read_only`).
- **Support scoping:** lines **2715–2728** — `support_agent` with non-empty `owner_organization_access` rows **cannot create** orgs (`organization_access_create_denied`).
- **License gating:** lines **2741–2759** — `getTenantLicenseEligibility` (`apps/api/src/plan-limits.ts` lines **22–46**).
- **Count limit:** lines **2761–2770** — `canCreateOrganization` (`apps/api/src/plan-limits.ts` lines **74–95**) compares active license `maxOrganizations` to count of org rows where `status != 'failed'`.
- **Slug + subdomain:** lines **2772–2774** — `pickUniqueOrganizationSlug` (**127–138**) `{slugify(name)}-{4 random alnum}` max length 100; `subdomain = `${slug}.${rootDomain}`.slice(0, 255)` with `rootDomainForOrganizationSubdomain` (**96–105**).
- **Insert:** lines **2776–2785** — `status: "provisioning"`.
- **Enqueue:** lines **2791–2796** — `enqueueOrgProvisioning(db, inserted.id, parsed.data)` from `apps/api/src/org-provision.ts`.

### `enqueueOrgProvisioning` (job payload)

`apps/api/src/org-provision.ts` lines **11–98**:

- Loads org + parent tenant + **first active deployment port** on **parent tenant** for `mainTenantInternalBaseUrl` (**47–58**).
- Inserts `tenant_lifecycle_jobs` via `insertTenantJob` with `type: "tenant.provision"` and payload including **`organizationId`**, **`stockixTenantId: tenantId`**, `stockixApiUrl`, `parentTenantSlug`, `mainTenantInternalBaseUrl`, admin + plan fields (**76–97**).

### Worker execution (summary)

`infra/worker-service/src/worker.ts` `runProvisionJob` **218–255**: parses payload (includes optional `organizationId`) but **only forwards** slug/name/owner/admin/**stockixTenantId**/urls/**parentTenantSlug**/main URL into `provisionTenant()` — **`organizationId` is not in `ProvisionInput`** (`infra/worker-service/domain/provisioning/types.ts` lines **1–16**).

`infra/worker-service/src/provision-runtime.ts` `executeProvisionRuntime` **252–276**: transaction inserts **new** `tenants` + `tenant_deployments` for **`input.slug`**.

**Env file:** `buildTenantComposeEnvBody` (`infra/worker-service/domain/provisioning/tenant-env.ts` lines **23–69**) writes compose `.env` including `REACT_APP_STOCKIX_TENANT_ID=${stockixTenantId}` (parent tenant UUID) and API URL for webapp.

**Bootstrap + build:** `provision-runtime.ts` **497–574**: optional **settings inheritance** from parent internal base URL when `parentTenantSlug` set; then `finance.buildOrganization(...)` which signs in and calls Finance HTTP APIs (`infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-build-org.ts`).

**Edge / Traefik:** `provision-runtime.ts` **614** `edge.publish(input.slug, port, rootDomain)` (file continues after line 619).

### API completion hook (mark org active)

`apps/api/src/index.ts` `POST /internal/jobs/:jobId/complete` excerpt **1102–1115**: if job payload contains **`organizationId`**, updates **`organizations.status = 'active'`** for that id.

### ASCII diagram (create sub-org)

```
Owner Dashboard (Next)
    │ POST /api/tenants/{tenantId}/organizations  { "name": "..." }
    ▼
apps/dashboard BFF (apiFetch + PLATFORM_API_SECRET + session cookie)
    ▼
apps/api  POST /tenants/:tenantId/organizations
    ├─ INSERT organizations (tenant_id=parent, status=provisioning, id=UUID-A)
    └─ INSERT tenant_lifecycle_jobs (type=tenant.provision, payload.organizationId=UUID-A, ...)
         ▼
infra/worker-service (WORKER_SECRET) claims job
    ├─ INSERT tenants (slug=org.slug)          ← child stack "tenant row"
    ├─ INSERT tenant_deployments (compose stockix-{slug}, port, secrets)
    ├─ docker compose up (tenant stack)
    ├─ POST /api/auth/register (bootstrap admin)
    ├─ optional fetch settings from parent internal URL
    ├─ POST /api/organization/build (Finance; org id from signin)
    └─ traefik publish tenant-{slug}.yml (edge.publish)
         ▼
apps/api  POST /internal/jobs/:jobId/complete
    └─ UPDATE organizations SET status='active' WHERE id=UUID-A
```

---

## Parent → Child Relationship

### Nesting depth

- **Organizations do not nest:** every `organizations` row has a single **`tenant_id`** FK to the **parent customer tenant**. There is **no** `parent_organization_id`.
- **Two-level pattern in practice:** Parent **customer tenant** (directory) → many **organizations**. Each non-primary org typically also has a **hidden `tenants` row** (same `slug` as the org) backing its stack (`GET /tenants` filter at `apps/api/src/index.ts` lines **1728–1733**).

### “Primary” organization

`apps/api/src/index.ts`:

- **Suspend:** lines **2903–2918** — cannot suspend org if it is the **first by `created_at`** for that `tenant_id`.
- **Delete:** lines **3015–3029** — cannot delete primary org; must delete tenant instead.

### Parent visibility into child data

The dashboard **opens the child URL in a new tab** (`apps/dashboard/components/org-switcher.tsx` lines **67–72**, **94–99**) — it does **not** embed Finance UI. There is **no** aggregated “parent views all GL data” API in `apps/api` for child org contents; isolation is by **separate stack + separate Finance DB**.

### Shared resources

- **Same owner (`owners`)** via parent `tenants.owner_id`.
- **Same admin email** on provision payload (parent tenant’s admin fields copied in `org-provision.ts` **30–38**).
- **Bootstrap password key** shares parent slug when `parentTenantSlug` present: `provision-runtime.ts` line **223** `bootstrapPasswordKey = (input.parentTenantSlug?.trim() || input.slug)`.
- **License / max org count** is **per parent tenant’s** license rows (`plan-limits.ts`).

### Delete / cascade behavior

- Deleting **parent tenant** cascades **`organizations`** rows with that `tenant_id` (`schema.ts` line **75** `onDelete: "cascade"`). **Child `tenants` rows** (slug collision pattern) are **separate** `tenants.id` values — review whether separate cleanup is always run (child deletion path exists when deleting an **organization**; see below).
- **Delete organization:** `apps/api/src/index.ts` lines **2979–3082**: if a **`tenants` row exists with `slug = org.slug`**, cancel in-flight child provision jobs and enqueue **`tenant.deprovision`** for that **child tenant id**; then `DELETE` the `organizations` row.

### “Detach” child to become root tenant

No API or migration path found in `apps/api` / `apps/dashboard` to **re-parent** an `organizations` row to a different `tenant_id` or promote a child stack to a standalone directory tenant.

---

## Authentication & Org Switching

### Owner dashboard auth (control plane)

- **Session cookie:** `stockix-session` read in `apps/api/src/middleware/auth.ts` lines **58–66**, **85–99**; resolved to `actorId` / `actorRole`.
- **Platform secret:** same file lines **53–56** — `Authorization: Bearer ${PLATFORM_API_SECRET}` for server-to-server from dashboard BFF.

### Roles

`owners.role` in DB (`packages/db/src/schema.ts` lines **16–24** default `super_admin`). RBAC route matrix: `apps/api/src/middleware/rbac.ts` lines **25–55**.

### “Super admin” vs scoped support

- **`super_admin`** can manage owners and org access routes (`rbac.ts` lines **44–49**).
- **`support_agent`** may be **scoped** to specific orgs via `owner_organization_access` (`apps/api/src/org-access-scope.ts`).

### Finance / BigCapital JWT and `organization-id`

**Out of scope (stockix-finance):** actual end-user JWT issuance inside each stack.

**Public org list for login UIs (unauthenticated):** `GET /public/tenant-orgs/:tenantId` — `apps/api/src/index.ts` lines **727–759** returns **active** orgs for a tenant id with `publicUrl` when localhost port mapping exists.

**Switching orgs in control plane UI:** `org-switcher.tsx` opens `publicUrl` or constructed `https?://{subdomain}` in a **new browser tab** — **no** token delegation between parent and child in dashboard code reviewed.

---

## Owner Dashboard

### Where sub-orgs are listed

- **Tenant detail page:** `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` (includes “Sub-organizations” heading per prior audit; uses org switcher area).
- **Component:** `apps/dashboard/components/org-switcher.tsx`.

### API to fetch list

- **Hook:** `apps/dashboard/hooks/use-organizations.ts` lines **76–77** — `GET /api/tenants/${tenantId}/organizations`.
- **BFF:** `apps/dashboard/app/api/tenants/[tenantId]/organizations/route.ts` lines **6–13**.

### Data shown per org

Serialized in API `serializeOrganizationRow` — `apps/api/src/index.ts` lines **163–187**: `id`, `tenantId`, `name`, `slug`, `subdomain`, `status`, `provisioningError`, timestamps, **`publicUrl`** (localhost + mapped port only, lines **169–174**).

### Navigate into a sub-org

`apps/dashboard/components/org-switcher.tsx` lines **67–72**, **94–99**: **`window.open(href, "_blank", "noopener,noreferrer")`** where `href` prefers `publicUrl`.

### Create form fields

- **UI validation:** `apps/dashboard/lib/schemas.ts` lines **39–49** — only **`name`** (with `validateOrganizationDisplayName`).
- **API body:** `apps/api/src/index.ts` lines **80–82** — Zod `{ name: string min 1 max 100 }` only.

---

## Billing Scope

- **Licenses are assigned to `tenants.id`** (`licenses.tenant_id` in `packages/db/src/schema.ts` lines **297–299**).
- **Max organizations** enforced via **`licenses.max_organizations`** (`plan-limits.ts` lines **53–68**, **81–94**).
- **No per-organization subscription row** in control-plane schema: additional orgs consume the **same tenant license pool** subject to `max_organizations`.

---

## Networking & Routing

### URL pattern

- **Subdomain per org:** `serializeOrganizationRow` builds `publicUrl` for local dev as `{scheme}://{row.subdomain}:{port}` (`apps/api/src/index.ts` lines **167–174**). Non-local uses subdomain string; browser default scheme in `org-switcher.tsx` lines **70–71**.

### Traefik / dynamic config

- **Readiness** checks Traefik file presence: `apps/api/src/provisioning/readiness-engine.ts` lines **74–82** — `apiConfig.traefikDynamicDir/tenant-${slug}.yml`.
- **Cleanup on scrub:** `apps/api/src/index.ts` (from earlier grep context) removes `tenant-${slug}.yml` when scrubbing runtime artifacts.

### Compose project naming

- **API:** `dockerComposeProjectForOrgSlug` — `apps/api/src/index.ts` lines **141–144** → `stockix-{slug}` normalized.
- **Worker:** `infra/worker-service/domain/provisioning/compose-project-name.ts` line **2** — same pattern.

---

## organizationId Mapping

### Control plane id generation

`organizations.id` is **`uuid().defaultRandom()`** in Drizzle (`packages/db/src/schema.ts` line **72**).

### Where it is stored

- **`organizations.id`** column (same as above).
- **Job payload** `organizationId` in `apps/api/src/org-provision.ts` lines **89–90** when enqueueing.

### How it reaches BigCapital / Finance

- **Explicit propagation into Finance from worker `ProvisionInput`:** **not present** — `infra/worker-service/src/worker.ts` lines **242–255** omit `payload.organizationId` from the object passed to `provisionTenant()`.
- **Finance `organization-id` header:** obtained from **`/api/auth/signin` response** parsing in `fetch-stockix-finance-build-org.ts` lines **32–39**, **76–99**, then used in headers lines **142–147**.

### Mapping table

**No** dedicated `control_plane_org_id ↔ finance_organization_id` table in `packages/db/src/schema.ts`.

---

## Known Gaps & TODOs

1. **Control-plane `organizations.id` vs Finance `organization-id`:** Job payload includes `organizationId`, but worker provisioning path **does not inject** it into `ProvisionInput` / build calls (`infra/worker-service/src/worker.ts` vs `org-provision.ts`). Verify end-to-end equality in **stockix-finance** if required.
2. **Primary org is implicit** (first `created_at`), not a column — any reorder/import could confuse “primary” semantics.
3. **`ResourceService`-style async bug** does not apply here; unrelated.
4. **TODO in worker crypto helper:** `infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.ts` line **16** comment about encrypted secrets / finance decryption support.
5. **Child `tenants` rows when parent tenant deleted:** Parent delete queues deprovision for **that tenant id** (`apps/api/src/index.ts` around **1972–1980**); confirm whether separate child `tenants` rows are always cleaned via other processes (risk if slug-colliding child row outlives parent delete).
6. **Dashboard vs API strings:** UI copy describes “each organization runs its own Bigcapital stack” (`apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx` around line **487** in repo); implementation matches the **separate compose stack** design.

7. **Provision event stream vs parent tenant page:** `GET /tenants/:tenantId/events` filters `tenant_provision_events.tenant_id` to the **path tenant id** (`apps/api/src/index.ts` lines **3719–3741**). The worker tracer records `tenantId` from the **provisioned stack’s** `tenants.id` once known (`infra/worker-service/domain/provision-trace.ts` lines **37–40** and `provision-runtime.ts` tracer setup). For **child org** provisions, that id is the **child** `tenants` row, not the parent directory tenant — the parent tenant detail “events” panel may therefore **miss** child-org provision traces unless the UI passes a `correlationId` query filter or reads events another way.

8. **Organization access admin API:** `GET/POST/DELETE .../organization-access` — `apps/api/src/index.ts` lines **3085–3180+** (POST validates `support_agent` target at **3160–3167**). Dashboard: `apps/dashboard/components/tenant-org-access-panel.tsx` and `apps/dashboard/app/api/tenants/[tenantId]/organization-access/route.ts`.

---

## Full Dependency Map

```
┌─────────────────────┐
│  Owner browser UI   │
│ apps/dashboard      │
└──────────┬──────────┘
           │ cookie: stockix-session
           │ Next BFF: /api/* → apiFetch(PLATFORM_API_SECRET)
           ▼
┌─────────────────────┐
│  Control Plane API  │
│ apps/api (Hono)     │
│  - Postgres/Drizzle │
│  - RBAC + org scope │
└──────────┬──────────┘
           │ insert organizations + tenant_lifecycle_jobs
           │ internal: WORKER_SECRET /internal/jobs/*
           ▼
┌─────────────────────┐
│  infra/worker-service│
│  - docker compose    │
│  - tenant .env files │
│  - edge.publish      │
└──────────┬──────────┘
           │ HTTP to each stack
           ▼
┌─────────────────────┐
│ Stockix Finance      │  ← excluded from audit body
│ (per-org container)  │
│ /api/auth/* , /api/  │
│   organization/*     │
└─────────────────────┘
```

---

## Appendix: Question index (evidence pointers)

| # | Topic | Primary evidence |
|---|--------|-------------------|
| 1 | Storage / schema | `packages/db/src/schema.ts` L71–88, `0013_blue_micromacro.sql` |
| 2 | Provision API/chain | `apps/api/src/index.ts` L2703–2807, `apps/api/src/org-provision.ts`, `infra/worker-service/src/provision-runtime.ts` |
| 3 | Parent/child rules | `apps/api/src/index.ts` L1728–1733, L2903–2950, L2979–3082 |
| 4 | Dashboard UI | `apps/dashboard/components/org-switcher.tsx`, `hooks/use-organizations.ts` |
| 5 | Auth | `apps/api/src/middleware/auth.ts`, `org-access-scope.ts`, `/public/tenant-orgs` |
| 6 | Billing | `packages/db/src/schema.ts` licenses, `apps/api/src/plan-limits.ts` |
| 7 | organizationId flow | `apps/api/src/index.ts` org insert + job payload; `worker.ts` + `fetch-stockix-finance-build-org.ts` |
| 8 | Status/health | `organizations.status`, `readiness-engine.ts`, tenant detail events `apps/dashboard/.../tenants/[id]/page.tsx` |
| 9 | Routing | `readiness-engine.ts` Traefik path; `serializeOrganizationRow`; `compose-project-name.ts` |
|10| Gaps | This “Known Gaps” section |

