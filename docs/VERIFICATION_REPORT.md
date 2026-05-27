# Production Verification Report

**Date:** 2026-05-26 (updated 2026-05-27 for scale-first deploy)  
**Based on:** 4 fix prompts (Critical, High, Medium, Low) + scale-first hardening  
**Mode:** Read-only audit (commands run; no application code modified)

---

## Scale-first update (2026-05-27)

| Item | Status |
|------|--------|
| `api` × 2 + `api-bullmq` × 1 in prod compose | Implemented |
| `GET /ready` requires Redis when `CONTROL_PLANE_REDIS_URL` set | Implemented |
| Rate limits fail closed in production when Redis configured | Implemented |
| `license-rate-limit.test.ts` + CI license loop 5× | Implemented |
| `scripts/prod-scale-smoke.sh` | Added |
| Secret rotation on prod host | **Operator** — see [SECRET_ROTATION_RUNBOOK.md](./SECRET_ROTATION_RUNBOOK.md) |

---

## Final Score: 86/100 (pre-scale); ~90/100 after scale hardening

**Passed everything:** NO (ops secret rotation pending on prod host)  
**Production deploy clearance:** NOT CLEARED until secret rotation + prod smoke on EC2

---

## CRITICAL Checks (7 total)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| C1 | PMS CORS no wildcard | ✅ | `services/pms/src/index.ts`: no `origin: '*'`; reads `CORS_ALLOWED_ORIGINS`; throws if empty (lines 28–31). Present in `.env`, `.env.example`, `infra/prod/.env`. PMS `tsc`: **0 errors**. |
| C2 | Finance WS CORS no wildcard | ✅ | `Socket.gateway.ts`: dynamic `origin` callback; no `origin: '*'`. `SOCKET_ALLOWED_ORIGINS` wired in `infra/worker-service/domain/provisioning/tenant-env.ts`. **Residual:** fallback `'http://localhost:3000'` when env unset (line 15). Finance `tsc`: **0 errors**. |
| C3 | API CORS localhost gated by NODE_ENV | ✅ | `apps/api/src/index.ts` lines 659–667: `devOrigins` only when `apiConfig.nodeEnv !== "production"`. **Residual:** invite URL uses `dashboardUrl ?? "http://localhost:3000"` (line 2315). |
| C4 | API TypeScript 0 errors | ✅ | `npx tsc --noEmit` in `apps/api`: **0** `error TS` lines. |
| C5 | Worker TypeScript 0 errors | ✅ | `npx tsc --noEmit` in `infra/worker-service`: **0** errors. |
| C6 | CI has typecheck + tests | ✅ | `.github/workflows/deploy.yml`: API/Worker/Dashboard/Packages/PMS `tsc`; API/POS/Finance tests; `continue-on-error: false` on tests; `deploy` `needs: quality`. |
| C7 | 0 critical + 0 high vulns | ✅ | `pnpm audit`: **2 moderate**, **0 critical**, **0 high**. Root `turbo`: `^2.9.14`. |

---

## HIGH Checks (8 total)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| H1 | CORS env vars set in all services | ✅ | `CORS_ALLOWED_ORIGINS` in root `.env` and `infra/prod/.env`. POS: `buildPosCorsOrigins()` + `CORS_ORIGINS` in `infra/worker-service/src/module-stacks.ts` and `infra/pos-tenant-stack/docker-compose.yml`. |
| H2 | All API tests pass (0 failures) | ✅ | Final run: **46 files, 231 passed, 0 failed** (15.9s). **Note:** One earlier run had **3 failures** in `license-single-active.test.ts` (flaky/DB-dependent). |
| H3 | console.log replaced with logger | ✅ | `apps/api/src/lib/logger.ts` exists; **0** `console.log`/`console.debug` in `apps/api/src/**/*.ts`; **0** in `infra/worker-service/src/**/*.ts`. Logger usage in API: **38** `logger.(info|error|warn|debug)` matches across 4 files. Worker: `infra/worker-service/src/lib/logger.ts` exists. |
| H4 | Sentry/error monitoring | ✅ | `@sentry/node` in `apps/api/package.json`; `Sentry.init` when `SENTRY_DSN` set (index.ts ~151–156); `captureException` in error handlers; `SENTRY_DSN=` in `.env.example`. |
| H5 | Docker memory + CPU limits | ✅ | `infra/prod/docker-compose.yml`: `mem_limit`/`cpus` on **traefik** (128m/0.25), **postgres** (1g/0.5), **api** (512m/0.5), **worker** (1g/1.0), **dashboard** (256m/0.25). `infra/tenant-stack/docker-compose.yml`: limits on services. **POS tenant stack:** no `mem_limit`/`cpus` in compose (only `CORS_ORIGINS`). |
| H6 | Postgres pool configured | ⚠️ | `packages/db/src/index.ts`: `max`, `idle_timeout`, `connect_timeout`, `max_lifetime` from `DB_POOL_*` env. Documented in `.env.example` (`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_SECONDS`, etc.). **Not present in `infra/prod/.env`** (uses code defaults). DB `tsc`: **0 errors**. |
| H7 | Global rate limiting | ✅ | `apps/api/src/middleware/global-rate-limit.ts`: 100/min global, 20/15min on `/auth/*`; skips `/health` and `/internal/jobs*`. Applied at index.ts line 684. |
| H8 | Zod validation expanded | ✅ | No `zValidator` (Hono helper); widespread `z.object` + `.parse()` / `.safeParse()` (e.g. `provisionBody` on `POST /tenants` line 3387). **17+ API source files** use Zod parsing. |

