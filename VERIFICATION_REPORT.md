# Verification Report

**Date:** Tuesday, May 19, 2026  
**Scope:** Sections 1–10 (57 code checklist items)

---

## Code verification

All **57** implementation checklist items passed static code review (see git history / prior report revision for per-file evidence).

**Code status:** Complete  
**Production go-live:** Blocked on operational items below (not on missing application code for Tasks 1–10).

---

## Partial / missing (not code-complete for go-live)

| Item | Status | Notes |
|------|--------|-------|
| Worker deploy | Partial | Rebuild and redeploy worker after `tenant-env.ts` removed `SIGNUP_ALLOWED_*`. |
| DB migrations (all envs) | Partial | Finance `20260519000001`–`00006` + Stockix Drizzle must be applied outside dev. |
| Manual E2E tests | Missing | Not run in automated verification; required before production. |
| Owner dashboard user UI | Missing | API proxied in `apps/api/src/finance-users-http.ts`; no `apps/dashboard` screens wired. |
| Sub-org default account pointers | Partial | COA + tax_rates copied; org default account IDs in metadata not explicitly copied. |
| JWT license in token | Deferred | Out of original Tasks 1–10; middleware + DB license used instead. |

---

## Remaining manual tests

Run in staging with live finance stack + Stockix API:

1. `POST /api/auth/register` with `SIGNUP_DISABLED=true` → **403** (not 400).
2. Open `/auth/register` when signup disabled → redirect to `/auth/login`; no form.
3. `POST /api/internal/provision-user` with `x-internal-secret` → user + `user_tenants`; no public register.
4. Dashboard blocked until `POST /api/organization/setup/complete`; `setup_completed_at` set in DB.
5. License `suspended` → **402** on all methods; `expired` past grace → **402** all; within grace → GET OK, mutations **402**.
6. Invite/create user at `max_users` → **402**.
7. Stockix license assign/extend/revoke → finance `tenant_licenses` updated.
8. `apps/api` `/api/tenants/:tenantId/users` CRUD → proxies to finance internal API.
9. Org switcher → switch tenant, full reload `/`, org number subtitle.
10. Sub-org provision with parent → COA + tax copied; `parent_tenant_id` set.
11. License UI: suspended overlay; grace banner only; gated invoice/bill/expense actions.
12. Billing disabled → subscription **501**; no LemonSqueezy wizard step.
13. After worker rebuild → new tenant `.env` has `SIGNUP_DISABLED=true` only (no allowlist keys).

---

## Fixes applied during verification pass

| File | Change |
|------|--------|
| `AuthSignup.service.ts` | 403 only when disabled; allowlist removed |
| `tenant-env.ts` | No `SIGNUP_ALLOWED_*` in tenant env |
| `RegisterRoute.tsx` + `authentication.tsx` | Route-level signup redirect |
| `useLicenseWriteAllowed.ts` | Blocks grace/expired/suspended |
| `LicenseBanner.tsx` | Grace only |
| `apps/api/src/organization-number.ts` | Re-export `allocateOrganizationNumber` |

---

## Final status

| | |
|--|--|
| **Application code (Tasks 1–10)** | Ready |
| **Production ready** | **No** — until A–C in `IMPLEMENTATION_PLAN.md` and manual tests above pass |
| **Next build priority** | Owner dashboard user UI (item D) if operators need UI before API-only workflows |
