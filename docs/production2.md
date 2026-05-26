# Production Readiness Audit

**Date:** Tuesday, May 26, 2026  
**Mode:** Read-only scan (commands + codebase grep; no source edits)  
**Workspace:** `c:\Users\Jad\Desktop\stokcix\stockixnew`  
**Scoring:** 85 binary checks → **62 pass / 18 fail / 5 partial** → **Overall Score: 72/100**

---

## Overall Score: 72/100

Production-oriented config (`infra/prod/.env`) is largely correct (HTTPS, real domain, external DB, strong secrets, S3, SMTP mail). Blockers are concentrated in **CORS hardening**, **CI/deploy gates**, **TypeScript compile errors** in API/worker, **dependency vulnerabilities**, and **observability gaps**.

---

## 1. Environment & Configuration

| Check | Status | Issue |
|-------|--------|-------|
| Root `.env` exists | ✅ | 233 lines, 159 `A-Z` vars |
| Keys in `.env.example` present in `.env` | ⚠️ | `DEFAULT_LICENSE_TERM_DAYS` missing from root `.env` |
| `infra/prod/.env` exists | ✅ | 89 vars |
| No localhost in prod env (non-comment) | ✅ | Zero matches |
| Secrets ≥32 chars (root) | ✅ | All 7 checked secrets 64–128 chars |
| Secrets ≥32 chars (prod) | ✅ | SESSION, AUTH_TOKEN, WORKER verified |
| `PUBLIC_BASE_URL_SCHEME=https` (prod) | ✅ | |
| `PROVISION_MODULE_GATING=1` (prod) | ✅ | |
| `ROOT_DOMAIN` real domain (prod) | ✅ | `stockix.cloud` |
| `NODE_ENV=production` (prod) | ✅ | |
| External `DATABASE_URL` (prod) | ✅ | Not localhost |
| `MAIL_FROM_ADDRESS` set (prod) | ✅ | `noreply@stockix.cloud` |
| `RESEND_API_KEY` (`re_*`) | ❌ | Missing in root and prod; prod uses `MAIL_HOST=smtp.resend.com` + `MAIL_USERNAME=resend` + `MAIL_PASSWORD` (36 chars) instead |
| Root dev env production-ready | ❌ | `http`, `localhost`, `development` (expected for local dev) |

**Empty vars in root `.env` (sample):** `OWNER_ID`, `WORKER_JOB_ID`, `METRICS_*`, `REDIS_PASSWORD`, `CF_DNS_API_TOKEN`, Chatwoot/Gemini/PostHog keys — mostly optional integrations.

**Local health (untestable on server):** `GET http://localhost:4000/health` → **200** `{"status":"ok","mail":{"configured":true,"fromAddressSet":true}}`.

---

## 2. Localhost References In Code

| File | Line | Value | Severity |
|------|------|-------|----------|
| `apps/api/src/index.ts` | 642–643 | `http://localhost:3000`, `http://127.0.0.1:3000` in CORS `allowed` | **HIGH** (always merged, not gated by `NODE_ENV`) |
| `apps/api/src/index.ts` | 2304, `services/.../invites.ts` | Invite URL fallback `http://localhost:3000` | MEDIUM |
| `apps/api/src/routes/pos-proxy-http.ts`, `pos-proxy.ts` | 131–132, 2 | `POS_PLATFORM_BASE_URL` / `POS_FRONTEND_URL` localhost defaults | MEDIUM (env override in prod) |
| `apps/api/src/routes/pms-proxy-http.ts`, `pms-proxy.ts` | 26, 1 | `PMS_BASE_URL` default `http://localhost:3003` | MEDIUM |
| `apps/api/src/finance-license.client.ts` | 162 | `STOCKIX_FINANCE_INTERNAL_HOST` default `127.0.0.1` | MEDIUM |
| `apps/dashboard/components/pos-health-alert.tsx` | 41 | Display fallback `http://localhost:8010` | LOW |
| `infra/pos-tenant-stack/docker-compose.yml` | 81 | `NEXT_PUBLIC_POS_API_URL` default `http://localhost:8010` | MEDIUM (compose default only) |
| `infra/prod/docker-compose.yml` | 153, 199, 285, 320 | `127.0.0.1` for Postgres bind + container healthchecks | LOW (intentional ops pattern) |

