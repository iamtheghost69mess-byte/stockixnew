# Stockix Email System Audit

**Date:** 2026-05-27  
**Method:** Full static trace + `grep`/`git` verification + `vitest run` on email test files (read-only on application code)  
**Status:** **NOT PRODUCTION READY** (control-plane mail is largely implemented; gaps in observability, POS env wiring, security fallbacks, and Finance branding block a clean production verdict)

---

## EXECUTIVE SUMMARY

The monorepo runs **four distinct outbound email systems**: (1) the **control-plane API** (`apps/api/src/mail/*`) using Resend via REST API (when `MAIL_PASSWORD` starts with `re_`) or Nodemailer SMTP, with `email_logs` and a Resend webhook; (2) the **provision worker** reusing control-plane send helpers for POS welcome mail during provisioning; (3) **Stockix Finance** (per-tenant NestJS) via Nodemailer + BullMQ queues; and (4) **POS backend** (`services/posnew`) via the Resend SDK with `RESEND_API_KEY`, independent of control-plane `MAIL_*`. **Chatwoot/Chatlive** uses Rails ActionMailer with SMTP env vars mapped from the same `MAIL_*` block in `infra/prod/docker-compose.yml`.

Compared to older internal docs (removed in this audit), **owner password reset is implemented and does call `sendOwnerPasswordResetEmail`** — it is not a missing stub. The main production risks are: **worker/POS sends not recorded in `email_logs`**, **`inviteUrl` returned in API JSON when email fails**, **plaintext `invite_token` in Postgres**, **POS `RESEND_API_KEY` not provisioned in tenant stack/worker env**, **Finance HTML templates still carrying Bigcapital branding**, and **silent `skipped` sends when `MAIL_*` is unset** (operators may believe mail was delivered).

`infra/prod/.env` has `MAIL_*` and `RESEND_WEBHOOK_SECRET` populated; root `.env` has `MAIL_PASSWORD` empty (local dev). All **7** email-related API test files (**17** tests) **passed** on 2026-05-27.

---

## SECTION 1 — EMAIL SYSTEMS INVENTORY

| System | Service | Transport | Provider | email_logs? | Status |
|--------|---------|-----------|----------|-------------|--------|
| Control-plane transactional | `apps/api` | Resend REST if `MAIL_PASSWORD`=`re_*` and `MAIL_TRANSPORT`≠`smtp`; else Nodemailer SMTP | Resend | Yes (via `initEmailLogging` in API only) | ⚠️ PARTIAL |
| Provision worker (POS welcome) | `infra/worker-service` | Same as API (`@repo/platform-worker-shared` → `sendPosWelcomeEmail`) | Resend (inherits worker `MAIL_*`) | **No** (`initEmailLogging` not called in worker) | ⚠️ PARTIAL |
| Stockix Finance (tenant) | `services/stockix-finance` | Nodemailer SMTP (`Mail.module.ts`) | Resend SMTP (tenant `MAIL_*` from provision) | No (tenant-local; not `email_logs`) | ⚠️ PARTIAL |
| POS platform worker | `services/posnew/apps/pos-backend` | Resend SDK (`resend.emails.send`) | Resend | No | ❌ BROKEN in prod unless `RESEND_API_KEY` set manually |
| Chatwoot / Chatlive | `services/chatlive` | ActionMailer → SMTP | Same as `MAIL_*` in compose | No | ⚠️ PARTIAL (depends on Chatwoot SMTP env) |

---

## SECTION 2 — COMPLETE EMAIL FLOW STATUS

