# Stockix — cross-cutting epics (tracked from audit)

**Implementation status (2026-05-13):** not started — tracked for roadmap only. Closure in [missingorga.md](missingorga.md) uses **Deferred / Accepted OOS** until these epics ship.

| Epic | Status | Next milestone |
|------|--------|------------------|
| **C1** — Bigcapital license for end-user sessions | Deferred | Security review + finance auth integration design |
| **C2** — Team / org user matrix | Deferred | Schema + API design in `packages/db` / `apps/api` |
| **C3** — Reconciler policy + session UX | Deferred | Product thresholds + worker observability spec |

This file tracks **large, multi-surface** work called out in [missingorga.md](missingorga.md) (Summary rows 44–45, §1 Remaining, §3 Partial) that are **not** single PR fixes. Use it for roadmap planning; implementation status still lives in the main audit Summary Table where applicable.

## Epic C1 — Bigcapital reads Stockix license for end-user sessions

**Goal:** Application stacks under `services/stockix-finance` enforce tenant/org license state (expiry, suspension) for POS and web logins, aligned with Stockix control-plane `LICENSE_EXPIRED` / `NO_ACTIVE_LICENSE`.

**Surfaces:** Finance webapp auth or gateway, secure service-to-service contract with `apps/api`, deployment/env for license verification keys or introspection endpoints.

**Exit criteria:** Documented security review; integration tests proving blocked login when Stockix marks license expired.

---

## Epic C2 — Team / cross-org user matrix (Stockix source of truth)

**Goal:** One Stockix UI to see “who has which role in which org” for a tenant, with propagation into each org’s Bigcapital MySQL (`users` / `roles`).

**Phases (from audit proposal):**

1. Schema: `tenant_team_members` + `tenant_team_member_org_access` (or equivalent) in `packages/db` + migrations.
2. API: tenant team CRUD in `apps/api`, RBAC, audit.
3. Worker: job type (e.g. `org.user.sync`) in `infra/worker-service` calling Bigcapital admin API per org stack.
4. Bigcapital: internal upsert endpoint for `{ systemUserId, email, roleSlug }` per org instance.
5. Dashboard: “Team” tab with members × orgs matrix on tenant detail.

**Exit criteria:** Operator can grant/revoke org access without opening each Bigcapital instance separately.

---

## Epic C3 — Provisioning reconciler and session semantics

**Goal:** Policy for deployments stuck in `provisioning` (auto-retry vs alert-only) and optional explicit “session revoked” UX in Bigcapital after tenant suspension.

**Surfaces:** `apps/api/src/index.ts` readiness paths, `infra/worker-service/src/provision-runtime.ts`, optional Bigcapital session invalidation.

**Exit criteria:** Product-defined thresholds documented; observability for stuck states; no surprise auto-destructive actions without opt-in.

---

_Last updated: 2026-05-13 (status table + deferred epics)._