Most other `localhost` hits are **guarded** by `rootDomain === "localhost"` for local multi-tenant dev.

---

## 3. CORS

| Service | Config | Wildcard? | Issue |
|---------|--------|-----------|-------|
| API (`apps/api/src/index.ts`) | Dynamic origin; subdomain match on `ROOT_DOMAIN`; dev localhost origins **always** in allowlist | NO | Localhost origins not stripped in production |
| Dashboard (`apps/dashboard/proxy.ts`) | CSP `connect-src` includes API origin | NO | OK |
| Finance HTTP | Nest default / app module (no broad `enableCors('*')` found in server `src`) | NO | OK for REST |
| Finance Socket.IO (`Socket.gateway.ts`) | `cors: { origin: '*' }` | **YES** | **HIGH** — any origin can open WebSocket |
| POS (`pos-backend/config/config.js`) | Merged `CORS_ORIGINS` + dev defaults + wildcard subdomain matcher | NO | Dev ports in defaults; production must set `CORS_ORIGINS` |
| PMS (`services/pms/src/index.ts`) | `CORS_ALLOWED_ORIGINS` or fallback `*` | **YES** if unset | **CRITICAL** if `CORS_ALLOWED_ORIGINS` not set in prod |

---

## 4. Authentication & Authorization

| Check | Status | Issue |
|-------|--------|-------|
| Platform routes require secret / session / API key | ✅ | Middleware at `index.ts` ~695–748 |
| Internal jobs use `WORKER_SECRET` (not platform secret) | ✅ | Comment + check at ~713–724 |
| Public routes explicit | ✅ | `/health`, `/auth/*`, `/public/tenant-orgs/*`, license activate/verify |
| JWT expiry configured | ✅ | `@repo/auth` default `8h`; POS `JWT_EXPIRES_IN` default `1d` |
| Sessions `HttpOnly` + `Secure` in prod | ✅ | `routes/auth/index.ts` |
| RBAC on sensitive routes | ✅ | `requiredApiRole`, `platform-roles`, `route-permissions` |
| Finance `LicenseGuardMiddleware` | ✅ | Applied in `App.module.ts` |
| Finance internal routes `InternalSecretGuard` | ✅ | Internal controllers |
| POS `tokenVerification` / `restrictTo` | ✅ | Middlewares present |
| All routes validated with Zod | ❌ | ~29 `zValidator`/`z.object` usages vs **52** `app.get/post/...` route registrations in `index.ts` |

---

## 5. Routing & Redirects

| Check | Status | Issue |
|-------|--------|-------|
| Dashboard edge middleware | ✅ | `apps/dashboard/proxy.ts` (Next 16 pattern; no `middleware.ts`) |
| Security headers on dashboard | ✅ | CSP, HSTS, X-Frame-Options in `proxy.ts` |
| Auth redirect unauthenticated users | ✅ | `(dashboard)/layout.tsx` → `/login` via `/auth/me` |
| `next.config.ts` redirects | ✅ | None required; `output: "standalone"` |
| Traefik TLS + HTTP→HTTPS | ✅ | ACME Cloudflare, `certresolver=cloudflare`, wildcard SAN |
| Finance 401 → login | ✅ | `webapp/src/services/axios.tsx` with `handlingUnauthorized` guard |
| Duplicate 401 handlers | ✅ | Single axios interceptor; `setLogout` used only for explicit logout flows |

---

## 6. Security Headers

| Header | Set? | Value |
|--------|------|-------|
| CSP (API) | ✅ (prod only) | `default-src 'none'; frame-ancestors 'none'; ...` |
| CSP (Dashboard) | ✅ | Config-driven + `connect-src` for API |
| HSTS | ✅ | API + dashboard in production |
| X-Frame-Options | ✅ | `DENY` (API), config (dashboard) |
| Rate limiting (API) | ⚠️ | Auth login/signup only (`routes/auth/index.ts`); no global API limiter |
| Rate limiting (POS) | ✅ | `tieredRateLimit`, `publicRoute`, platform login limit |
| SQL injection (raw string concat) | ✅ | Drizzle ORM; no unsafe raw SQL patterns found in API/db |
| Secrets in logs | ✅ | No `console.log` of password/secret/token/pin in API |

