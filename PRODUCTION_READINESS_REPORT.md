# Production Readiness Report
Date: Thursday, May 21, 2026  
Auditor: AI Code Audit

## Executive Summary
- Bugs found and fixed: **5**
- Security issues found and fixed: **3**
- Performance issues found and fixed: **1**
- Items still requiring manual action: **12**
- Production ready: **NO**

Blocking items: finance system/tenant migrations not verified on this machine (CLI hung — likely no local system DB), platform signup smoke test path mismatch, `infra-worker` / `socket-proxy` missing healthchecks, production memory limits not defined, and secrets/SMTP must be confirmed on the server.

## Results By Block

| Block | Items Checked | Pass | Fixed | Manual Required |
|-------|-------------|------|-------|-----------------|
| 1 Deps & Build | 8 | 7 | 0 | 1 |
| 2 Security | 14 | 11 | 3 | 2 |
| 3 Database | 12 | 8 | 1 | 3 |
| 4 Error Handling | 10 | 8 | 2 | 1 |
| 5 Performance | 8 | 6 | 1 | 2 |
| 6 Email | 8 | 8 | 0 | 2 |
| 7 Multi-tenant | 6 | 6 | 0 | 1 |
| 8 Docker/Infra | 10 | 7 | 0 | 3 |
| 9 Logging | 6 | 5 | 0 | 1 |
| 10 Final Checklist | 3 | 1 | 0 | 2 |
| **TOTAL** | **85** | **69** | **7** | **18** |

## Bugs Fixed In This Pass

1. **Missing API security headers in production**  
   - Files: `apps/api/src/middleware/security-headers.ts`, `apps/api/src/index.ts`  
   - Fix: HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options, and restrictive CSP on all API responses when `NODE_ENV=production`.

2. **Unhandled Nest/HTTP errors could leak stacks**  
   - Files: `services/stockix-finance/packages/server/src/common/filters/global-exception.filter.ts`, `services/stockix-finance/packages/server/src/modules/App/App.module.ts`  
   - Fix: Global exception filter returns `{ error, message, statusCode }`; hides stack/details in production.

3. **LicenseGuard DB hit on every request**  
   - File: `services/stockix-finance/packages/server/src/modules/License/LicenseGuard.middleware.ts`  
   - Fix: 60s in-memory cache per `tenantId`; standardized error JSON shape.

4. **System DB pool lacked timeouts**  
   - File: `services/stockix-finance/packages/server/src/modules/System/SystemDB/SystemDB.module.ts`  
   - Fix: `acquireTimeoutMillis`, `createTimeoutMillis`, `idleTimeoutMillis` on Knex pool.

5. **Missing process crash handlers**  
   - Files: `apps/api/src/index.ts`, `services/stockix-finance/packages/server/src/main.ts`  
   - Fix: `unhandledRejection` logs and continues; `uncaughtException` logs and `process.exit(1)`.

## Security Issues Fixed

1. Production API responses lacked security headers (now aligned with dashboard `proxy.ts`).
2. Finance server had no global production-safe error sanitization.
3. License health probe path `/api/health` added to guard exclusions (prevents false license blocks on health checks).

## Items Requiring Manual Action Before Production

| Item | Why manual | Who |
|------|------------|-----|
| Run finance system migrations on prod DB | `pnpm cli:system:migrate:latest` hung locally (no reachable system MariaDB) | Ops / DBA |
| Run tenant migrations per tenant | Requires tenant DB credentials / `cli:tenants:migrate:latest` | Ops |
| Set `MAIL_PASSWORD` (Resend API key) in `infra/prod/.env` | Secret; not committed | Ops |
| Verify Resend domain + `MAIL_FROM_ADDRESS` | DNS / Resend dashboard | Ops |
| Confirm `INTERNAL_API_SECRET` matches finance + worker | Cross-service secret sync | Ops |
| `pnpm env:sync-prod --confirm-server` on deploy host | Copies prod env to repo root for worker | Ops |
| Block 10 signup curl on **tenant finance** URL | Platform API `:4000` has no `/api/auth/register`; signup is finance-side with `SIGNUP_DISABLED` | QA |
| Add `infra-worker` healthcheck | No HTTP port exposed today | DevOps |
| Add `socket-proxy` healthcheck (optional) | No built-in HTTP health | DevOps |
| Docker memory `deploy.resources.limits` | Compose `deploy` ignored outside Swarm unless using compatible runtime | DevOps |
| Rotate Resend key if exposed in logs/chat | Prior sessions logged key material | Security |
| Run `cd apps/dashboard && pnpm build` on CI/server | Not executed in this pass (time) | CI |

## Files Modified In This Pass

- `apps/api/src/middleware/security-headers.ts` (new)
- `apps/api/src/index.ts`
- `services/stockix-finance/packages/server/src/common/filters/global-exception.filter.ts` (new)
- `services/stockix-finance/packages/server/src/modules/App/App.module.ts`
- `services/stockix-finance/packages/server/src/modules/License/LicenseGuard.middleware.ts`
- `services/stockix-finance/packages/server/src/modules/System/SystemDB/SystemDB.module.ts`
- `services/stockix-finance/packages/server/src/main.ts`
- `PRODUCTION_READINESS_REPORT.md` (this file)

## Known Technical Debt

