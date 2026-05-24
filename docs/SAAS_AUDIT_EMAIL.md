# SaaS Audit — Session, Auth, License, Email

Date: 2026-05-24

Scope: Accounting provision — login session, one-time password, org access, user management, license, email (Resend), finance tenant ID.

Method: Read-only code trace across `infra/worker-service`, `apps/api`, `apps/dashboard`, `services/stockix-finance`, `packages/db`, and mail config. No assumptions without file evidence.

---

## 1. Session Expired + Infinite Refresh

### Root cause (Finance webapp)

Two separate 401 handlers both tear down session and navigate, which can produce a reload/redirect loop when the token cookie is invalid or expired:

1. **`axios` response interceptor** (`services/stockix-finance/packages/webapp/src/services/axios.tsx:37-52`) — on 401 with a token present: clears cookies, clears `localStorage`/`sessionStorage`, sets `window.location.href = '/auth/login'`.
2. **`useRequest` hook** (`services/stockix-finance/packages/webapp/src/hooks/useRequest.tsx:60-76`) — on 401 with a token: sets `session_expired` global error **and** calls `setLogout()`, which runs `window.location.reload()` (`hooks/state/authentication.tsx:34-43`).

A single failed authenticated API call can trigger **both** a full reload and a hard redirect.

**Cookie vs JWT lifetime mismatch** worsens “session expired” after impersonation:

- Impersonate sets `token` cookie with `maxAge: 60 * 60 * 1000` (1 hour) — `Auth.controller.ts:196-200`
- JWT is signed with `expiresIn: '1d'` — `Auth.module.ts:61-62`

After one hour the browser cookie is gone while operators may still expect access; subsequent requests 401 and hit the dual handlers above.

### Root cause (Dashboard tenant page — “infinite refresh”)

Provisioning poll on tenant detail page (`apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx:214-225`):

- Polls every **2.5s** while `deploymentStatus` or `tenant.status` is `provisioning` or `pending`
- Stops only when status is **not** those values (`clearInterval` on effect cleanup when `isProvisioning` becomes false)

If the lifecycle job completes but **deployment status stays `provisioning`/`pending`** (stuck job, partial failure, or API/worker desync), the page never stops auto-refreshing.

Polling **does** stop when status becomes `active` (or anything other than provisioning/pending).

### Finance URL in provision result

- Worker returns `baseUrl` as `${scheme}://${slug}.${rootDomain}` — `provision-runtime.ts:292`, `1339`
- Dashboard builds public URL via `tenantPublicBaseUrl(slug, internalPort)` — `apps/dashboard/lib/tenant-url.ts`
- Localhost without port returns `null` — operators see missing “Finance login” link until port is known
- Impersonation uses `tenantFinanceBrowserOrigin` in API — `apps/api/src/index.ts:168-177`, `4688`

### Finance reachable / health

- Worker waits on `GET /api/ping` — `fetch-stockix-finance-bootstrap.ts:21-51`
- `LicenseGuardMiddleware` exempts `/api/ping`, `/api/health`, `/api/auth` — `LicenseGuard.middleware.ts:25-30`

**Files involved:**

| File | Role |
|------|------|
| `services/stockix-finance/.../Auth.controller.ts:181-202` | Impersonate: sets short-lived cookie, redirects `/` |
| `services/stockix-finance/.../Auth.module.ts:61-62` | JWT `expiresIn: '1d'` |
| `services/stockix-finance/.../webapp/src/services/axios.tsx:37-52` | 401 → clear storage → `/auth/login` |
| `services/stockix-finance/.../webapp/src/hooks/useRequest.tsx:60-76` | 401 → toast + `setLogout()` reload |
| `apps/dashboard/.../tenants/[id]/page.tsx:214-225` | Provisioning auto-refresh loop |
| `apps/api/src/index.ts:4584-4699` | Impersonate: HMAC password sign-in → impersonate URL |

**Fix needed:**

- [x] Align impersonate cookie `maxAge` with JWT expiry (reads JWT `exp` when setting cookie)
- [x] Use **one** 401 handler in Finance webapp (axios redirect only; `setLogout()` removed on 401 in `useRequest`)
- [x] Dashboard provisioning poll cap (45 min) + stale banner on tenant detail
- [ ] Ensure deployment status transitions to `active` on successful provision (ops: investigate stuck tenants)