---

## 7. Docker & Infrastructure

| Check | Status | Issue |
|-------|--------|-------|
| Prod services defined | ✅ | traefik, postgres, api, dashboard, worker, mongo, redis, socket-proxy, etc. |
| `restart: unless-stopped` | ✅ | All prod services |
| Healthchecks | ✅ | traefik, postgres, api (`127.0.0.1:4000/health`), dashboard |
| Finance images pre-built | ✅ | `stockix-server`, `stockix-webapp`, `stockix-database-migration`, `stockix-pos-*` present locally |
| Volumes for persistence | ✅ | `postgres_data`, `traefik_letsencrypt`, `traefik_dynamic` |
| TLS/HTTPS via Traefik | ✅ | |
| Memory / CPU limits | ❌ | No `mem_limit`, `cpus`, or `deploy.resources` in prod/tenant compose |
| Tenant stack restart + health | ✅ | `infra/tenant-stack/docker-compose.yml` |
| POS tenant stack | ✅ | Defaults need env at provision time |

---

## 8. Database

| Check | Status | Issue |
|-------|--------|-------|
| Migrations present | ✅ | **51** SQL files; latest `0048_organizations_pos_organization_id.sql` |
| Indexes / uniques in schema | ✅ | **102** `index`/`unique`/`primaryKey` usages |
| Foreign keys | ✅ | **70** `references` in `schema.ts` |
| Connection pool tuning | ❌ | `createDb()` uses default `postgres()` client — no `max`, idle, or timeout options |
| Prod DB not localhost | ✅ | Verified via `infra/prod/.env` |
| Per-tenant DB credentials | ✅ | `buildTenantEnvMap` in worker provision path |
| Drizzle journal | ✅ | `packages/db/drizzle/meta/_journal.json` present |

---

## 9. API Quality

| Check | Status | Issue |
|-------|--------|-------|
| Global error handler | ✅ | `app.onError` → 503 for transient DB, 500 otherwise |
| Zod validation coverage | ❌ | Partial; many handlers use manual parsing |
| Pagination on list endpoints | ⚠️ | Many `.limit(n)` usages; not uniform on all lists |
| Global 404 handler | ❌ | No `app.notFound`; per-route 404 only |
| Idempotency keys | ✅ | `Idempotency-Key` header + `apiIdempotencyKeys` table |
| N+1 in hot paths | ⚠️ | Limited `for await` loops; some report endpoints load full tables (PMS) |
| Input sanitization (XSS) | ⚠️ | No broad `DOMPurify`/sanitize layer in apps |

**Routes:** 52 HTTP method registrations in `index.ts`; structured JSON request logging + optional `METRICS_ENDPOINT`.

---

## 10. Worker & Jobs

| Check | Status | Issue |
|-------|--------|-------|
| Job timeout 45 min | ✅ | `WORKER_JOB_EXECUTION_TIMEOUT_MS` / `PROVISION_MAX_MS` default **2700000** in prod compose |
| Max attempts / retry | ✅ | `maxAttempts` default 5; stale lease reclaim; dead job endpoint |
| Heartbeat | ✅ | 15s interval → `/internal/jobs/:id/heartbeat` |
| Stale job reclaim | ✅ | `worker_stale_lease_reclaimed` logic in API |
| Dead job handling | ✅ | Metrics + audit events `worker.job.dead` |
| Stale container preflight cleanup | ✅ | `provision-runtime.ts` |
| Compose up timeout | ✅ | Env-driven in worker |

---

## 11. Logging & Monitoring

