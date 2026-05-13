# Stockix — Open gaps (audit remainder)
_Generated: 2026-05-13 · Last closeout pass: **2026-05-13**_

> Full audit sources: `packages/db`, `apps/api`, `apps/dashboard`, `infra/worker-service`, `services/stockix-finance/.../Roles/**`. Cross-service epics: [stockix-epics-backlog.md](stockix-epics-backlog.md).

---

## Definition of done (how this file is maintained)

| Category | When an item leaves this doc |
|----------|-------------------------------|
| **Shipped** | Code + tests merged; epic or section removed or shortened to a one-line “Done” pointer. |
| **By design** | Documented as intentional API/product shape (not backlog). |
| **Resolved (doc)** | Audit wording was superseded by implementation — remove from summary or mark **Resolved** with file pointers. |
| **Deferred / Accepted OOS** | Product accepts no near-term build; row links to epic or runbook with **owner** and **review date**. |

---

## Summary — open, deferred, or superseded

| # | Area | Status | Priority |
|---|------|--------|----------|
| 41 | RBAC: org write routes (audit row) | **Resolved** — non-GET org routes min. `support_agent`; scoped grants in [`org-access-scope.ts`](apps/api/src/org-access-scope.ts); [`rbac.ts`](apps/api/src/middleware/rbac.ts). | — |
| 43 | Per-org **Team** matrix (end users across Bigcapital stacks) | **Deferred** — epic **C2** ([stockix-epics-backlog.md](stockix-epics-backlog.md)). Stockix `owner_organization_access` covers **operators** only. | — |
| 44 | Bigcapital role scope (per-tenant vs per-org) | **Accepted OOS** until **C1/C2** — architecture: one MySQL per org instance. Revisit with epic owner. | High |
| 45 | Central “org A not org B” for **end users** | **Accepted OOS** until **C2** — today: invite per stack; see epic **C2** for proposed Stockix hub. | High |

---

## 1. License System

### By design (not backlog)

- **`PATCH /licenses/:licenseId`** ([`apps/api/src/license-http.ts`](apps/api/src/license-http.ts)) accepts **`{ notes }` only**. Expiry / perpetual changes use **`POST /licenses/:licenseId/extend`** (RBAC minimum `billing_manager`).

### Deferred — epic C1

- **Bigcapital stacks** do not consult Stockix license for **end-user** auth. Tracked as **Epic C1** in [stockix-epics-backlog.md](stockix-epics-backlog.md) (finance integration + security review).

---

## 2. Tenant Lifecycle (Suspend / Reactivate)

### Deferred — epic C3

- **Readiness reconciler** observes readiness; **no auto-restart** for stuck `provisioning` without product policy.
- **Mid-session “revoked” UX** in Bigcapital after suspend: not implemented; optional under **C3**.

See [stockix-epics-backlog.md](stockix-epics-backlog.md) epic **C3**.

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

[`apps/api/src/middleware/rbac.ts`](apps/api/src/middleware/rbac.ts) (`requiredApiRole`). Scoped org access: [`apps/api/src/org-access-scope.ts`](apps/api/src/org-access-scope.ts). Scoped `support_agent` may receive **403** (e.g. `organization_access_create_denied`).

### Product follow-up (documented; implementation pending approval)

- **`billing_manager`:** further route splits (assign-only, fingerprint read, etc.) — see [adr-billing-manager-license-rbac.md](adr-billing-manager-license-rbac.md). **Current shipped:** `GET /licenses*`, `POST …/extend`, `PATCH …/:id` (notes) at or above `billing_manager`; other license mutations remain `super_admin` (and POS deactivate path `support_agent`).

### Bigcapital internal RBAC — deferred C2

**Critical implication:** one Bigcapital MySQL per org instance; roles/users are **per org**, not per tenant.

**Gap (end-user access hub):** no Stockix-wide Team UI — **Epic C2** in [stockix-epics-backlog.md](stockix-epics-backlog.md).

---

## 4. UI Professionalism

### Polish (incremental)

- [`apps/dashboard/lib/api-errors.ts`](apps/dashboard/lib/api-errors.ts) — extend `CODE_MESSAGES` when new API `error` codes appear. Tenant list, provision flows, MFA settings, and org list (`use-organizations`) use `formatApiError` for failed fetches; keep new dashboard `fetch` paths consistent.

---

## Related ADR

- [adr-billing-manager-license-rbac.md](adr-billing-manager-license-rbac.md) — proposed expansions for `billing_manager` (optional).