---

## 2. One-Time Password

### How generated

**HMAC-SHA256** over `bootstrap:{tenantKey}` using `DEPLOYMENT_SECRET_KEY` (hex) — `infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.ts:22-29`. Same algorithm in API for impersonate — `apps/api/src/index.ts:148-156`.

`tenantKey` = parent tenant slug for sub-orgs, else tenant slug — `provision-runtime.ts:420-422`.

### How long it is valid

| Store | TTL |
|-------|-----|
| Control plane in-memory cache | **15 minutes** — `PROVISION_PASSWORD_TTL_MS` in `apps/api/src/index.ts:331` |
| Encrypted in provision events journal | Persists for audit/re-fetch via status API |
| Finance password itself | **No expiry** — deterministic bootstrap password until admin changes it |

The label “one-time password” in the UI refers to **operator visibility window** (15 min cache), not a single-use or time-limited credential in Finance.

### Force change on first login

**NO** — no `forcePasswordChange`, `mustChangePassword`, or `firstLogin` flags found in Finance server.

### UI / operator instructions

- Tenant list wizard shows OTP when returned from provision status — `apps/dashboard/app/(dashboard)/tenants/page.tsx`
- Tenant detail page does **not** surface OTP or password-change copy
- Welcome email sent on provision complete with `loginUrl` — `apps/api/src/index.ts:1617-1625` (does not include password in email — correct)

**What operator should tell tenant:**

1. Open the Finance URL from the welcome email or dashboard (“Finance login”).
2. Sign in with the **tenant admin email** and the **bootstrap password** shown once in the dashboard immediately after provisioning (within ~15 minutes), **or** use Stockix “Impersonate” (super admin) which signs in with the same derived bootstrap password server-side.
3. **Change the password immediately** under Finance user settings (no forced prompt today).
4. Bootstrap password is **deterministic per slug** — anyone with `DEPLOYMENT_SECRET_KEY` can recompute it; treat rotation of deployment secret and admin password change as security steps.

**Fix needed:**

- [x] Bootstrap password card on tenant detail + “Bootstrap password (shown once)” copy
- [x] Force password change on first login (`must_change_password` + `/auth/change-password`)

---

## 3. Support Agent Org Access

### Current dropdown shows

**Stockix control-plane owners** with `role === "support_agent"` and `status === "active"` from `GET /api/owners` — `tenant-org-access-panel.tsx:79-90`.

Placeholder text: “Choose owner” — line 174.

### Should show (if requirement is Finance org users)

**Finance tenant users** from `GET /api/tenants/:id/users` (proxies to Finance internal users API) — implemented in `tenant-users-panel.tsx`, **not** wired into the support-agent access panel.

The support-agent panel is for **granting Stockix dashboard users** scoped access to tenant organizations — not for picking Finance users.

### Endpoint exists

| Endpoint | Purpose | Wired to support dropdown? |
|----------|---------|----------------------------|
| `GET /api/tenants/:id/users` | Finance users via `finance-users-http.ts` | No (separate “Finance users” card) |
| `GET /api/owners` | Control plane team | **Yes** |
| `POST /api/tenants/:id/organization-access` | Grants support agent → org | Yes |

### Invitation flow

| Flow | Status |
|------|--------|
| Stockix owner invite (`POST /owners/invite`) | Creates invite token + URL — **no email sent** (`index.ts:1913-1963`) |
| Finance user invite (`InviteUser.service`) | Built with email queue — **not used from dashboard** |
| Dashboard “Add user” (Finance users panel) | Creates user with password via API — **not invite** |

**Fix needed:**

- [ ] Send email on `POST /owners/invite` (Resend SMTP)
- [ ] Clarify support-agent panel copy: “Stockix support agent” vs “Finance user”
- [ ] If product intent is Finance-user dropdown, replace `/api/owners` source with tenant users (likely wrong product fit)

---

## 4. Finance Tenant ID Not Set

### Trace