| Flow | Trigger | File | Transport | Logged? | Status | Issue |
|------|---------|------|-----------|---------|--------|-------|
| Owner forgot password | `POST /auth/password/forgot` | `services/auth/password-reset.ts` → `sendOwnerPasswordResetEmail` | Control-plane Resend/SMTP | Yes (API) | ✅ WORKS | Skips send if `!isMailConfigured()`; dev logs link to console |
| Owner password changed notice | After `POST /auth/password/reset` | `password-reset.ts` → `sendPasswordChangedEmail` | Control-plane | Yes (API) | ✅ WORKS | Fire-and-forget; failures only logged |
| Owner invite | `POST /owners` / resend | `owner-invite-delivery.ts` → `sendOwnerInviteEmail` | Control-plane | Yes (API) | ⚠️ PARTIAL | `inviteUrl` in JSON if email fails; `invite_token` plaintext in DB |
| Owner invite (queued) | Same, when BullMQ enabled | `owner-invite-mail-queue.ts` | Control-plane | Yes (API) | ✅ WORKS | Requires queue + mail configured |
| Tenant welcome (generic) | After provision completes | `routes/internal.ts` | Control-plane | Yes (API) | ✅ WORKS | Not called from `tenants.ts` (dead import there) |
| Finance welcome + OTP | After provision (accounting module) | `routes/internal.ts` → `sendFinanceWelcomeEmail` | Control-plane | Yes (API) | ⚠️ PARTIAL | OTP in email body by design; sensitive |
| POS welcome + PINs | POS provision step | `provision-runtime.ts` → `sendPosWelcomeEmail` | Control-plane | **No** | ⚠️ PARTIAL | PINs in email; worker does not init `email_logs` |
| License expiring (tenant admin) | License milestone job / follow-up | `mail/send.ts`, `license-expire-followup.ts` | Control-plane | Yes (API) | ✅ WORKS | Dedup via `hasLicenseExpiryMilestoneNotification` + `license_history` |
| License expiring (platform owner) | Same | `sendLicenseExpiringEmailToPlatformOwner` | Control-plane | Yes (API) | ✅ WORKS | — |
| License expired | `processLicenseExpiryFollowUp` | `sendLicenseExpiredEmailForTenant` | Control-plane | Yes (API) | ✅ WORKS | Writes `license_history` on success |
| Finance invoice mail | User action in Finance UI | `SendSaleInvoiceMail.ts` + processor | Tenant SMTP | No | ⚠️ PARTIAL | Needs tenant `MAIL_*` + Redis |
| Finance estimate mail | User action | `SendSaleEstimateMail.ts` | Tenant SMTP | No | ⚠️ PARTIAL | Same |
| Finance receipt mail | User action | `SaleReceiptMailNotification.ts` | Tenant SMTP | No | ⚠️ PARTIAL | Same |
| Finance payment received | User action | `PaymentReceivedMailNotification.ts` | Tenant SMTP | No | ⚠️ PARTIAL | Same |
| Finance user invite | Invite flow | `InviteSendMailNotification.subscriber.ts` | Tenant SMTP + BullMQ | No | ⚠️ PARTIAL | 3 attempts, exponential backoff |
| Finance password reset | Auth event | `AuthMail.subscriber.ts` → queue | Tenant SMTP + BullMQ | No | ⚠️ PARTIAL | Same |
| Finance signup verify | Auth signup | `AuthMail.subscriber.ts` | Tenant SMTP + BullMQ | No | ⚠️ PARTIAL | Gated by `signupConfirmation` config |
| POS org invitation | BullMQ `org_invitation` job | `platformWorker.js` | Resend SDK | No | ❌ BROKEN | `RESEND_API_KEY` not in `infra/pos-tenant-stack`; default `onboarding@resend.dev` |
| POS generic `send_resend` | BullMQ | `platformWorker.js` | Resend SDK | No | ❌ BROKEN | Same env gap |
| POS suspension warning | BullMQ | `platformWorker.js` | Resend SDK | No | ❓ UNVERIFIED | Same Resend dependency |
| Resend delivery webhook | `POST /webhooks/resend` | `routes/webhooks/resend.ts` | N/A | Updates `email_logs.delivery_status` | ✅ WORKS | Requires `RESEND_WEBHOOK_SECRET` in production |
| Chatwoot agent/notification mail | Rails app events | `config/initializers/mailer.rb` | SMTP | No | ❓ UNVERIFIED | Uses `SMTP_*` from compose; not traced live |

---

## SECTION 3 — ENVIRONMENT VARIABLES

Values checked on disk 2026-05-27. **Secrets are never listed in full** — only presence.

