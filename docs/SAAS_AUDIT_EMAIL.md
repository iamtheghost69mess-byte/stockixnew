# SaaS Audit — Session, Auth, License, Email

Date: 2026-05-24 (updated after repair pass)

Scope: Accounting provision — login session, one-time password, org access, user management, license, email (Resend), finance tenant ID.

Method: Code trace across `infra/worker-service`, `apps/api`, `apps/dashboard`, `services/stockix-finance`, `packages/db`, and mail config.

---

## 1. Session Expired + Infinite Refresh

### Root cause (Finance webapp) — FIXED

Two separate 401 handlers caused reload + redirect loops. **Fixed:** `useRequest` no longer calls `setLogout()` on 401; axios interceptor handles redirect only.

**Cookie vs JWT lifetime** — **Fixed:** impersonate cookie `maxAge` derived from JWT `exp` in `Auth.controller.ts`.

### Dashboard provisioning poll — FIXED

**Fixed:** 45-minute poll cap + stale banner on `tenants/[id]/page.tsx`.

### Remaining (ops)

- [ ] Stuck `provisioning`/`pending` in DB when job completed but deployment status not updated — investigate worker/API desync; see [STAGING_VERIFICATION.md](./STAGING_VERIFICATION.md)

---

## 2. Bootstrap Password

| Topic | Status |
|-------|--------|
| HMAC deterministic password per slug | By design |
| 15 min dashboard visibility cache | By design |
| Bootstrap card on tenant detail | **Fixed** |
| UI copy “Bootstrap password (shown once)” | **Fixed** |
| Force change on first login | **Fixed** — `must_change_password` + `/auth/change-password` |

**Migration required on deploy:** `20260524000001_add_must_change_password_to_users.js`

---

## 3. Support Agent Org Access

Support-agent panel correctly uses Stockix `/api/owners` (`support_agent` role), not Finance users. **Fixed:** labels clarified (“Stockix support agent”).

Finance users are managed in **Finance users** panel with **Invite user** (primary) and break-glass **Set password directly**.

| Flow | Status |
|------|--------|
| `POST /owners/invite` email | **Fixed** — `sendOwnerInviteEmail` |
| Dashboard Finance invite | **Fixed** — internal API + UI |

**Not a bug:** wiring Finance users into support-agent dropdown (wrong product model).

---

## 4. Finance Tenant ID

| Step | Status |
|------|--------|
| Worker persists on bootstrap | Yes |
| Job complete persists | Yes |
| Resume restores from `tenant_deployments` | **Fixed** |
| Dashboard display + repair button | **Fixed** |

**Ops:** legacy null rows — use **Repair Finance link** on tenant detail or Finance users panel.

---

## 5. License System

| Check | Status |
|-------|--------|
| Plan limits on provision | Yes |
| Sync to Finance | Yes |
| `maxOrganizations` on create tenant | **Fixed** + unit tests |
| `maxUsers` on invite/create | Yes + unit test on internal invite |
| Expiry / revoked / 402 | Yes |

---

## 6. Email (Resend)

| Flow | Status |
|------|--------|
| Provision welcome | Yes (if mail env set) |
| Owner invite | **Fixed** |
| Finance user invite (dashboard) | **Fixed** (per-tenant SMTP required) |
| License expiry emails | Yes |

**Ops (not code):**

- [ ] Verify `MAIL_FROM_ADDRESS` domain in Resend
- [ ] Spot-check tenant `.env` after provision has `MAIL_HOST`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`

---

## 7. Priority List (reconciled)

| # | Issue | Status |
|---|-------|--------|
| 1 | Finance 401 dual handler | **Fixed** |
| 2 | Impersonate cookie vs JWT | **Fixed** |
| 3 | `finance_tenant_id` on resume | **Fixed** |
| 4 | Dashboard infinite provision poll | **Fixed** (cap); stuck DB status = ops |
| 5 | `maxOrganizations` | **Fixed** |
| 6 | Owner invite email | **Fixed** |
| 7 | Support-agent labels | **Fixed** |
| 8 | Bootstrap UX + force password change | **Fixed** |
| 9 | Finance invite vs password create | **Fixed** (invite primary) |

---

## 8. What Was Fixed (code)

| Area | Key files |
|------|-----------|
| Session 401 loop | `useRequest.tsx`, `axios.tsx` |
| Impersonate cookie TTL | `Auth.controller.ts` (JWT `exp`) |
| `finance_tenant_id` on provision resume | `provision-runtime.ts` |
| `maxOrganizations` | `License.service.ts`, `TenantsManager.ts` |
| Owner invite email | `mail/send.ts`, `index.ts` |
| Support-agent labels | `tenant-org-access-panel.tsx` |
| Provisioning poll cap + banner | `tenants/[id]/page.tsx` |
| Bootstrap UX + repair link | `tenants/[id]/page.tsx`, repair-finance-link routes |
| Finance invite from dashboard | `InternalUsers.*`, `Internal.module.ts` (+ `UsersModule`), `finance-users-http.ts`, `tenant-users-panel.tsx` |
| Force password change | migration, `AuthChangePassword.service.ts`, webapp guards + `/auth/change-password` |

Operator checklist: [STAGING_VERIFICATION.md](./STAGING_VERIFICATION.md)

---

## 9. Still Outstanding

| Item | Type |
|------|------|
| Deploy migrations + redeploy worker/API/dashboard/Finance | **Required before production** |
| Staging smoke tests (STAGING_VERIFICATION) | **Required sign-off** |
| Resend domain + per-tenant `MAIL_*` verification | Ops |
| Stuck provisioning status in DB | Ops playbook in STAGING_VERIFICATION |
| POS split-bill / multi-payment deposit | Separate scope |
| JWT license claims in finance token | `docs/accountmissing2.md` |

---

## Appendix — Verification commands

```bash
cd apps/api && npx tsc --noEmit && pnpm test
cd apps/dashboard && npx tsc --noEmit
cd services/stockix-finance/packages/server && npx tsc --noEmit && pnpm test
cd infra/worker-service && npx tsc --noEmit
pnpm infra:worker:build
```