---

## MEDIUM Checks (7 total)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| M1 | Global 404 handler | ⚠️ | `app.notFound` at index.ts:5856 returns JSON `{ success: false, error: "Not found", ... }`. **Live test:** `GET /this-route-does-not-exist` returned `{"error":"unauthorized"}` (401) — platform auth middleware runs before unmatched routes, so public 404 JSON is not reachable without credentials. |
| M2 | DEFAULT_LICENSE_TERM_DAYS set | ✅ | `.env`: `365`; `infra/prod/.env`: `365`; `.env.example`: `365`; `packages/config` `licenseConfig.defaultTermDays`; API `license-constants.ts`. |
| M3 | No ngrok URLs | ⚠️ | No `ngrok.io` URLs in production TS. **Remaining:** `services/stockix-finance/e2e/_utils.ts` header `ngrok-skip-browser-warning` (e2e only). **`WEBHOOK_BASE_URL` not in root `.env.example`** (Finance uses `STRIPE_PAYMENT_REDIRECT_URL` in finance `.env.example` instead). |
| M4 | SMTP mail documented | ✅ | Header comment in `apps/api/src/mail/send.ts` (Modes 1–2, SMTP via Resend). `infra/prod/.env` comment: “Mail: using SMTP via Resend (not SDK)”. |
| M5 | POS + Finance tests in CI | ⚠️ | CI: `npm test` (pos-backend) and `pnpm test` (finance server) in `deploy.yml`. Finance local: **38/38 passed**. **POS local:** not completed within 180s+ (hung/no output in this audit). |
| M6 | PMS queries paginated | ⚠️ | `services/pms/src/routes/reports.ts`: `parsePagination`, `.limit()`, `.offset()`, `meta.hasMore` on occupancy/revenue/guests. **Gaps:** occupancy still does full `db.select()` on `pmsRooms` without limit; **many other PMS routes** (bookings, guests, channels, etc.) still use unbounded `.select()`. |
| M7 | METRICS_ENDPOINT documented | ✅ | `.env.example` and `infra/prod/.env` (`METRICS_ENDPOINT=` with Prometheus comment). `emitMetric` in `apps/api/src/index.ts`. |

---

## LOW Checks (4 total)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| L1 | Localhost fallbacks removed | ✅ | Proxies use `requireEnv()` (`pos-proxy.ts`, `pms-proxy.ts`, proxy HTTP routes, `finance-license.client.ts`). Localhost only appears in **error message examples**, not as silent runtime defaults. |
| L2 | Bundle size in CI | ✅ | `deploy.yml`: `pnpm --filter dashboard build` + `du -sk apps/dashboard/.next/static` with 10MB warning. **Local:** `.next/static` not built during audit (no size measured). |
| L3 | Branch protection documented | ✅ | `README.md` § Branch Protection (lines 264–280): required reviews, status checks, setup path. |
| L4 | GPL compliance checked | ✅ | `license-report.txt` exists; **0** GPL/LGPL/AGPL matches; `license-report.txt` in `.gitignore`; `pnpm license:scan` script in root `package.json`. |

---

## TypeScript Summary

| Service | Errors | Status |
|---------|--------|--------|
| apps/api | 0 | ✅ |
| apps/dashboard | 0 | ✅ |
| infra/worker-service | 0 | ✅ |
| packages/db | 0 | ✅ |
| packages/auth | 0 | ✅ |
| packages/config | 0 | ✅ |
| services/pms | 0 | ✅ |
| services/stockix-finance/server | 0 | ✅ |