| Variable | Required By | Set in prod? (`infra/prod/.env`) | Set in root `.env`? | Default | Impact if Missing |
|---------|-------------|:--------------------------------:|:-------------------:|---------|-------------------|
| `MAIL_HOST` | API, Finance tenant, Chatwoot SMTP | `<SET>` (`smtp.resend.com`) | `<SET>` | `smtp.resend.com` in examples | SMTP connection fails |
| `MAIL_PORT` | Same | `<SET>` (`587`) | `<SET>` | `587` | Connection fails |
| `MAIL_USERNAME` | Same | `<SET>` (`resend`) | `<SET>` | `resend` | Auth fails |
| `MAIL_PASSWORD` | Same (`isMailConfigured`) | `<SET>` (Resend key `re_*`) | **`<EMPTY>`** | — | **All control-plane mail `skipped`** |
| `MAIL_SECURE` | Same | `<SET>` (`false`) | `<SET>` | `false` | Wrong TLS mode |
| `MAIL_FROM_NAME` | Same | `<SET>` (`Stockix`) | `<SET>` | `Stockix` | Wrong display name |
| `MAIL_FROM_ADDRESS` | Same | `<SET>` (`noreply@stockix.cloud`) | placeholder domain | — | **`isMailConfigured()` false** if empty |
| `MAIL_TRANSPORT` | API (`mailer.ts`) | not set (uses API path for `re_*`) | not set | unset → auto | Force SMTP if `smtp` |
| `RESEND_WEBHOOK_SECRET` | API webhook (`getResendWebhookSecret`) | `<SET>` (`whsec_*`) | **`<EMPTY>`** | — | Prod webhook **401**; dev accepts unsigned |
| `RESEND_API_KEY` | POS only | **Not in prod compose/env template** | N/A in root | — | POS emails **skipped** with warn log |
| `RESEND_FROM_EMAIL` | POS | **Not in tenant stack** | N/A | `onboarding@resend.dev` | Wrong/test sender |
| `DASHBOARD_URL` | Password reset link | (not re-grepped; required for link) | — | — | Reset URL not built; no email content |
| `REDIS_URL` | Finance mail queues, owner-invite queue | prod compose | varies | — | Queued mail falls back or fails |
| `SMTP_ADDRESS` / `SMTP_*` | Chatwoot | Mapped from `MAIL_*` in compose | — | localhost in Ruby default | Chatwoot mail fails |

**`@repo/config`:** `isMailConfigured()` = `MAIL_PASSWORD` and `MAIL_FROM_ADDRESS` both non-empty (`packages/config/src/index.ts:286-288`). Production required keys include `RESEND_WEBHOOK_SECRET` (`packages/config/src/index.ts:96-97`).

**Tenant provisioning:** `infra/worker-service/domain/provisioning/tenant-env.ts` copies `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD` (optionally encrypted), `MAIL_PORT`, `MAIL_SECURE`, `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS` into per-tenant Finance env — **does not copy `RESEND_API_KEY`**.

---

## SECTION 4 — DATABASE STATE

| Table/Column | Exists? | Purpose | Used? |
|-------------|---------|---------|-------|
| `email_logs` | Yes (`0043_email_logs.sql`, `schema.ts:469-492`) | Outbound control-plane attempts + delivery | Yes — insert on API send; webhook updates `delivery_status` |
| `owners.invite_token` | Yes (`schema.ts:57`) | Owner invite acceptance | Yes — **plaintext UUID** |
| `owners.invite_token_expires_at` | Yes | Invite TTL | Yes |
| `owners.password_reset_token_hash` | Yes (`schema.ts:62`) | Reset token storage | Yes — **SHA-256 hash** of raw token |
| `owners.password_reset_expires_at` | Yes | Reset TTL | Yes |
| `license_history` | Yes | Audit + dedup metadata for license emails | Yes — `expiry_warning_sent`, `expired_email_sent` |

**`initEmailLogging` call sites:** only `apps/api/src/app/create-control-plane-app.ts:73`. **Not** called in `infra/worker-service` — worker-originated `sendPosWelcomeEmail` does **not** write `email_logs`.

---

