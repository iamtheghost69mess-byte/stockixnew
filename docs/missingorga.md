# Stockix — Open gaps (audit remainder)
_Generated: 2026-05-13 · Trimmed to **missing / partial / out-of-scope** only_

> Full audit sources: `packages/db`, `apps/api`, `apps/dashboard`, `infra/worker-service`, `services/stockix-finance/.../Roles/**`. Implemented items and “Working” checklists were **removed** from this file. Cross-service epics: [stockix-epics-backlog.md](stockix-epics-backlog.md).

---

## Summary (not ✅ Done)

| # | Area | Status | Priority |
|---|------|--------|----------|
| 41 | RBAC: org write routes use `super_admin` | ⚠️ Superseded: org **writes** allow `support_agent` (scoped when `owner_organization_access` rows exist) | — |
| 43 | Per-organization RBAC (scoped Stockix access) | ⚠️ **Gap:** full `tenant_team_members` / cross-org **Team** matrix **not** implemented — only `owner_organization_access` + panel | — |
| 44 | Bigcapital role scope: per tenant vs per org | ⚠️ OOS — separate MySQL per org; no Stockix↔Bigcapital role sync | High |
| 45 | Bigcapital: give user access to org A but not org B | ⚠️ OOS — invite per stack; no shared identity across org DBs | High |

---

## 1. License System

### ⚠️ Partial
- **`PATCH /licenses/:licenseId`** (`apps/api/src/license-http.ts`) accepts **`{ notes }` only** by design. Use **`POST /licenses/:licenseId/extend`** for `expiresAt` / `isPerpetual` changes.

### Remaining (explicit product boundary)
- **Bigcapital application stacks** under [`services/stockix-finance`](services/stockix-finance) do **not** consult Stockix license state for end-user auth; in-stack enforcement would be a **finance-service / integration** effort, separate from Stockix control-plane APIs and dashboard.

---

## 2. Tenant Lifecycle (Suspend / Reactivate)

### ⚠️ Partial (product / ops nuance)
- **Readiness reconciler** (`apps/api/src/index.ts`) still **observes** readiness and logs events; it does **not** auto-restart a deployment stuck in `provisioning` beyond operator actions (Stop, Retry, worker intervention).
- **Bigcapital mid-session:** after suspension, stacks are stopped so new logins fail; there is **no separate in-app “session revoked”** layer beyond HTTP failing to reach the container.

---

## 3. RBAC

### Owner-side roles (`apps/dashboard/lib/roles.ts` + `packages/shared/src/roles.ts`)

| Role | Rank | Label | Description |
|---|---|---|---|
| `super_admin` | 3 | Super Admin | Full access to all features including billing, deletion, admin management |
| `support_agent` | 2 | Support Agent | Can view and manage tenants, trigger provisioning and sync. Cannot access billing or delete data |
| `billing_manager` | 1 | Billing Manager | Billing section access only |
| `read_only` | 0 | Read Only | View-only access |

> [`apps/dashboard/lib/roles.ts`](apps/dashboard/lib/roles.ts) **re-exports** from [`@repo/shared/roles`](packages/shared/src/roles.ts) and adds labels only.

### API enforcement

Current rules live in [`apps/api/src/middleware/rbac.ts`](apps/api/src/middleware/rbac.ts) (`requiredApiRole`). Scoped org access: [`apps/api/src/org-access-scope.ts`](apps/api/src/org-access-scope.ts). **Scoped `support_agent`** may receive **403** when grants deny an operation (including `organization_access_create_denied` on create).

### ⚠️ Partial (remaining product gaps)
- **`billing_manager`:** Further splits (e.g. **assign without revoke**, billing-only fingerprints) need **explicit product rules** beyond today’s extend/notes vs super-admin mutating routes.
- **Cross-org “Team” matrix** (`tenant_team_members` / per-user org roles across Bigcapital stacks): **not** implemented beyond Stockix-side **scoped support** + grants — see below and [stockix-epics-backlog.md](stockix-epics-backlog.md) epic **C2**.

### Bigcapital internal RBAC (`services/stockix-finance/packages/server/src/modules/Roles/**`)

**Critical implication**
- Each Stockix **organization** runs its own Bigcapital Docker stack with its own MySQL (`tenant.provision` per org). `roles` / `users` / `role_permissions` are **per-org-instance, not per-tenant**.
- No shared identity layer between two orgs of the same tenant; independent Bigcapital instances.

#### Gap: Per-org user access in Bigcapital
- No central UI: “Give `alice@acme.com` access to org A but not org B.” Pattern today: **do not invite** into B; management is **per stack**.
- **`systemUserId`** is cross-tenant, but role/`active` are per-org rows (two orgs ⇒ two independent `users` rows).

**Proposed solution** (design only — see epic **C2** in [stockix-epics-backlog.md](stockix-epics-backlog.md)):

| Layer | Change |
|---|---|
| `packages/db/src/schema.ts` | `tenant_team_members` + `tenant_team_member_org_access` (or equivalent) |
| `apps/api/src/index.ts` | Tenant team CRUD routes |
| Worker | e.g. `org.user.sync` → Bigcapital admin API per org |
| Bigcapital | Internal upsert for `{ systemUserId, email, roleSlug }` per org |
| Dashboard | “Team” tab, `members × orgs` matrix |

---

## 4. UI Professionalism

### ⚠️ Partial (residual polish)
- **API error coverage:** extend `CODE_MESSAGES` in [`apps/dashboard/lib/api-errors.ts`](apps/dashboard/lib/api-errors.ts) as new API `error` codes appear; tenant list / settings pages may still use bespoke error strings for multi-step flows.