1. **Provision-user returns `tenantId`** — YES — `ProvisionUser.service.ts:122-127`, `InternalProvision.controller.ts:59`
2. **Worker persists early** — YES — `persistFinanceDeploymentIds` on bootstrap — `provision-runtime.ts:817-820`, `181-214`
3. **Job complete persists** — YES — `apps/api/src/index.ts:1493-1517` reads `result.financeTenantId` + journal fallback `readFinanceTenantIdFromProvisionEvents` — `1228-1237`
4. **Dashboard displays** — `tenant.deployment.financeTenantId`; shows “—” when null — `page.tsx:746-782`

### Why it may still show NOT SET

| Scenario | Mechanism |
|----------|-----------|
| Bootstrap step skipped on resume without journal `financeTenantId` | `hasOp("tenant.bootstrap_admin")` skip branch — `828-831` — variable may stay undefined |
| `deploymentId` missing during early bootstrap | `persistFinanceDeploymentIds` no-ops — `192` |
| Finance stack unreachable for repair | `resolveAndPersistFinanceTenantId` fails — `finance-tenant-resolve.ts` |
| Legacy rows before persist fix | DB null; repair button in Finance users panel — `tenant-users-panel.tsx:410-424` |

`routes/jobs/index.ts` defines a **minimal** job complete handler without `financeTenantId` persistence — **not mounted**; worker uses `index.ts` `/internal/jobs/:jobId/complete` — confirmed.

**Is it returned in provision result?** YES when bootstrap succeeds — worker `markJobComplete` includes `financeTenantId` — `worker.ts:223-224`, `466`.

**Fix needed:**

- [ ] On provision resume, if `tenant.bootstrap_admin` already journaled but `financeTenantId` missing, load from `tenant_deployments` or call internal resolve-tenant
- [ ] Ensure journal meta always includes `financeTenantId` on bootstrap (already in `markOp` meta — `821-825`)

---

## 5. License System

| Check | Status | Notes |
|-------|--------|-------|
| Plan limits copied to license | ✅ | `getPlanLimits` + assign on provision — `index.ts:1387-1455` |
| License synced to Finance | ✅ | `syncFinanceLicenseForStockixTenant` on complete — `1521-1527`; `license-finance-sync.ts` |
| Finance enforces maxOrganizations | ✅ | `LicenseService.assertCanCreateOrganization()` before `TenantsManager.createTenant()` |
| Finance enforces maxUsers | ✅ | `InviteUser.service.ts:177`, `InternalUsers.service.ts:265` |
| License expiry syncs | ✅ | Worker cron `license-expire-followup.ts`; Finance `LicenseGuard` + `License.service` |
| Revoked blocks Finance access | ✅ | `LicenseGuard.middleware.ts:77-83` → HTTP 402 |

Finance `LicenseGuard` blocks writes in grace period; read-only still allowed — `104-114`.

Control plane license row is source of truth for sync; Finance copy via `POST /api/internal/sync-license`.

**Fix needed:**

- [ ] Enforce `maxOrganizations` in Finance when provisioning additional orgs / tenants (e.g. count built tenants per system user or org records)
- [ ] Add integration test for limit enforcement

---

## 6. Email (Resend)

### Configuration

| Component | Config | Status |
|-----------|--------|--------|
| Control plane | `MAIL_HOST=smtp.resend.com`, `MAIL_PASSWORD` (Resend API key), `MAIL_FROM_ADDRESS` | **SET** — key format `re_*` in `.env` |
| Finance server | `mail.host`, `mail.password` via Nest config / tenant env | Per-tenant `.env` from provision |
| POS | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | **SET** in `pos-backend/.env` |
| Chatwoot (prod compose) | `SMTP_*` from `MAIL_*` env | Mapped in `infra/prod/docker-compose.yml:292-296` |

`sendMail` skips silently if `MAIL_PASSWORD` or `MAIL_FROM_ADDRESS` missing — `mailer.ts:27-29`.

### Email flows