## SECTION 5 — SECURITY ISSUES

### SEC-1: Invite URL returned in API response when email fails

**Severity:** High  
**File:** `apps/api/src/routes/owners.ts:236-242`, `services/invites/owner-invite-delivery.ts:53`  
**Issue:** If inline invite email fails, response includes `inviteUrl` so admins can copy the link.  
**Impact:** Anyone with API access to create invites can obtain a live invite token from JSON without mailbox access.  
**Fix:** Return invite URL only through a separate, highly privileged audit channel, or one-time admin-only endpoint; never in standard create-owner response in production.

### SEC-2: Owner invite tokens stored in plaintext

**Severity:** High  
**File:** `packages/db/src/schema.ts:57`, `apps/api/src/routes/owners.ts:167-177`, `services/invites/invites.ts:104-109`  
**Issue:** `invite_token` is a raw UUID in Postgres.  
**Impact:** DB leak exposes active invite links.  
**Fix:** Store hash only (same pattern as `password_reset_token_hash`); compare on accept.

### SEC-3: One-time passwords and POS PINs in email bodies

**Severity:** Medium (accepted product risk)  
**File:** `apps/api/src/mail/send.ts:134-183` (Finance OTP), `151-244` (POS PIN table)  
**Issue:** Credentials transmitted via email.  
**Impact:** Mailbox compromise = credential compromise; forwarding risk for POS PIN email.  
**Fix:** Prefer magic links, separate per-user delivery, or force password change on first login without emailing secrets (long-term).

### SEC-4: Silent skip when mail not configured

**Severity:** Medium  
**File:** `apps/api/src/mail/mailer.ts:101-118`  
**Issue:** `sendMail` returns `{ status: "skipped", reason: "not_configured" }` without throwing.  
**Impact:** Callers must check `mailSendSucceeded`; missed checks look like success to users.  
**Fix:** Use `sendMailOrThrow` for user-critical paths or surface `mailStatus` in all API responses (forgot-password already does).

### SEC-5: Password reset response leaks mail diagnostics

**Severity:** Low  
**File:** `apps/api/src/routes/auth/index.ts:395-402`  
**Issue:** Response includes `emailSent`, `mailConfigured`, `mailStatus`.  
**Impact:** Minor reconnaissance on mail setup.  
**Fix:** Always return generic `{ ok: true }` to client; log details server-side only.

### SEC-6: Development webhook accepts unsigned payloads

**Severity:** Low (dev only)  
**File:** `apps/api/src/routes/webhooks/resend.ts:78-82`  
**Issue:** Without secret, webhooks accepted with warning.  
**Impact:** Forged delivery status in dev DB.  
**Fix:** Already rejects in production when secret missing (`:56-62`).

### SEC-7: POS default from address

**Severity:** Medium in misconfigured deploys  
**File:** `services/posnew/apps/pos-backend/config/config.js:105-106`  
**Issue:** Default `RESEND_FROM_EMAIL` = `onboarding@resend.dev`.  
**Impact:** Test-domain sender in production if env omitted.  
**Fix:** Require `RESEND_FROM_EMAIL` when `RESEND_API_KEY` set; fail fast on boot.

---

## SECTION 6 — BROKEN FLOWS (MUST FIX BEFORE LAUNCH)

### BROKEN-1: POS transactional email in production stacks

**File:** `services/posnew/apps/pos-backend/workers/platformWorker.js:44-71`, `infra/pos-tenant-stack` (no `RESEND` grep hits)  
**What should happen:** Org invitations and POS mail jobs send via Resend.  
**What actually happens:** If `RESEND_API_KEY` unset, worker logs warning and **returns without sending**. Tenant stack does not inject Resend vars from worker provision.  
**Root cause:** POS uses a separate env contract not wired in `tenant-env.ts` or pos compose templates.  
**Exact fix required:**
1. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to tenant POS env generation (`tenant-env.ts` or POS-specific env file).
2. Document in `infra/prod/.env.example` and set on server at deploy.
3. Remove reliance on `onboarding@resend.dev` default in production.

**Test to verify:** Enqueue `org_invitation` job; confirm Resend dashboard shows delivery.