| Check | Status | Issue |
|-------|--------|-------|
| Structured request logging | ✅ | JSON `http_request` lines with `requestId`, latency |
| `console.log` / `console.debug` in API+worker | ❌ | **~43** occurrences (API ~29 across 13 files, worker 14 in `worker.ts`) |
| Health endpoint | ✅ | Local: 200 OK |
| Error monitoring (Sentry, etc.) | ❌ | POS has `sentryDsn` config; platform API has no Sentry integration |
| Prometheus / custom metrics | ⚠️ | Optional `METRICS_ENDPOINT`; `emitMetric` helper; not required in prod `.env` |
| Request correlation ID | ✅ | `x-request-id` |

---

## 12. Email System

| Check | Status | Issue |
|-------|--------|-------|
| Mail provider configured (prod) | ✅ | SMTP Resend (`smtp.resend.com`) + credentials |
| `RESEND_API_KEY` env var | ❌ | Not set; SMTP path used instead |
| Welcome / lifecycle emails wired | ✅ | `mail/send.ts`, license queues, invite mail queue |
| Resend webhook | ✅ | `routes/webhooks/resend.ts` |
| Email failure non-fatal | ✅ | `sendMail` returns result object; queues retry |

---

## 13. TypeScript

| Service | Status | Errors |
|---------|--------|--------|
| apps/api | ❌ | **18** (`tenant-config.ts`, `finance-license.client.ts` rootDir import, Hono type mismatch, RBAC handler return type) |
| apps/dashboard | ✅ | 0 |
| infra/worker-service | ❌ | **15+** (`accounting` module type, `composeProjectName`, `randomBytes`, `verify-pos-integration` types, vitest import in test) |
| packages/db | ✅ | 0 |
| packages/auth | ✅ | 0 |
| packages/config | ✅ | 0 |
| services/pms | ✅ | 0 |
| services/stockix-finance/server | ✅ | 0 |

---

## 14. Tests

| Service | Pass/Fail | Coverage |
|---------|-----------|----------|
| apps/api | ❌ | **227 passed / 4 failed** (46 files); failures include `pos-license-sync.test.ts` timeout |
| pos-backend | ⏭️ | Not run (timeboxed audit) |
| stockix-finance | ⏭️ | Not run |

**Root CI:** `.github/workflows/deploy.yml` deploys on `main` push — **no `tsc` or `pnpm test` step**. `architecture-governance.yml` only runs `lint:boundaries` + `architecture:validate`.

---

## 15. Dependencies

| Check | Status |
|-------|--------|
| `pnpm audit` | ❌ | **35** vulnerabilities: **1 critical**, 10 high, 19 moderate, 5 low |
| Notable | `turbo@2.9.9` (patched ≥2.9.14); multiple `hono` advisory paths |
| GPL in production deps | ⚠️ | Not exhaustively scanned |
| Critical packages (root) | hono, next, react, drizzle-orm, zod present in monorepo |

---

## 16. File Storage & License / Multi-tenancy

| Check | Status | Issue |
|-------|--------|-------|
| S3 / Backblaze (prod) | ✅ | All `S3_*` vars set |
| Upload size limits | ⚠️ | Not centrally documented in API grep; POS has tiered limits |
| Finance `LicenseGuard` | ✅ | Middleware + cache |
| POS `LICENSE_ENFORCEMENT_MODE` | ✅ | Default `enforce` |
| `PROVISION_MODULE_GATING` | ✅ | Prod = `1` |
| PMS tenant scoping | ✅ | Routes use `eq(..., tenantId(c))` |

---

## CRITICAL (blocks production deploy)

- [ ] **PMS CORS falls back to `*`** when `CORS_ALLOWED_ORIGINS` is unset (`services/pms/src/index.ts:30`).
- [ ] **Finance Socket.IO allows `origin: '*'`** (`Socket.gateway.ts:14–16`).
- [ ] **API CORS allowlist always includes `localhost:3000`** even when `ROOT_DOMAIN` is production (`apps/api/src/index.ts:641–643`).
- [ ] **`apps/api` and `infra/worker-service` do not pass `tsc --noEmit`** (18 + 15 errors).
- [ ] **Deploy pipeline does not run typecheck or tests** before `docker compose up` (`.github/workflows/deploy.yml`).
- [ ] **`pnpm audit`: 1 critical + 10 high** vulnerabilities remain.
- [ ] **`.env` existed in git history** (`git log -- .env` shows past commits) — rotate any secrets that were ever committed.