| Email Flow | Configured | Sends | Notes |
|-----------|-----------|-------|-------|
| Provision welcome | ✅ | ✅ (if mail env set) | `sendTenantWelcomeEmail` on job complete — non-fatal on error |
| Password reset (control plane) | N/A | — | Owners use invite/accept flow |
| Password reset (Finance) | Per-tenant mail | ✅ if SMTP set | `AuthSendResetPasswordService` |
| License expiring (30 days) | ✅ | ✅ | `license-expire-followup.ts` + `sendLicenseExpiringEmail` |
| License expired | ✅ | ✅ | `sendLicenseExpiredEmail` |
| User invitation (Finance) | Per-tenant mail | ✅ if SMTP + queue | Dashboard **Invite user** via internal API |
| User invitation (Stockix owners) | ✅ | ✅ | `sendOwnerInviteEmail` on `/owners/invite` (non-fatal on failure) |
| Finance transactional (invoice/receipt) | Per-tenant | Depends on org mail settings | Mail module + queues |
| POS emails | ✅ | ✅ if `RESEND_API_KEY` | `platformWorker.js` |
| Chatwoot emails | ✅ | Depends on prod env | SMTP from compose |

**Resend API key:** SET (starts with `re_`)

**SMTP config:** CORRECT pattern for Resend (`smtp.resend.com:587`, user `resend`, pass = API key)

**Fix needed:**

- [x] Send invite email on `POST /owners/invite`
- [ ] Verify each tenant Finance stack receives `MAIL_*` in provisioned `.env` (ops)
- [ ] Operational: confirm `MAIL_FROM_ADDRESS` domain verified in Resend

---

## 7. All Issues Priority List

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | Finance 401 handled twice (reload + redirect) | Critical | Single handler; align cookie/JWT TTL |
| 2 | Impersonate cookie 1h vs JWT 1d | Critical | Match `maxAge` to JWT |
| 3 | `finance_tenant_id` missing on resume / legacy rows | Critical | DB/journal backfill on resume; repair endpoint exists |
| 4 | Dashboard provisioning poll if status stuck | High | Ops: fix status; optional max poll timeout |
| 5 | `maxOrganizations` not enforced in Finance | High | Add guard on org/tenant create |
| 6 | Owner invite does not email | High | `sendMail` on invite |
| 7 | Support-agent dropdown labeled “Choose owner” | Medium | Copy fix; clarify vs Finance users |
| 8 | “One-time password” naming / no force change | Medium | UI + optional Finance flag |
| 9 | Finance user create uses password not invite | Medium | Product decision |

---

## 8. What Was Fixed In This Pass

| Area | Key files |
|------|-----------|
| Session 401 loop | `useRequest.tsx`, `axios.tsx` |
| Impersonate cookie TTL | `Auth.controller.ts` (JWT `exp`-aligned `maxAge`) |
| `finance_tenant_id` on provision resume | `provision-runtime.ts` |
| `maxOrganizations` | `License.service.ts`, `TenantsManager.ts` |
| Owner invite email | `mail/send.ts`, `index.ts` |
| Support-agent labels | `tenant-org-access-panel.tsx` |
| Provisioning poll cap + banner | `tenants/[id]/page.tsx` |
| Bootstrap UX + repair link on detail | `tenants/[id]/page.tsx`, `repair-finance-link` API route |
| Finance invite from dashboard | `InternalUsers.*`, `finance-users-http.ts`, `tenant-users-panel.tsx` |
| Force password change | Migration `must_change_password`, `AuthChangePassword.service.ts`, webapp `/auth/change-password` |

See [STAGING_VERIFICATION.md](./STAGING_VERIFICATION.md) for operator runbook and sign-off checklist.

---

## 9. Still Outstanding

- Per-tenant Finance mail verification in production (ops)
- Stuck `provisioning` status — operational playbook in STAGING_VERIFICATION (no further code required for cap)
- POS split-bill / multi-payment deposit (separate integration scope)
- JWT license claims in finance token (`docs/accountmissing2.md`)

---

## Appendix — TypeScript / tests (baseline)

Run after fixes:

```bash
cd apps/api && npx tsc --noEmit
cd apps/dashboard && npx tsc --noEmit
cd services/stockix-finance/packages/server && npx tsc --noEmit
cd infra/worker-service && npx tsc --noEmit
cd apps/api && pnpm test
```
