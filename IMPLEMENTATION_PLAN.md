# Implementation Plan — Bigcapital SaaS Gaps

**Codebase root:** `services/stockix-finance/`  
**Control plane:** `apps/api/`, `packages/db/`, `infra/worker-service/`  
**Last updated:** Tuesday, May 19, 2026

---

## Completed (removed from active plan)

Tasks 1–10 are **done** in code (signup lockdown, setup wizard + DB flag, wizard fields, license sync, internal users API, org number, org switcher, sub-org COA/tax copy, license UI, LemonSqueezy removed).

See `VERIFICATION_REPORT.md` for what was verified. Historical audit: `accountmissing2.md` (now tracks gaps only).

---

## Remaining work

Work in order. Do not skip operational steps before production.

| # | Item | Status | What to do |
|---|------|--------|------------|
| A | **Staging / production migrations** | Partial | Run finance system migrations `20260519000001`–`00006` and Stockix Drizzle migrations on every environment. |
| B | **Worker rebuild & deploy** | Partial | Rebuild `infra/worker-service` after `tenant-env.ts` changes (compiled `.runtime/worker.js` may still emit old `SIGNUP_ALLOWED_*` keys until rebuilt). |
| C | **Manual E2E verification** | Missing | Execute checklist in `VERIFICATION_REPORT.md` § Remaining manual tests (signup 403, license 402, sub-org COA copy, etc.). |
| D | **Owner dashboard — finance user UI** | Missing | `apps/api` exposes `/api/tenants/:tenantId/users` (+ suspend, reset-password, etc.) via `finance-users-http.ts`. **No UI** in `apps/dashboard` calls these routes yet. |
| E | **Sub-org default account settings** | Partial | COA rows + tax rates are copied (`CopyParentTenantSettings.service.ts`). Parent **default AR/AP/inventory account pointers** in org metadata are not explicitly copied to child. Confirm product need; add copy step if required. |
| F | **JWT license claims** | Deferred | Original audit mentioned signed JWT license validation in finance. Not implemented; license enforced via `tenant_licenses` + `LicenseGuard.middleware` + boot meta instead. Implement only if required. |

---

## Rules (unchanged)

- Read `accountmissing2.md` for open gaps before new work
- Read every file mentioned before editing
- Never delete existing functionality — only extend or fix
- Migrations must be backward compatible
- New endpoints: curl example in comments
- TypeScript strict — no `any`
- Follow existing DI / service patterns