### BROKEN-2: Worker POS welcome email invisible in `email_logs`

**File:** `infra/worker-service/src/provision-runtime.ts:143-148`, `apps/api/src/app/create-control-plane-app.ts:73`  
**What should happen:** All control-plane sends auditable in admin email logs.  
**What actually happens:** Worker calls `sendPosWelcomeEmail` but never `initEmailLogging`.  
**Root cause:** Logging hook only registered in API process.  
**Exact fix required:**
1. Call `initEmailLogging(db)` in worker bootstrap with same DB, **or**
2. HTTP callback to internal API to send mail, **or**
3. Duplicate lightweight log insert in worker after send.

**Test to verify:** Provision tenant with POS; row appears in `email_logs` with `template_key = pos-welcome`.

---

## SECTION 7 — TRANSPORT CONFIGURATION

### How email transport is selected

`apps/api/src/mail/mailer.ts`:

1. If `!isMailConfigured()` → return `skipped` (no network I/O).
2. If `MAIL_TRANSPORT` is `smtp` (case-insensitive) → Nodemailer SMTP only.
3. Else if `MAIL_PASSWORD` trimmed starts with `re_` → `sendViaResendApi` (REST, `resend-api.ts`).
4. Else → Nodemailer SMTP with optional `Resend-Idempotency-Key` header.

Finance tenants use Nodemailer only (`Mail.module.ts:30-41`) with config from `common/config/mail.ts` (tenant `MAIL_*`).

POS uses Resend Node SDK directly — **does not** use `apps/api/src/mail/mailer.ts`.

### Silent failure behavior

| Path | Behavior |
|------|----------|
| `sendMail` | Returns `{ status: "skipped" }` or `{ status: "failed" }` — **does not throw** |
| `sendMailOrThrow` | Throws if not `sent` |
| POS `sendResendEmail` | Logs warning and returns if no API key |
| Finance `MailModule` | Warns on startup if password/from missing; send likely fails at SMTP |

### Resend API vs SMTP

| Path | Mode | Webhook correlation |
|------|------|---------------------|
| API with `re_*` key | REST | `data.email_id` matches `provider_message_id` |
| API with `MAIL_TRANSPORT=smtp` | SMTP | May need `message_id` candidates (`provider-message-id.ts`) |
| Finance tenant | SMTP to `smtp.resend.com` | Not linked to control-plane `email_logs` |
| POS | REST SDK | Not linked to `email_logs` |

**Idempotency:** REST uses `Idempotency-Key` header (`resend-api.ts:14-16`); SMTP uses `Resend-Idempotency-Key` (`mailer.ts:73-75`). Template-specific keys in `send.ts` (e.g. `owner-invite/...`, `password-reset/...`).

---

## SECTION 8 — BRANDING ISSUES

| Location | Issue | Severity |
|----------|-------|----------|
| `services/stockix-finance/packages/server/static/mail/UserInvite.html` | `bigcapital` CSS classes, `cid:bigcapital_logo` | High |
| `services/stockix-finance/packages/server/static/mail/SignupVerifyEmail.html` | Same | High |
| `services/stockix-finance/packages/server/static/mail/ResetPassword.html` | Same | High |
| Control-plane templates | Use `apiConfig.brandName` / "Stockix" in subjects | OK |
| POS invitation HTML | Generic copy, no Stockix branding | Low |

---

## SECTION 9 — TEST COVERAGE

**Command run:** `cd apps/api && pnpm test tests/password-reset-email.test.ts tests/email-logs.test.ts tests/license-expiry-email.test.ts tests/finance-credentials-email.test.ts tests/pos-credentials-email.test.ts tests/resend-webhook.test.ts tests/webhook-auth-gate.test.ts`

**Result:** **7 files, 17 tests, all passed** (2026-05-27).

