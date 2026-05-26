# Stockix Monorepo — Master Production-Readiness Audit

**Audit date:** 2026-05-26  
**Repository:** `stockixnew` (pnpm 9 + Turborepo 2, Node ≥20.9)  
**Method:** Static analysis of apps, packages, services, infra, CI, schemas, workers, and runtime configs. Code paths cited with file paths; no “looks good” without evidence.  
**Related:** [`build.md`](build.md) (dev loop / Fast Refresh), [`productionready.md`](productionready.md) (prior phase audit), [`docs/VERIFICATION_REPORT.md`](docs/VERIFICATION_REPORT.md).

---

## 1. Executive summary

Stockix is a **multi-tenant SaaS control plane** (Next.js dashboard, Hono API, Postgres, Redis optional, infra worker) that **provisions per-tenant Docker stacks** for Stockix Finance (accounting), POS, and PMS. The product surface is **mature for controlled beta** (licensing, provisioning journals, email lifecycle, module gating) but **not enterprise-ready** without closing P0 security, authorization consistency, operational observability, and maintainability debt.

| Verdict | Statement |
|---------|-----------|
| **Paying customers (general)** | **Not cleared** until P0 list (§50) is done |
| **Controlled beta / single-tenant operators** | **Feasible** on one EC2 + Docker Compose with runbooks |
| **Enterprise / SOC2 / high-trust multi-tenant** | **Blocked** — RBAC gaps, secret hygiene, no staging, weak DR |

**Top 5 production blockers**