---

## Test Summary

| Service | Passed | Failed | Status |
|---------|--------|--------|--------|
| apps/api | 231 | 0 | ✅ (final run; 1 earlier run had 3 failures) |
| pos-backend | — | — | ⚠️ Not completed locally in audit window |
| stockix-finance/server | 38 | 0 | ✅ |

---

## Security Summary

| Check | Status | Evidence |
|-------|--------|----------|
| No hardcoded secrets in app source | ✅ | No `re_*` API keys / `ghp_` in `apps/**/*.ts`; `sk_live_` only as prefix constant/pattern in api-keys code |
| No raw SQL concat | ✅ | No `"SELECT...${` / `'SELECT...${` in `apps/api/src` |
| Internal routes protected | ✅ | `/internal/jobs*` requires `WORKER_SECRET` Bearer (index.ts ~734–740) |
| No eval() usage | ✅ | No `\beval(` in `apps/api/src` |
| HttpOnly cookies | ✅ | `HttpOnly` on session cookie in `routes/auth/index.ts` |
| 0 critical/high vulns | ✅ | `pnpm audit`: 2 moderate only |

---

## Live Endpoint Verification

Stack was **running** during audit (`pnpm dev` or equivalent).

| Endpoint | Result |
|----------|--------|
| `GET /health` | ✅ `{"status":"ok","mail":{...}}` |
| `GET /unknown-route` | ❌ `{"error":"unauthorized"}` (401), not 404 JSON |
| CORS `Origin: https://evil.com` | ✅ No `Access-Control-Allow-Origin` for evil.com |
| CORS `Origin: http://localhost:3000` | ✅ `Access-Control-Allow-Origin: http://localhost:3000` |
| Dashboard `localhost:3000` | Not tested in this audit |

---

## Still Failing / Gaps (fix before deploy)

| Item | Severity | What is wrong |
|------|----------|---------------|
| Public 404 returns 401 | MEDIUM | `app.notFound` exists but auth middleware blocks unauthenticated unknown paths |
| PMS pagination incomplete | MEDIUM | Only `reports.ts` paginated; list routes still unbounded |
| POS tests not verified locally | MEDIUM | `npm test` did not finish in audit; CI step exists but unconfirmed here |
| `WEBHOOK_BASE_URL` missing from root `.env.example` | MEDIUM | Documented in prompt; not added (Finance uses `STRIPE_PAYMENT_REDIRECT_URL`) |
| `DB_POOL_*` not in `infra/prod/.env` | HIGH | Pool uses code defaults in production |
| POS compose no memory limits | HIGH | `infra/pos-tenant-stack/docker-compose.yml` has no `mem_limit`/`cpus` |
| Finance Socket localhost fallback | CRITICAL (residual) | `Socket.gateway.ts` defaults to `http://localhost:3000` if env missing |
| `.env` in git history | CRITICAL (ops) | `git log -- .env` shows commits; rotate secrets if ever exposed |
| API test flakiness | HIGH | One run: 3 failures in `license-single-active.test.ts` |

---

## Passed Everything: NO

Blocking or high-risk gaps remain (404 behavior, incomplete M6 scope, unverified POS tests, prod env pool vars, git secret history).

---

## Production Deploy Clearance

- [x] All CRITICAL code fixes: ✅ (with noted residuals)
- [ ] All HIGH: ⚠️ (H6 prod env, POS limits, test flake)
- [x] TypeScript: 0 errors everywhere
- [x] Tests: 0 failures on **final** API + Finance runs
- [x] Audit: 0 critical, 0 high
- [x] CORS: no wildcards in production gateways
- [ ] Secrets: rotate if `.env` was ever in git (**required** — history exists)

**Status: NOT CLEARED**

Recommend: (1) exempt unknown routes from platform auth or run 404 before auth, (2) add `DB_POOL_*` to `infra/prod/.env`, (3) confirm POS CI green on `main`, (4) rotate secrets per README, (5) enable GitHub branch protection manually.

---

## Audit Commands Reference

Verification performed via repo grep, file reads, and local commands on Windows (PowerShell), including:

- `npx tsc --noEmit` across 8 packages (all 0 errors)
- `pnpm test` in `apps/api` (231 passed final)
- `pnpm test` in `services/stockix-finance/packages/server` (38 passed)
- `pnpm audit` (2 moderate)
- `pnpm license:scan` / `license-report.txt` (no GPL family)
- Live `curl`/`Invoke-WebRequest` against `localhost:4000`