| Flow | Test File | Pass/Fail | Coverage |
|------|-----------|-----------|----------|
| Password reset email content | `password-reset-email.test.ts` | Pass | Unit — mocked `sendMail` |
| Finance welcome HTML | `finance-credentials-email.test.ts` | Pass | Unit — mocked |
| POS welcome HTML | `pos-credentials-email.test.ts` | Pass | Unit — mocked |
| License expiring/expired | `license-expiry-email.test.ts` | Pass | Unit — mocked |
| Email log hash/insert | `email-logs.test.ts` | Pass | Unit |
| Resend webhook correlation | `resend-webhook.test.ts` | Pass | Integration-style with mock DB |
| Webhook auth gate | `webhook-auth-gate.test.ts` | Pass | Signature / prod guard |
| Owner invite E2E | — | **None** | Gap |
| Forgot-password HTTP route | — | **None** | Gap |
| Finance SMTP integration | — | **None** | Gap |
| POS Resend integration | — | **None** | Gap |

---

## SECTION 10 — WHAT IS WORKING WELL

1. **Password reset pipeline** — `requestOwnerPasswordReset` hashes token, emails via `sendOwnerPasswordResetEmail`, rate-limited route (`auth/index.ts:44-45, 382-402`). Verified by unit test.
2. **Resend webhook** — Svix verification, production rejects missing secret, updates `email_logs.delivery_status` with candidate ID matching (`resend.ts`, tests pass).
3. **Central mail abstraction** — Single `sendMail` with logging hook, idempotency keys per template, and structured `MailSendResult`.
4. **License email dedup** — Milestone notifications use `hasLicenseExpiryMilestoneNotification` plus `license_history` entries on successful send.
5. **Provision welcome path** — `internal.ts` chooses Finance vs generic welcome; creates owner notification on failure.
6. **Finance mail reliability** — BullMQ `MAIL_QUEUE_JOB_OPTIONS`: 3 attempts, exponential 5s backoff (`mail-queue.constants.ts`).
7. **Tenant Finance env** — Mail vars copied (and optionally encrypted) during provision (`tenant-env.ts:95-101`).

---

## SECTION 11 — PRODUCTION READINESS VERDICT

### Must fix before ANY customer uses the system

1. Wire **POS `RESEND_API_KEY` / `RESEND_FROM_EMAIL`** into production tenant deployment (BROKEN-1).
2. Stop returning **`inviteUrl` in invite API responses** when email fails (SEC-1) — or restrict to break-glass role only.
3. Confirm **`MAIL_PASSWORD` + `MAIL_FROM_ADDRESS`** on server match verified Resend domain (prod file shows set; verify at deploy).
4. Run **`pnpm db:migrate`** on production so `email_logs` exists (API already guards with helpful error).

### Must fix before billing customers

1. **Hash owner invite tokens** at rest (SEC-2).
2. **Finance email branding** — replace Bigcapital assets in static templates (Section 8).
3. **Worker email observability** — log worker sends to `email_logs` (BROKEN-2).
4. Configure **Resend webhook** endpoint in Resend dashboard pointing to `https://<api>/webhooks/resend` with same `RESEND_WEBHOOK_SECRET`.

### Fix post-launch (within 1 month)

1. Remove dead import `sendTenantWelcomeEmail` from `apps/api/src/routes/tenants.ts:95`.
2. Reduce password-reset API diagnostic leakage (SEC-5).
3. Add HTTP/integration tests for `/auth/password/forgot` and owner invite.
4. Document operator playbook when `mailStatus: skipped`.

### Fix post-launch (within 1 quarter)

1. Unify POS mail onto control-plane mailer or shared logging.
2. Reduce credential-in-email patterns (SEC-3).
3. Chatwoot mail end-to-end test in staging.

### Overall email system score: **6/10**

| Dimension | Score | Reason |
|-----------|------:|--------|
| Reliability | 6/10 | Control-plane solid; POS env gap; silent skips |
| Security | 5/10 | Invite URL leak, plaintext invite tokens, credentials in mail |
| Observability | 6/10 | `email_logs` + webhook good for API only |
| Completeness | 7/10 | Most flows implemented; POS/Chatwoot wiring weaker |
| Branding | 5/10 | Finance templates still Bigcapital |
| **Overall** | **6/10** | Ship-blockers are POS env + invite security + branding |

---

## SECTION 12 — FILE INDEX