---

## HIGH (fix before launch)

- [ ] Set `CORS_ALLOWED_ORIGINS` for every PMS deployment; remove wildcard fallback in code.
- [ ] Restrict Finance Socket.IO CORS to tenant/dashboard origins.
- [ ] Gate API localhost CORS entries behind `nodeEnv !== 'production'` or remove them.
- [ ] Add CI steps: `pnpm -r exec tsc --noEmit` (or per-package) + `pnpm test` before deploy.
- [ ] Fix 4 failing API tests (including `pos-license-sync` timeout).
- [ ] Replace ~43 `console.log` calls in API/worker with structured logger.
- [ ] Add error monitoring (Sentry or equivalent) for API + worker.
- [ ] Add Docker memory/CPU limits for postgres, api, worker, traefik.
- [ ] Configure Postgres connection pool (`max`, idle timeout) in `packages/db/src/index.ts`.
- [ ] Add global API rate limiting (not only auth routes).
- [ ] Expand Zod validation to all mutating routes.
- [ ] Upgrade `turbo` to ≥2.9.14 and remediate high/critical audit findings.

---

## MEDIUM (fix soon after launch)

- [ ] Add global 404 handler on API (`app.notFound`).
- [ ] Document/set `DEFAULT_LICENSE_TERM_DAYS` in root `.env`.
- [ ] Remove hardcoded ngrok URL in `StripePaymentService.ts` if still used.
- [ ] Add `RESEND_API_KEY` or document SMTP-only mail path explicitly in prod runbooks.
- [ ] Run POS and Finance test suites in CI.
- [ ] Paginate PMS report queries that `.select()` full tenant tables.
- [ ] Add `METRICS_ENDPOINT` in production for observability.

---

## LOW (backlog)

- [ ] Reduce dev-only localhost fallbacks in proxy modules (clearer env-required failures).
- [ ] Build dashboard `.next` and track bundle size in CI.
- [ ] GPL / license compliance scan on production dependency tree.
- [ ] Branch protection rules (not verifiable from repo alone).

---

## Production Deploy Checklist

### Must do before deploy:

- [ ] All CRITICAL issues resolved
- [ ] `pnpm --filter @repo/db db:migrate` run on production DB
- [ ] Finance/POS images built (`pnpm docker:prebuild` or equivalent)
- [ ] All secrets in `infra/prod/.env` (rotate if `.env` was ever in git)
- [ ] Mail: verify SMTP send (or set `RESEND_API_KEY` + webhook secret)
- [ ] `ROOT_DOMAIN=stockix.cloud` (or your domain)
- [ ] `PUBLIC_BASE_URL_SCHEME=https`
- [ ] `PROVISION_MODULE_GATING=1`
- [ ] `CORS_ALLOWED_ORIGINS` set for PMS; `CORS_ORIGINS` for POS tenants
- [ ] `apps/api` + `infra/worker-service` TypeScript clean
- [ ] API test suite green

### Manual smoke test after deploy:

- [ ] Dashboard loads at `https://[domain]`
- [ ] Login works
- [ ] Create a test tenant
- [ ] Provision completes (Finance + POS)
- [ ] Welcome email received
- [ ] Finance login with temp password
- [ ] POS login with PIN
- [ ] Notification bell shows completion
- [ ] License check works in Finance

---

## Appendix: Command Summary

| Block | Result |
|-------|--------|
| Root `.env` | 233 lines, 159 vars; dev values |
| `infra/prod/.env` | 89 vars; production values; no localhost |
| Secret strength | All 7 secrets OK (root) |
| Migrations | 51 SQL files |
| `console.log` (api+worker) | ~43 |
| API routes (`index.ts`) | 52 registrations |
| Zod usages | ~29 |
| API `tsc` | 18 errors |
| Worker `tsc` | 15+ errors |
| API tests | 227 pass / 4 fail |
| `pnpm audit` | 35 vulns (1 critical) |
| `curl /health` | 200 (local API running) |
| Docker images | stockix-server, webapp, pos-*, migration present |
| Git `.env` history | Commits found (later removed) |

*End of audit.*