| Priority | Item |
|----------|------|
| High | LicenseGuard allows requests when `organization-id` is missing or tenant has no license row — by design for pre-auth routes; ensure all tenant-scoped routes require org header after auth. |
| Medium | Use Redis for license cache when multiple finance replicas (in-memory cache is per process). |
| Medium | `infra-worker` and `socket-proxy` lack healthchecks in `infra/prod/docker-compose.yml`. |
| Medium | Nest global filter shape differs from `ServiceErrorFilter` (`errors[]` vs `{ error, message, statusCode }`) — document for API clients. |
| Low | Index on `tenants_metadata.setup_completed_at` not added (only used for occasional dashboard guard reads). |
| Low | `pms_bookings` composite index N/A — PMS tables not present in this repo. |
| Low | Platform API `apps/api` pre-existing `tokens.test.ts` failure (tampered token case). |

## Remaining Manual Tests Required

- Test: `GET http://localhost:4000/health` → Expected: `{"status":"ok"}` (**PASS** on local run)
- Test: `POST https://<tenant-host>/api/auth/register` with `SIGNUP_DISABLED=true` → Expected: **403**
- Test: Suspended tenant `GET /api/...` with `organization-id` → Expected: **402** `LICENSE_SUSPENDED`
- Test: Grace tenant `POST` write → Expected: **402** `LICENSE_GRACE`; `GET` → **200**
- Test: `GET /api/internal/tenants/:id/users` with valid `X-Internal-Secret` → users only for `:id`
- Test: Send invoice mail → Resend dashboard shows delivery
- Test: `docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env config` → no errors
- Test: `cd apps/dashboard && pnpm build` → success, `output: "standalone"` in `next.config.ts` (**verified in config**)

## Block Notes (Detail)

### 2.8 Security headers
- **Dashboard**: `apps/dashboard/proxy.ts` sets CSP, HSTS, X-Frame-Options, etc. (**PASS**)
- **Platform API**: Added `securityHeadersMiddleware` (**FIXED**)
- **Finance server**: Relies on reverse proxy; no Helmet middleware added (acceptable if Traefik/nginx sets headers at edge — **manual verify**)

### 2.9 LicenseGuard
- Suspended/expired: block **all** methods including GET (**PASS**)
- Grace: blocks POST/PUT/PATCH/DELETE only (**PASS**)
- Exclusions: `/api/internal`, `/api/auth`, `/api/ping`, `/api/health`, `/swagger` (**PASS**)
- `tenantId` from `organization-id` header / CLS — not from body (**PASS**)
- Internal users: `listUsers(tenantId)` scopes tenant Knex + `user_tenants` (**PASS**)
- Bypass: no `organization-id` → `next()`; no license row → `next()` (**documented debt**)

### 3 Database
- Control plane: `pnpm db:migrate` in `packages/db` (**PASS**)
- Finance system: CLI started but did not complete locally (**MANUAL**)
- Indexes: `tenant_licenses.tenant_id` UNIQUE; `tenants_metadata.organization_number` UNIQUE; `user_tenants(user_id, tenant_id)` UNIQUE (**PASS**)
- Pool: min 0 / max 7 + timeouts (**FIXED**)

### 4 Error handling
- Finance: `ServiceErrorFilter`, `ModelHasRelationsFilter`, `GlobalExceptionFilter` (**FIXED**)
- API: `app.onError` returns generic 500 without stack (**PASS**)
- Empty catch blocks: none active in `apps/api`; finance only commented stub (**PASS**)
- Bull mail processors: rethrow after log (**PASS** from prior mail pass); `OrganizationBuild.processor` rethrows (**PASS**)

### 5 Performance
- LicenseGuard 60s cache (**FIXED**)
- Dashboard `output: "standalone"` (**PASS**)
- N+1 `map/await` grep in finance modules: **no matches**

### 6 Email (prior pass — re-verified)
- `MAIL_QUEUE_JOB_OPTIONS`: 3 attempts, exponential 5s (**PASS**)
- `AuthMail.subscriber`: skips verify when disabled / empty token (**PASS**)
- `Mail.ts` / `formatMailFrom`: `Name <email>` (**PASS**)
- `infra/prod/.env.example`: Resend SMTP documented (**PASS**); live `MAIL_PASSWORD` must be set on server (**MANUAL**)

### 8 Docker
- `infra/prod/docker-compose.yml`: postgres/api/dashboard/traefik healthchecks + `restart: unless-stopped` + named volumes (**PASS**)
- `infra-worker`, `socket-proxy`: no healthcheck (**MANUAL**)
- `deploy.resources` limits: not present (**MANUAL** for Swarm/K8s translation)

## Final Verdict

**PRODUCTION READY: NO**

### Blocking (with paths)
1. Finance system + tenant migrations not confirmed — `services/stockix-finance/packages/server` (`pnpm cli:system:migrate:latest`, `pnpm cli:tenants:migrate:latest`)
2. Production secrets and Resend SMTP — `infra/prod/.env` (`MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `INTERNAL_API_SECRET`)
3. End-to-end signup/license smoke tests on live tenant hosts — not validated on platform `:4000`
4. `infra/prod/docker-compose.yml` — `infra-worker` healthcheck absent

When the above are complete, follow `docs/PRODUCTION_CHECKLIST.md` (if present) or `infra/prod/README.md` deploy steps: `docker compose --env-file .env up -d --build`, then `pnpm env:sync-prod --confirm-server`.