| File | Role | Status |
|------|------|--------|
| `apps/api/src/mail/mailer.ts` | Transport selection, `sendMail`, logging hook | Active |
| `apps/api/src/mail/resend-api.ts` | Resend REST sender | Active |
| `apps/api/src/mail/send.ts` | Template-specific send functions | Active |
| `apps/api/src/mail/email-log.ts` | DB logging + webhook updates | Active |
| `apps/api/src/mail/provider-message-id.ts` | Webhook ID normalization | Active |
| `apps/api/src/mail/templates/*.ts` | HTML renderers | Active |
| `apps/api/src/routes/webhooks/resend.ts` | Delivery webhook | Active |
| `apps/api/src/routes/email-logs.ts` | Admin read API | Active |
| `apps/api/src/services/auth/password-reset.ts` | Forgot/reset + emails | Active |
| `apps/api/src/services/invites/owner-invite-delivery.ts` | Invite send/queue | Active |
| `apps/api/src/jobs/owner-invite-mail-queue.ts` | BullMQ invite jobs | Active |
| `apps/api/src/routes/internal.ts` | Post-provision welcome mail | Active |
| `apps/api/src/license-expire-followup.ts` | Expired/expiring orchestration | Active |
| `apps/api/src/jobs/license-expiry-milestone.ts` | Milestone send + dedup | Active |
| `apps/api/src/app/create-control-plane-app.ts` | `initEmailLogging(db)` | Active |
| `infra/worker-service/src/provision-runtime.ts` | POS welcome email on provision | Active (no logging) |
| `infra/worker-service/domain/provisioning/tenant-env.ts` | Copies `MAIL_*` to tenants | Active |
| `packages/config/src/index.ts` | `mailConfig`, `isMailConfigured` | Active |
| `packages/db/src/schema.ts` | `email_logs`, owner token columns | Active |
| `packages/db/drizzle/0043_email_logs.sql` | Migration | Active |
| `packages/platform-worker-shared/src/index.ts` | Re-exports `sendPosWelcomeEmail` | Active |
| `services/stockix-finance/.../Mail/Mail.module.ts` | Tenant SMTP transport | Active |
| `services/stockix-finance/.../common/config/mail.ts` | Nest mail config | Active |
| `services/stockix-finance/.../static/mail/*.html` | Auth/invite templates | **Branding debt** |
| `services/stockix-finance/.../Mail/mail-queue.constants.ts` | Retry policy | Active |
| `services/posnew/.../workers/platformWorker.js` | Resend jobs | Active (env gap) |
| `services/posnew/.../config/config.js` | `RESEND_*` config | Active |
| `services/chatlive/config/initializers/mailer.rb` | ActionMailer SMTP | Active |
| `infra/prod/docker-compose.yml` | `MAIL_*`, Chatwoot SMTP mapping | Active |
| `apps/api/tests/*email*.test.ts` | Unit/integration tests | Pass |
| `apps/api/tests/resend-webhook.test.ts` | Webhook tests | Pass |
| `apps/api/src/dev/test-email.ts` | Dev send helper | Dev only |

---

## APPENDIX — Commands executed (audit trail)

Phases 1–9 were executed via repository search and file reads on 2026-05-27. Key verifications:

- `grep` for send paths, `initEmailLogging`, `RESEND`, `Bigcapital`, `inviteUrl`
- Read complete files: `mailer.ts`, `send.ts`, `resend-api.ts`, `email-log.ts`, `password-reset.ts`, `owner-invite-delivery.ts`, `resend.ts` webhook, Finance `Mail.module.ts`, POS `platformWorker.js`, Chatwoot `mailer.rb`
- Env presence: `infra/prod/.env`, `.env`, `.env.example` (values redacted in this document)
- Tests: `pnpm test` in `apps/api` for 7 email-related files — **all passed**
- Deleted prior docs: `docs/email.md`, `docs/missingemail2.md` (per audit instructions). `docs/SAAS_AUDIT_EMAIL.md` and `docs/notification.md` were **not present** in the repo.

**No application code or configuration was modified** except removal of superseded audit markdown files and creation of this document.
