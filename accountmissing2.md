# Stockix Finance — Remaining Gaps

**Evolved from:** Bigcapital Organization & Tenant Audit (May 19, 2026)  
**Codebase:** `services/stockix-finance/` · Control plane: `apps/api/`, `packages/db/`, `infra/worker-service/`  
**Last updated:** Tuesday, May 19, 2026

> **Note:** Tasks 1–10 are implemented and code-verified. This file lists **only partial, missing, or operational** work. Completed audit detail was removed to avoid stale “❌” findings.

**Related:** `IMPLEMENTATION_PLAN.md` (active tasks) · `VERIFICATION_REPORT.md` (manual tests + go-live blockers)

---

## 1. Organization setup wizard

| Item | Status | Notes |
|------|--------|-------|
| Core wizard + mandatory flow | Done | `setup_completed_at`, `/setup/complete` profile step, dashboard guard |
| Industry + date format in org step | Done | `SetupOrganizationForm.tsx`, `BuildOrganizationDto` |
| Tax / VAT, logo, address | Done | Collected on `/setup/complete` (`SetupCompleteProfile.tsx`), not on first org step (per product decision #3) |

**Nothing blocking** in this section.

---

## 2. Sub-organization inheritance

| Item | Status | Notes |
|------|--------|-------|
| Metadata inheritance (currency, fiscal year, locale, etc.) | Done | Worker `fetch-stockix-finance-org-settings.ts` |
| COA + tax rates copy | Done | `CopyParentTenantSettings.service.ts` + internal `copy-from` / `set-parent` |
| `parent_tenant_id` | Done | Migration `20260519000004` |
| **Default AR/AP/inventory account pointers** | **Partial** | Parent tenant **account rows** and **tax_rates** are copied; explicit **default account IDs** in org/tenant settings metadata are not copied to child. Add a settings-copy step if sub-orgs must mirror parent defaults. |
| Sub-org creation from owner dashboard | Done | `apps/api/src/org-provision.ts` + worker |

---

## 3. Signup disabled

| Item | Status | Notes |
|------|--------|-------|
| All items | Done | 403 on register, no allowlist in env, `POST /api/internal/provision-user`, UI redirect |

**Nothing blocking** in this section.

---

## 4. License management

| Item | Status | Notes |
|------|--------|-------|
| Stockix → finance sync | Done | `tenant_licenses`, `POST /api/internal/license/sync`, worker + license routes |
| 402 middleware + max users | Done | `LicenseGuard.middleware.ts`, invite/internal user limits |
| License UI (overlay, banner, gated actions) | Done | `SuspendedOverlay`, `LicenseBanner`, `LicenseGatedButton` |
| Organization number | Done | `ORG-00001` on Stockix + `tenants_metadata.organization_number` |
| **Signed JWT license validation** | **Deferred** | Not built; enforcement is DB + middleware + boot meta. Only needed if finance must trust an external JWT claim. |

---

## 5. Admin user management (owner dashboard)

| Item | Status | Notes |
|------|--------|-------|
| Finance internal users API | Done | `InternalUsers.controller.ts` — full CRUD + reset-password + suspend/activate |
| Stockix API proxy | Done | `apps/api/src/finance-users-http.ts` → `/api/tenants/:tenantId/users` |
| **Owner dashboard UI** | **Missing** | No pages in `apps/dashboard` call finance user routes. Operators must use API/curl until UI is built. |

### To build (item 5)

1. Tenant detail → Users tab in `apps/dashboard`
2. List/create/edit/delete/suspend/reset-password using `apps/api` routes above
3. RBAC aligned with existing owner roles (`read_only` / `support_agent`)

---

## 6. Organization number

| Item | Status | Notes |
|------|--------|-------|
| All items | Done | Migration, allocate on provision, read-only in Preferences General |

**Nothing blocking** in this section.

---

## 7. Org list + switcher (finance UI)

| Item | Status | Notes |
|------|--------|-------|
| All items | Done | `GET /api/organization/all`, `SidebarHead` switcher + reload |

**Nothing blocking** in this section.

---

## 8. Operations & QA (cross-cutting)

| Item | Status | Priority | Action |
|------|--------|----------|--------|
| Finance + Stockix migrations on staging/prod | Partial | P0 | Run `20260519000001`–`00006` + Drizzle |
| Worker image rebuild | Partial | P0 | Rebuild worker so tenant `.env` matches `tenant-env.ts` (no `SIGNUP_ALLOWED_*`) |
| Manual E2E checklist | Missing | P0 | `VERIFICATION_REPORT.md` § Remaining manual tests |
| LemonSqueezy removal | Done | — | `BILLING_ENABLED=false`, wizard + 501 gate |

---

## 9. Resolved product decisions (reference)

These drove implementation; no open action unless you change policy:

| # | Decision |
|---|----------|
| 1 | Stockix pushes license to finance on every license event (internal URL) |
| 2 | Suspended → 402 all; expired → GET-only in grace, then 402 |
| 3 | Condensed `/setup/complete` for tax, logo, address; `setup_completed_at` in DB |
| 4 | Full duplicate of parent **accounts** + **tax_rates** at sub-org creation |
| 5 | Human-readable `ORG-00001` on `tenants_metadata` |
| 6 | All user creation via internal API; no public register |
| 7 | Single finance stack per customer; `switch-tenant` for sub-orgs |
| 8 | LemonSqueezy removed; Stockix `licenses` + `tenant_licenses` are source of truth |

---

## 10. Summary — what is still open

| Area | Status | Priority |
|------|--------|----------|
| Owner dashboard user UI | Missing | P1 |
| Sub-org default account settings copy | Partial | P2 (if required) |
| Staging/prod migrations + worker deploy | Partial | P0 |
| Manual E2E verification | Missing | P0 |
| JWT license in finance token | Deferred | P3 |

---

## 11. Suggested next steps

1. Run migrations + rebuild worker (plan items A–B).  
2. Execute manual E2E tests (plan item C).  
3. Build owner dashboard Users UI (plan item D).  
4. If needed, extend sub-org copy for default account metadata (plan item E).

---

*End of file — gaps only.*