1. **Committed secrets** in `services/stockix-finance/scripts/provision-jad-orgs.mjs` (lines 7–9: `SECRET`, `PASSWORD`).
2. **`POST /tenants/:tenantId/impersonate`** does not call `assertTenantInOwnerScope` — scoped support can impersonate out-of-scope tenants (`apps/api/src/index.ts` ~5362).
3. **Resend webhook fail-open** when `RESEND_WEBHOOK_SECRET` unset in production (`apps/api/src/routes/webhooks/resend.ts` ~67–69).
4. **Invalid prod dashboard Compose YAML** — `build.args` nested under `cpus` (`infra/prod/docker-compose.yml` ~252–261).
5. **Worker stale-lease reclaim (5 min)** vs provision timeout (45 min) — duplicate provision risk (`apps/api/src/index.ts` claim + `infra/worker-service/src/worker.ts`).

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CONTROL PLANE (single Postgres)                   │
│  apps/dashboard (:3000) ──BFF/cookies──► apps/api (:4000)             │
│         │                                      │                         │
│         │                              packages/db (Drizzle, 37 tables)  │
│         │                                      │                         │
│         │         POST /internal/jobs/* ◄──────┼── infra/worker-service │
│         │         (WORKER_SECRET)              │    (bundled .runtime)   │
└─────────┼──────────────────────────────────────┼─────────────────────────┘
          │                                      │
          │         docker compose provision       │
          ▼                                      ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ tenant-stack │  │ pos-tenant   │  │ pms-tenant   │
   │ Finance      │  │ Mongo+API+UI │  │ API+UI       │
   │ MySQL+Mongo  │  │ :8010/:3001  │  │ shared PG*   │
   └──────────────┘  └──────────────┘  └──────────────┘
   * PMS data lives on platform Postgres (not per-tenant DB)
```

**Nested / vendored trees:** `services/stockix-finance` (Lerna), `services/posnew` (in workspace), `services/chatlive` (Chatwoot fork), `services/pms` (Hono on platform DB).

---

## 3. Monorepo dependency graph

| Package / app | Depends on | Consumed by |
|---------------|------------|-------------|
| `@repo/config` | zod, dotenv | api, dashboard, worker bundle, pms |
| `@repo/db` | drizzle-orm, postgres | api, worker, pms, dashboard (server routes) |
| `@repo/shared` | — | api, dashboard, worker (structured-logger) |
| `@repo/auth` | jose | api, pms, pos-backend (CJS build) |
| `@repo/ui` | react | dashboard **package.json only — 0 imports** |
| `api` | @repo/*, hono, bullmq | dashboard BFF, worker (source import anti-pattern) |
| `dashboard` | @repo/config, shared, ui | — |
| `infra/worker-service` | @repo/*, apps/api/src (relative imports) | `pnpm dev`, prod compose |
| Finance `packages/shared` | — | **Duplicates** root `@repo/shared` name |

**Cycles / smells:** Worker bundles `apps/api/src/license-expire-followup.ts`, `mail/send.ts` via relative paths (`apps/api/tsup.worker.config.ts`). Finance and root both export `@repo/shared` — **drift risk**.

**Turbo:** `turbo.json` — `build` outputs `.next/**`, `dist/**`, `.runtime/**`; `dev` uncached persistent; `globalDependencies: [".env", ".env.local"]`.

---

## 4. Service interaction map

| From | To | Protocol | Auth |
|------|-----|----------|------|
| Browser | dashboard | HTTPS | Session cookie `stockix-session` |
| dashboard route handlers | api | HTTP + `PLATFORM_API_SECRET` | Bearer |
| Browser | api (some) | CORS + cookie | Session |
| worker | api | HTTP | `WORKER_SECRET` on `/internal/jobs/*` |
| api | POS | HTTP proxy | `POS_PLATFORM_API_KEY` |
| api | PMS | HTTP proxy | `x-stockix-internal-secret` + `x-stockix-tenant-id` |
| worker | Finance tenant | HTTP internal port | `INTERNAL_API_SECRET` |
| worker | Docker | socket-proxy | Unix socket |
| worker | Traefik FS | write YAML | `TRAEFIK_DYNAMIC_DIR` |
| POS offline | api | HTTP | `POST /licenses/activate` (public) |
| Resend | api | POST webhook | Svix HMAC (optional) |

---

## 5. Build pipeline audit

| Stage | Command / config | Risk |
|-------|------------------|------|
| Install | `pnpm install --frozen-lockfile` (CI) | OK |
| Typecheck | api, worker, dashboard, @repo/*, pms (deploy.yml) | OK |
| Test | api vitest, pos npm test, finance server tests | POS path uses `npm` not pnpm |
| Dashboard build | `next build` standalone | `outputFileTracingRoot: repoRoot` |
| API build | `tsup` → `apps/api/dist` | OK |
| Worker build | `tsup.worker.config.ts` → `infra/worker-service/.runtime` | **Hashed chunks**, **committed to git**, `clean: true` |
| Auth | `tsup` → `packages/auth/dist` | Built on every `pnpm dev` |
| Turbo cache | `.env` invalidates builds | Intended |

**CI gaps:** No secret scanning step; no E2E Playwright on control plane; tenant images not built in deploy workflow.

---

## 6. Runtime process audit

**`pnpm dev`** (`scripts/dev-stockix.mjs`): db up → migrate → `@repo/auth build` → `infra:worker:build` → concurrently:

| Process | Watcher | Writes |
|---------|---------|--------|
| api | `tsx watch src/index.ts` | None |
| dashboard | `next dev` (webpack default) | `.next/` |
| worker | `node .runtime/worker.js` | External tenant dirs only |
| pos | nodemon + next dev | `.next/`, logs |
| pms | `tsx watch` | None |
| pms-ui | `next dev` | `.next/` |

**Production** (`infra/prod/docker-compose.yml`): traefik, postgres, redis, api, dashboard, infra-worker, chatwoot (+ deps). **No worker healthcheck.**

---

## 7. Dev vs production behavior differences

| Behavior | Dev | Production |
|----------|-----|------------|
| Env loading | Root `.env` auto via `@repo/config` | `STOCKIX_LOAD_ROOT_ENV=0`, `infra/prod/.env` |
| CORS | localhost:3000/3001 added | `*.ROOT_DOMAIN` + `CORS_ORIGINS` |
| `WORKER_SECRET` | Default `dev-worker-secret` | Must override |
| `LICENSE_SIGNING_SECRET` | Fixed dev string | Required ≥32 chars |
| `FINANCE_LICENSE_SYNC_OPTIONAL` | Can skip sync failures | Must be strict |
| Traefik | Skipped on localhost | Dynamic per-tenant YAML |
| BullMQ | Optional `CONTROL_PLANE_REDIS_URL` | Should be set for scale |
| Rate limits | In-memory Maps | **Not shared across replicas** |
| Idempotency | In-memory + DB | DB only for HTTP keys |
| Signup | Often enabled | `SIGNUP_DISABLED=true` in prod example |

---

## 8. Environment variable audit

**Central parser:** `packages/config/src/index.ts` — zod-style validation, `validateRequiredEnvForProfile` for staging/production (secrets list lines 94–117).

**Required in staging/production:** `DATABASE_URL`, `PLATFORM_API_SECRET`, `WORKER_SECRET`, `SESSION_SECRET`, `DASHBOARD_URL`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY`, `LICENSE_SIGNING_SECRET`.

**Dangerous defaults (development profile only safe):**

| Var | Default | Line ref |
|-----|---------|----------|
| `WORKER_SECRET` | `dev-worker-secret` | ~190 |
| License signing | `local-dev-license-signing-secret-min-32!` | ~345–349 |
| `POS_PLATFORM_BASE_URL` | `http://localhost:8010` | posConfig |
| `PMS_BASE_URL` | `http://localhost:3003` | pmsConfig |

**Unused in API:** `THROTTLE_*` defined in config but global rate limit hardcoded in `middleware/global-rate-limit.ts`.

**Drift:** Root `.env`, `apps/api/.env`, `apps/dashboard/.env`, `services/**/.env` — `pnpm bootstrap:env` mitigates; `pnpm env:sync-prod` for server.

**Dashboard** requires `PLATFORM_API_SECRET`, `PLATFORM_ADMIN_*`, `DATABASE_URL` at runtime (`dashboardConfig`).

---

## 9. Security audit

| Area | Status | Evidence |
|------|--------|----------|
| SQL injection | **Low risk** | Drizzle parameterized queries |
| XSS | **Mostly OK** | React default; `dangerouslySetInnerHTML` in `apps/dashboard/components/ui/chart.tsx` only |
| SSRF | **Medium** | Proxies to configurable POS/PMS/Finance URLs — trust env |
| Path traversal | **Low** | Provision paths use slug validation; worker uses `join` |
| Secrets in repo | **Critical** | `provision-jad-orgs.mjs` |
| Docker socket | **High** | socket-proxy allows POST+BUILD (`infra/prod/docker-compose.yml`) |
| CSRF | **Partial** | Auth POST requires Origin match (`routes/auth/index.ts`) |
| Security headers | **Good** | `middleware/security-headers.ts`, dashboard `proxy.ts` CSP |
| Dependency scan | **Unknown** | Snyk MCP available; not in CI workflow |

---

## 10. Authentication audit

| Mechanism | Implementation | Files |
|-----------|----------------|-------|
| Session | HMAC payload (not JWT) | `services/auth/tokens.ts` |
| MFA | Short-lived MFA token | same |
| API keys | `sk_live_*` + hash | `services/api-keys.ts` |
| Platform secret | Bearer bypass to super_admin | `index.ts` middleware |
| Worker | `WORKER_SECRET` | `/internal/jobs/*` |
| Product token | `@repo/auth` jose | `stockix-product-token.ts` |
| Offline license | HS256 JWT | `license-utils.ts` |

**Issues:** `app.onError` references undefined `message` for `email_logs` check (`index.ts` ~642) — error handler may throw. Login lockout 5 fails / 15 min (`services/auth/login.ts`). Bootstrap login gated by `ALLOW_BOOTSTRAP_LOGIN`.

---

## 11. Authorization / RBAC audit

**Production path:** `requiredApiRole(path, method)` → coarse role ranks (`middleware/rbac.ts`, `permissions/route-permissions.ts`).

**Not wired:** `createRbacMiddleware` + fine-grained `platform_roles.permissions`.

**Scope helpers exist but inconsistently applied:**

| Helper | Used on |
|--------|---------|
| `assertTenantInOwnerScope` | `GET /tenants/:tenantId` (~4789) |
| `assertOrgInSupportScope` | Some org routes (~4334+) |
| **Missing** | `POST /tenants/:tenantId/impersonate` (~5362) — **P0** |

**Public routes (no platform auth):** `/health`, `/auth/*`, `/webhooks/*`, `POST /licenses/activate`, `POST /licenses/verify-offline`, `GET /public/tenant-orgs/:tenantId`.

---

## 12. Multi-tenant isolation audit

| Layer | Finance / POS | PMS | Control plane |
|-------|---------------|-----|---------------|
| Data store | Per-tenant Docker DBs | **Shared Postgres** (`pms_*` tables) | Shared Postgres |
| App enforcement | Tenant compose + ports | `eq(tenantId, …)` in routes | `tenant_id` FKs |
| Network | Traefik host rules | Proxy headers | — |
| Secrets | `tenant_deployments` encrypted | Platform secret | Row-level |

**Gaps:** No Postgres RLS; `tenant_provision_events.tenant_id` no FK; `organizations.slug` globally unique; PMS trusts `x-stockix-tenant-id` from proxy (`services/pms/src/index.ts`).

---

## 13. Queue + worker audit

**Control plane lifecycle jobs:** DB table `tenant_lifecycle_jobs` — claim/heartbeat/complete via API (`index.ts`). Worker polls `POST /internal/jobs/claim` every **1.5s** (`worker.ts`).

**BullMQ (API process):**

| Queue | File | Redis | Retry |
|-------|------|-------|-------|
| `license-expiry-milestones` | `jobs/license-expiry-queue.ts` | `CONTROL_PLANE_REDIS_URL` | Default (weak) |
| `owner-invite-mail` | `jobs/owner-invite-mail-queue.ts` | same | 3 attempts |

**Stale lease:** 5 min reclaim vs 45 min job timeout — **duplicate worker risk (Critical ops)**.

**Provision jobs:** `noRetry: true` on failure → `dead` immediately (`worker.ts`).

**POS queues:** `services/posnew/.../jobQueue.js` — separate Redis per tenant stack.

---

## 14. Email system audit

| Component | Path |
|-----------|------|
| Transport | `mail/mailer.ts` — nodemailer, Resend SMTP |
| Templates | `mail/send.ts`, `mail/templates/*` |
| Idempotency | `Resend-Idempotency-Key` header |
| Logging | `email_logs` table |
| Webhook | `routes/webhooks/resend.ts` |

**Failures:** `status: "skipped", reason: "not_configured"` when mail unset — BullMQ treats as success. License milestone creates in-app notification even if email fails (`jobs/license-expiry-milestone.ts`). Password-changed email uses `Date.now()` in idempotency key — not stable on retry.

---

## 15. Notification system audit

| Feature | Implementation |
|---------|----------------|
| Storage | `owner_notifications` |
| REST | `routes/notifications.ts` |
| SSE | `GET /notifications/stream` — **poll DB every 2.5s** per connection |
| Dashboard proxy | `apps/dashboard/app/api/notifications/stream/route.ts` |

**Risks:** SSE poll loop under many tabs → DB load; no Redis pub/sub; `safeCreateNotification` logs errors only.

---

## 16. Billing/license audit

**No Stripe** on control plane — UI states “no Stripe subscription” (`tenant-profile-form.tsx`).

**Internal model:** `plans`, `licenses`, `license_activations`, `license_history`, offline JWT (`license-http.ts` ~1800 lines).

**Public activation:** `POST /licenses/activate`, `verify-offline` — unauthenticated; crypto validation required.

**DB constraint:** Partial unique `licenses_one_active_per_tenant` (migration `0038`) — may conflict with per-location STXI keys.

**Expiry:** Worker scan 5 min + BullMQ milestones; Finance/POS sync on expiry with swallowed errors (`license-expire-followup.ts`).

---

## 17. Database schema audit

**37 tables** in `packages/db/src/schema.ts` — platform + PMS subdomain.

**Sensitive:** `tenant_deployments` — encrypted credentials, ports, compose names.

**Indexes:** Good on PMS `tenant_id`; gaps on `organizations.tenant_id`, `tenants.owner_id`, booking date ranges (see migration audit).

---

## 18. Migration audit

- **50 journal entries** `packages/db/drizzle/meta/_journal.json`
- **Duplicate prefixes:** `0035_*`, `0038_*` (one file not in journal)
- **Orphan runner:** `scripts/apply-orphan-migrations.ts` — second application path
- **Baseline repair:** `migration-repair-baseline.ts` — marks applied without SQL
- **verify-schema.ts** — incomplete vs production constraints

**Manual SQL** documented in `infra/prod/OPERATIONS.md` (0044–0046) — rollout blocker if skipped.

---

## 19. API audit

- **~5,800+ lines** in `apps/api/src/index.ts` — god file
- **Registered modules:** auth, licenses, tenants, notifications, pos/pms proxies, webhooks, finance users, modules
- **Dead code:** `routes/jobs/index.ts` unmounted; `middleware/auth.ts`, `idempotency.ts` duplicated inline
- **Idempotency:** `api_idempotency_keys` for mutating owner APIs
- **Health:** `GET /health` only — no `/ready` with DB ping
- **Metrics:** optional `METRICS_ENDPOINT`

---

## 20. Frontend audit

| App | Stack | Notes |
|-----|-------|-------|
| dashboard | Next 16 App Router, shadcn local | BFF routes under `app/api/*` |
| pos-frontend2 | Next, `externalDir: true` | Separate dev server |
| pms frontend | Next | Tenant app :3004 |
| Finance webapp | Vite | Not in default `pnpm dev` |

**Issues:** `@repo/ui` unused; large dashboard surface; CSP allows `unsafe-inline`; no control-plane E2E in CI.

---

## 21. Websocket/SSE audit

| Stream | Type | Interval | Leak risk |
|--------|------|----------|-----------|
| Notifications | SSE poll | 2.5s | Connection holds until abort |
| Provision status | SSE in index | poll | Same pattern |
| Finance/POS | Socket.io in product stacks | N/A | Separate |

**No native WebSocket** on control-plane API. Chatwoot has ActionCable (vendored).

---

## 22. File storage audit

| Storage | Location | Notes |
|---------|----------|-------|
| Tenant env | `~/.stockix/tenants` (Win) / `/opt/stockix/tenants` | Encrypted fields |
| Traefik dynamic | `TRAEFIK_DYNAMIC_DIR` | Per-tenant YAML |
| POS uploads | `services/posnew/.../uploads` | nginx rewrite in POS Next |
| S3 | Finance stack env | Per-tenant compose |
| ACME | Traefik volume | Cloudflare DNS |

**No unified object store abstraction** on control plane.

---

## 23. Docker audit

| Stack | Healthchecks | Blocker |
|-------|--------------|---------|
| `infra/prod` | api, postgres, redis, traefik, dashboard | dashboard YAML bug; worker none |
| `infra/dev` | postgres, redis | — |
| `infra/tenant-stack` | DB/redis only | app tier none |
| `infra/pos-tenant-stack` | mongo only | backend none |
| `infra/pms-tenant-stack` | none | — |

**Worker image:** `infra/worker-service/Dockerfile` — no HEALTHCHECK instruction.

**Deploy workflow:** `curl 127.0.0.1:4000/health` — api not published on host port — **false failure** (`.github/workflows/deploy.yml`).

---

## 24. Kubernetes / infra audit

| Exists | Path |
|--------|------|
| Terraform EC2 | `infra/terraform/` — single instance, SG, optional EIP |
| K8s / Helm | **None** |
| Swarm | **None** |

Production model: **Docker Compose on EC2** + Traefik + Cloudflare.

---

## 25. CI/CD audit

| Workflow | Purpose |
|----------|---------|
| `.github/workflows/deploy.yml` | Quality + SSH deploy main |
| `.github/workflows/architecture-governance.yml` | Boundaries + architecture validate |
| Nested pos/finance/chatlive workflows | Product-specific (may not run on monorepo PR) |

**Strengths:** frozen lockfile, typecheck matrix, api tests with env fixtures.

**Gaps:** no secret scan; deploy smoke test wrong; no worker integration test; no dashboard E2E.

---

## 26. Logging audit

| Service | Logger |
|---------|--------|
| api | `@repo/shared/structured-logger` via `lib/logger.ts` |
| worker | same |
| pos | winston-style in observability.js |

**~40 `console.warn/error`** remain in api src (mail, webhooks). Provision logs to `tenant_provision_events`.

---

## 27. Observability audit

| Signal | Status |
|--------|--------|
| Sentry | api (`@sentry/node`); pos optional; **worker none** |
| OpenTelemetry | **None** |
| Structured logs | Partial |
| Request ID | `x-request-id` propagated |
| Metrics | Optional HTTP emit — not required |

---

## 28. Monitoring audit

- No Prometheus/Grafana in repo
- `METRICS_ENDPOINT` + `METRICS_AUTH_TOKEN` optional
- Traefik ping enabled
- **No alerting rules** as code
- License/provision failures often **log-only**

---

## 29. Retry/recovery audit

| Flow | Retry | Gap |
|------|-------|-----|
| Lifecycle jobs (non-provision) | exp backoff, max 5 | OK |
| Provision | noRetry → dead | Manual requeue |
| Stale lease reclaim | 5 min | Too aggressive |
| Owner invite mail | BullMQ 3× | skipped = success |
| Finance bootstrap | 3× 1.5s | in provision adapter |
| Mail inline invite | 2s sleep once | `owner-invite-delivery.ts` |

---

## 30. Error handling audit

- Global `onError` + Sentry (`index.ts`)
- `unhandledRejection` logged; `uncaughtException` exits
- Transient DB → 503
- Many **swallowed** catches in provision cleanup, finance sync, notifications
- Resend webhook returns `{ ok: true }` even if DB update fails

---

## 31. Performance audit

| Bottleneck | Impact |
|------------|--------|
| God API file | Compile + cognitive |
| On-demand Next route compile | Slow first hit |
| SSE DB polling | Connection × QPS |
| Synchronous Docker provision | Minutes per tenant |
| `allocateOrganizationNumber` full table scan | O(n) tenants |
| Unbounded PMS list queries | Memory at scale |
| 3× Next dev servers | Local CPU only |

---

## 32. Memory leak risks

| Risk | Source |
|------|--------|
| In-memory rate limit Maps | grow with IPs |
| SSE `sent` Set per connection | bounded by connection lifetime |
| Global `setInterval` reconcilers | `stuck-reconciler.ts`, `index.ts` ~5812 |
| BullMQ workers per API replica | duplicate workers if scaled horizontally |
| nodemon + multiple watchers | dev only |

---

## 33. Scalability audit

| Dimension | Ceiling (approx) | Limiting factor |
|-----------|------------------|-----------------|
| Control-plane RPS | Low–medium | Single Compose host, in-memory limits |
| Tenants | 10s–100s | Host ports, Docker overhead, manual Traefik files |
| Tenants 1000+ | **Fails** | Port range, disk, worker single-thread poll, no sharding |
| Horizontal API | **Broken** | Rate limits, idempotency memory, duplicate BullMQ consumers |
| Postgres | Medium | Connection pool default 10 (`packages/db`) |

---

## 34. Production deployment risks

1. Dashboard compose parse failure  
2. Deploy health curl false negative  
3. Missing manual migrations (OPERATIONS.md)  
4. `LICENSE_SIGNING_SECRET` mismatch across POS tenants  
5. Stale worker bundle if not rebuilt on deploy  
6. Chatwoot unrouted / no healthcheck  
7. socket-proxy compromise = cluster admin  
8. No staging environment to rehearse

---

## 35. Backup/disaster recovery audit

| Asset | Backup story |
|-------|----------------|
| Platform Postgres | **Manual** — `infra/prod/OPERATIONS.md` mentions backup before SQL; no automated job in compose |
| Per-tenant Finance MySQL/Mongo | **Tenant operator responsibility** |
| Traefik ACME | Volume `traefik_letsencrypt` |
| Tenant env dirs | `stockix_tenants` volume |
| Code | Git |

**RPO/RTO:** Undefined. POS deploy script has daily cron example (`services/posnew/deploy/provision.sh`) — not wired for control plane.

---

## 36. Secrets management audit

| Practice | Status |
|----------|--------|
| `.env` gitignored | Yes |
| `generate-env-secrets.js` | Yes |
| GitHub deploy secrets | SSH only — app secrets on server |
| Committed secrets | **provision-jad-orgs.mjs** |
| Worker bundle in git | **`.runtime/worker.js`** may embed config patterns |
| Rotation runbooks | Partial in OPERATIONS.md |

---

## 37. Third-party integration audit

| Integration | Purpose | Failure mode |
|-------------|---------|--------------|
| Resend (SMTP) | Mail | skipped status |
| Cloudflare | DNS ACME | Token in env |
| Docker | Provision | socket-proxy |
| Chatwoot | Support chat | Partially integrated |
| Sentry | Errors | optional DSN |
| POS Bigcapital | Accounting bridge | outbox without Redis |

---

## 38. Hardcoded values audit

See §16 in [`productionready.md`](productionready.md) and grep evidence:

- **Critical:** `provision-jad-orgs.mjs` SECRET + PASSWORD  
- **Medium:** `dev-worker-secret`, license dev signing string  
- **Localhost fallbacks:** throughout `packages/config`, proxies, invite URLs  
- **Provision defaults:** `admin@localhost`, grace 7 days, max users 999 (`license-constants.ts`)

---

## 39. Duplicate implementations audit

| Duplication | Paths |
|-------------|-------|
| `@repo/shared` | `packages/shared` vs `services/stockix-finance/packages/shared` |
| Auth middleware | `middleware/auth.ts` vs inline `index.ts` |
| Jobs router | `routes/jobs/index.ts` vs `index.ts` internal routes |
| shadcn UI | `apps/dashboard/components/ui` vs unused `packages/ui` |
| Mail in worker | Bundled from `apps/api/src/mail` |
| Env parsing | `@repo/config` vs scattered `process.env` in api |

---

## 40. Technical debt audit

- 5.8k-line `index.ts`  
- Worker ↔ API coupling (`docs/ARCHITECTURE_DEBT_AUDIT.md`)  
- Migration orphan/dual-path system  
- Triple package managers (pnpm 9 root, Lerna finance, pnpm 10 chatlive)  
- Committed `.runtime` artifacts  
- RBAC permission system not enforced on wire

---

## 41. Dead code audit

- `packages/ui` — zero dashboard imports  
- `routes/jobs/index.ts` — unmounted  
- `middleware/auth.ts`, `createRbacMiddleware` path — unused in prod  
- `apps/api/**/.tmp-worker` — orphan bundles  
- Root `*.bak` files per `docs/duplications.md`

---

## 42. Broken feature audit

| Feature | Issue |
|---------|-------|
| Deploy smoke test | Wrong curl target |
| Dashboard prod build args | YAML indentation |
| `app.onError` email_logs branch | Undefined `message` |
| Fine-grained RBAC UI vs API | Permissions not enforced |
| Multi-instance rate limit | Effectively broken |

*Provisioning and license flows are **implemented** but operationally fragile — not “broken” if runbook followed.*

---

## 43. Missing feature audit

- Stripe / payment collection  
- `/ready` probe  
- Staging compose stack  
- OTel tracing  
- Redis rate limits  
- Control-plane E2E  
- Per-tenant automated backup  
- GDPR export/delete APIs  
- SOC2 audit export  
- K8s manifests  
- Secret scanning in CI  
- Worker health endpoint

---

## 44. Production readiness score

**68 / 100** — Deployable for experienced operators; not launch-blind.

---

## 45. Enterprise readiness score

**55 / 100** — Missing audit consistency, DR, staging, horizontal scale, compliance exports.

---

## 46. SaaS maturity score

**70 / 100** — Strong license/provision/product modules; weak billing automation and self-serve scale.

---

## 47. White-label readiness score

**62 / 100** — `tenant_config` branding fields exist; Chatwoot branding envs; Finance/POS theming separate; no unified theme pipeline.

---

## 48. Scalability score

**58 / 100** — Per-tenant Docker scales out; control plane does not.

---

## 49. Security score

**62 / 100** — Good baselines undermined by secret leak, webhook fail-open, impersonate scope gap.

---

## 50. FINAL PRIORITIZED FIX LIST

### P0 — Critical (1–3 days)

| # | Fix | File(s) |
|---|-----|---------|
| 1 | Remove/rotate committed Finance script secrets; purge git history | `services/stockix-finance/scripts/provision-jad-orgs.mjs` |
| 2 | Add `assertTenantInOwnerScope` to **all** `/tenants/:tenantId/*` including impersonate | `apps/api/src/index.ts` |
| 3 | Resend webhook: `return 401` if production and no secret | `routes/webhooks/resend.ts` |
| 4 | Fix dashboard `build.args` indentation under `build:` | `infra/prod/docker-compose.yml` |
| 5 | Fix deploy health check: `docker compose exec api` or Traefik URL | `.github/workflows/deploy.yml` |
| 6 | Increase stale lease > job timeout + fencing token on reclaim | `index.ts` claim handler |
| 7 | Rotate all platform secrets if `.env` ever committed | ops |

### P1 — High (1–2 weeks)

| # | Fix |
|---|-----|
| 8 | Gitignore `infra/worker-service/.runtime/`, `**/.tmp-worker` |
| 9 | Worker + socket-proxy healthchecks; Sentry on worker |
| 10 | Redis-backed global + auth rate limits |
| 11 | `GET /ready` on API (DB + optional Redis) |
| 12 | Restrict `GET /public/tenant-orgs/:id` |
| 13 | Apply `assertTenantInOwnerScope` audit on every tenant route (scripted grep) |
| 14 | Mail `skipped` → failure in BullMQ workers |
| 15 | Milestone notification only after email success or explicit outbox |
| 16 | `DB_POOL_*` in prod env |
| 17 | Complete migration verification + drop orphan duplicate SQL files |

### P2 — Medium (2–4 weeks)

| # | Fix |
|---|-----|
| 18 | Split `index.ts` into domain routers |
| 19 | Extract `packages/platform-worker-shared` — decouple worker from api src |
| 20 | Consolidate `@repo/shared` single package |
| 21 | Wire `createRbacMiddleware` or remove dead permission UI |
| 22 | PMS pagination + composite indexes on bookings |
| 23 | Dashboard Playwright smoke (login, tenant list) |
| 24 | webpack `watchOptions.ignored` (see `build.md`) |
| 25 | Traefik backend health checks for tenant routes |

### P3 — Future

| # | Fix |
|---|-----|
| 26 | Staging environment + compose |
| 27 | OpenTelemetry |
| 28 | K8s/Helm or ECS task definitions |
| 29 | Stripe or billing provider |
| 30 | Automated Postgres backup + restore drill |
| 31 | Secret scanning (gitleaks) in CI |
| 32 | Opt-in POS/PMS in default `pnpm dev` |

---

## Failure mode matrix

### What breaks at 1,000 tenants?

- **Host port exhaustion** (`MAX_TENANT_PORT`, sequential allocation)  
- **Traefik dynamic file churn** — thousands of YAML files  
- **Disk/inode pressure** from Docker layers and volumes  
- **Worker poll + claim** single-thread bottleneck  
- **Postgres** connection limits and table growth (audit log, provision events)  
- **Manual ops** cannot keep pace with provision failures  

### What breaks at 10,000 tenants?

- All of the above **catastrophically**  
- **Organization number allocation** scan (`allocateOrganizationNumber`)  
- **In-memory rate limits** meaningless with many API replicas  
- **No multi-region** story — single EC2 is SPOF  

### What breaks under heavy queue load?

- BullMQ **duplicate consumers** if multiple API instances  
- **Redis memory** unbounded if jobs not trimmed  
- **License milestone TOCTOU** — duplicate notifications  
- **Inline fallback** when Redis down — runs in worker scan loop synchronously  

### What breaks during node restart?

- **In-flight provisions** — stale lease → second worker  
- **SSE clients** disconnect (benign)  
- **BullMQ** jobs stall until API restarts workers  
- **Traefik** brief routing blip  

### What breaks during Redis outage?

- **No BullMQ** — inline license milestones and invites  
- **POS tenant** queues → `no_redis` outbox only  
- **Rate limits** still in-memory per instance (unaffected)  

### What breaks during Resend outage?

- Mail `failed` or transport errors — invites may expose URL in API response  
- License emails log error; **in-app notification may still fire**  
- Webhook delivery updates stop — `email_logs` stale  

### What breaks during DB failover?

- API **503** on transient errors (`isTransientDbError`)  
- **Worker** cannot claim jobs — idle loop  
- **No read replica** routing — full outage  

### What breaks during partial deploy?

- **Stale worker bundle** if only API redeployed  
- **Schema drift** if migrations not run before API  
- **Dashboard** wrong `NEXT_PUBLIC_*` if build args broken  

### What breaks during worker crash?

- Jobs stuck `running` until **5 min stale reclaim**  
- Risk of **duplicate provision** if crash mid-compose  
- License scan stops until worker restarts  

### What breaks on Windows?

- **File watcher noise** — Fast Refresh (see `build.md`)  
- **localhost vs 127.0.0.1** — worker uses `API_HOST=127.0.0.1` (good)  
- **Path separators** in provision scripts — mostly Node `path`  
- **Docker Desktop** performance and bind-mount latency  

### What breaks on Linux?

- **Production target** — best supported  
- **Traefik + host.docker.internal** must exist for tenant routing  
- **Permission** on `/opt/stockix/*` dirs  

### What breaks in Docker Swarm/Kubernetes?

- **Not designed for it today** — Compose labels, bind mounts, socket-proxy  
- Would need: stateful sets for Postgres, shared storage for tenant volumes, job CRD instead of poll worker, ingress instead of file Traefik  

---

## Architecture maturity assessment

| Area | Maturity (1–5) | Note |
|------|----------------|------|
| Domain modeling (license/provision) | 4 | Rich journals and modules |
| Code structure | 2 | God files, coupling |
| Infra as code | 3 | Terraform EC2 + Compose |
| Testing | 3 | API tests good; worker/E2E weak |
| Security ops | 2 | Secret leak, inconsistent enforcement |
| Observability | 2 | Sentry partial only |

---

## Enterprise SaaS readiness assessment

Suitable after **P0+P1** for mid-market **single-region** SaaS with **manual sales/onboarding**. Not ready for **self-serve at scale**, **compliance certifications**, or **multi-region HA** without Phase 2–3 roadmap.

---

## Scalability roadmap

1. **0–100 tenants:** Fix P0, add monitoring, pool tuning  
2. **100–500:** Redis rate limits, worker fencing, split API, metrics  
3. **500+:** Sharded job queue, tenant provisioning workers pool, limit Traefik files via KV store, read replicas  
4. **1000+:** Move tenant stacks to dedicated nodes; control plane on K8s; abandon per-tenant host ports where possible (use reverse proxy + internal networking only)

---

## Production hardening roadmap

| Week | Focus |
|------|-------|
| 1 | P0 security + compose/deploy fixes |
| 2 | Healthchecks, gitignore artifacts, migration verify |
| 3 | Redis limits, ready probe, worker Sentry |
| 4 | Route refactor start, integration tests for claim/lease |

---

## Recommended refactors

1. `packages/provisioning` — shared worker/API license + mail utilities  
2. `apps/api/src/routes/tenants.ts` — extract from index  
3. Single `@repo/shared` — Finance consumes via workspace protocol version pin  
4. Outbox table for email + notifications  
5. Replace SSE poll with LISTEN/NOTIFY or Redis pub/sub  

---

## Long-term architecture improvements

- **Cell-based tenancy** — group tenants per host cell  
- **API gateway** — Kong/Traefik middleware for rate limit + auth  
- **Event bus** (NATS/Kafka) for provision events instead of poll  
- **Remove committed bundles** — CI builds worker artifact  
- **Staging stack** mirroring prod compose with scaled-down resources  

---

*End of audit. For dev-loop analysis see [`build.md`](build.md). For earlier phase-style report see [`productionready.md`](productionready.md).*
