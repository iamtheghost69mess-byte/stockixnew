# Stockix Architecture Audit — architecturePro2.md
*Generated: 2026-06-21*

## Executive Summary
The Stockix platform is a multi-tenant SaaS control plane running a polyglot multi-monorepo architecture. Overall production readiness is at a high level with critical scaling and isolation repairs recently applied (e.g., Traefik socket-proxy security, ProxySQL tenant user syncing, BullMQ Redis prefixing, and shared backup scripts). However, there are lingering architectural inconsistencies—specifically the "polyglot" nature of workspaces, incomplete adoption of shared Nginx, and hardcoded POS hostnames—that require targeted remediation before aggressive scaling.

## Audit Sections

### 1. MONOREPO STRUCTURE
#### ✅ Done / Working
- `pnpm-workspace.yaml` maps root-level Turborepo apps and packages.
- Isolated workspaces for `services/posnew` (Nx/npm) and `services/stockix-finance` (Lerna/bigcapital-monorepo).
- `package.json` contains a robust set of lifecycle, audit, and provision scripts.

#### ⚠️ Partial / Needs Attention
- The monorepo is a "polyglot multi-monorepo" rather than a unified setup. Tools and caching strategies are fragmented across pnpm, npm, Nx, and Lerna.

#### ❌ Not Done / Missing / Broken
- None identified as critical blockers, but fragmentation increases maintenance overhead.

#### 🔧 Action Items
1. Unify workspace management entirely under `pnpm` and Turborepo.
2. Standardize `tsconfig.json` bases across POS, Finance, and core packages.

### 2. AUTHENTICATION & AUTHORIZATION
#### ✅ Done / Working
- `PLATFORM_JWT_SECRET` is defined and passed to Finance and POS containers.
- Role-based models exist within specific ecosystems (e.g., Finance RBAC).

#### ⚠️ Partial / Needs Attention
- Multi-tenant single-login: Context switching between tenant Orgs exists in API, but lacks unified UI implementation across legacy apps.
- Token invalidation/refresh mechanics are fragmented between POS and Finance.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] POS and Finance manage sessions differently; unified Auth Gateway is lacking.

#### 🔧 Action Items
1. Extract Auth into a centralized package to be consumed by API, POS, and Finance.
2. Ensure strict Bearer verification via a central middleware instead of individual service implementations.

### 3. CONFIGURATION & ENVIRONMENT
#### ✅ Done / Working
- `.env`, `.env.example`, `infra/prod/.env` are present and structured.
- `packages/config` parses and exports env variables via Zod.
- Dedicated `audit-env.mjs` script guarantees prod configuration parity.

#### ⚠️ Partial / Needs Attention
- Tenant specific `.env` files are generated at provision time but legacy services still hardcode logic for things like `pos.zerowix.cloud` instead of pure env injection.

#### ❌ Not Done / Missing / Broken
- [LOW] No central Secrets Manager (like HashiCorp Vault); secrets rest in plaintext `.env` files.

#### 🔧 Action Items
1. Implement KMS or Docker Swarm/Secret management for production credentials.
2. Remove all hardcoded domain names (`pos.zerowix.cloud`) from POS codebases and inject them exclusively via `.env`.

### 4. DOCKER & CONTAINERIZATION
#### ✅ Done / Working
- All core services (Postgres, Mongo, Redis, API, Dashboard, Worker) are containerized.
- Tenant-specific DBs are deprecated in favor of shared `stockix-mysql` and `stockix-mongo`.
- Health checks are implemented for `api-bullmq`, `db-backup`, and `postgres`.
- Docker Compose handles complex orchestration.

#### ⚠️ Partial / Needs Attention
- `stockix-webapp` and `stockix-nginx` legacy images still float around in some environments despite Traefik routing directly to `server`.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] Local image cleanup is needed; stale tenant images cause confusion.

#### 🔧 Action Items
1. Run `cleanup-stale-images.mjs` across all environments.
2. Finalize removal of per-tenant Nginx from compose files.

### 5. DOCKER SWARM (if applicable)
#### ✅ Done / Working
- Not applicable.

#### ⚠️ Partial / Needs Attention
- Not applicable.

#### ❌ Not Done / Missing / Broken
- [LOW] PLANNED / NOT STARTED: Current deployment relies on manual Compose scaling (`--scale api=N`).

#### 🔧 Action Items
1. Evaluate migration from Compose to Docker Swarm for robust multi-node scheduling.

### 6. NGINX & REVERSE PROXY (Traefik / Nginx)
#### ✅ Done / Working
- Traefik v3.4 handles edge TLS (Cloudflare DNS-01) and dynamic tenant routing.
- Worker dynamically writes `tenant-{slug}.yml` to `TRAEFIK_DYNAMIC_DIR`.
- Traefik connects safely via `socket-proxy` (tcp://socket-proxy:2375).

#### ⚠️ Partial / Needs Attention
- `stockix-shared-nginx` exists for static assets but `/api` returns 404. Finance static SPA delivery via Nginx is partial; Traefik routes to NestJS `server` instead.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] `resolveNginxDirectUrl` remnants may still exist in older configurations.

#### 🔧 Action Items
1. Standardize completely on Traefik as the sole edge.
2. Complete static asset delivery via shared Nginx or formally document NestJS static serving as the final architecture.

### 7. WEBHOOKS
#### ✅ Done / Working
- Webhooks are used for external comms (e.g., Resend via `test-resend-email-webhook.mjs`).

#### ⚠️ Partial / Needs Attention
- Inbound webhooks lack centralized HMAC signature verification middleware in `packages/shared`.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] Dead letter queue for webhook dispatching is not robustly implemented.

#### 🔧 Action Items
1. Abstract webhook dispatching into a dedicated BullMQ queue.
2. Implement strict HMAC verification on all inbound endpoints.

### 8. API VERSIONING
#### ✅ Done / Working
- Versioning prefixes exist on platform routes (e.g., `/api/platform/v1/organizations/...`).

#### ⚠️ Partial / Needs Attention
- BigCapital fork API endpoints are bound to legacy upstream contracts.

#### ❌ Not Done / Missing / Broken
- [LOW] OpenAPI/Swagger specifications are missing or incomplete for the control plane.

#### 🔧 Action Items
1. Generate OpenAPI spec for Hono/API control plane routes.
2. Ensure consistent `/v1/` prefixing on all new internal and external APIs.

### 9. DATABASES
#### ✅ Done / Working
- **PostgreSQL**: Stores control plane data; uses Drizzle ORM.
- **MongoDB**: Shared instance for POS (`stockix-mongo`); separated by `{slug}_pos`.
- **Redis**: Split into `control-plane-redis` (global rate limits, platform queues) and `stockix-redis` (tenant queues).
- **ProxySQL**: Pools connections (`stockix-mysql-proxy:6033`). User creation is automated via `registerMysqlUserInProxySql`.

#### ⚠️ Partial / Needs Attention
- ProxySQL is monitored via Prometheus, but high connection counts risk saturating the backend if not aggressively pooled.

#### ❌ Not Done / Missing / Broken
- None.

#### 🔧 Action Items
1. Implement automated connection pruning in ProxySQL.
2. Verify automated DB rollback logic on provisioning failure consistently cleans Mongo.

### 10. WORKER SERVICE & QUEUES
#### ✅ Done / Working
- BullMQ powers async workflows (`api-bullmq` replica).
- Redis isolation achieved via `REDIS_KEY_PREFIX`.
- POS-Finance sync uses `bigcapital_sync` BullMQ queue.

#### ⚠️ Partial / Needs Attention
- Custom DB polling queue (`tenant_lifecycle_jobs`) is used for provisioning, while BullMQ is used for emails/sync. Dual-queue architecture complicates observability.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] Unified Job Dashboard is missing; BullMQ jobs aren't visible alongside DB jobs.

#### 🔧 Action Items
1. Consolidate provisioning jobs into BullMQ or build a unified observability UI.
2. Ensure strict idempotency on `bigcapitalSyncWorker` tasks.

### 11. PROVISIONING PIPELINE
#### ✅ Done / Working
- Worker handles robust multi-step provisioning: DB setup, ProxySQL sync, env injection, Traefik YAML writing.
- POS and Finance wire together via `PUT .../integration/bigcapital`.
- `provision-smoke.mjs` validates pipeline end-to-end.

#### ⚠️ Partial / Needs Attention
- Traefik YAML is sometimes left over if POS bootstrap fails (unpublish failure).

#### ❌ Not Done / Missing / Broken
- [HIGH] POS Traefik cleanup must be fatal or firmly retried on bootstrap failure.

#### 🔧 Action Items
1. Shore up `unpublishPosTraefik` to ensure 100% cleanup of Traefik YAML files on provision rollback.

### 12. FRONTEND / UI
#### ✅ Done / Working
- Dashboard is built with Next.js and handles tenant/org switching.
- Finance webapp is Vite-based.

#### ⚠️ Partial / Needs Attention
- POS subdomains are hardcoded to `.pos.zerowix.cloud` in some middleware, breaking custom domains managed by Traefik.

#### ❌ Not Done / Missing / Broken
- [HIGH] Finance UI static serving strategy is ambiguous (NestJS ServeStatic vs Nginx).

#### 🔧 Action Items
1. Replace hardcoded `pos.zerowix.cloud` with env variables in POS frontend/backend.
2. Centralize UI design system under `packages/ui`.

### 13. SHARED PACKAGES
#### ✅ Done / Working
- `@repo/config`, `@repo/db` exist and are used widely.
- Turborepo builds efficiently cache these packages.

#### ⚠️ Partial / Needs Attention
- `ui` package is largely a stub and lacks comprehensive component implementations.

#### ❌ Not Done / Missing / Broken
- [LOW] Shared logger and HTTP client are not unified across POS and Finance.

#### 🔧 Action Items
1. Formalize the `@ixstudio/ui` package and migrate components from apps.

### 14. AUTOMATED BACKUPS
#### ✅ Done / Working
- `backup-shared.sh` handles Postgres, MySQL, Mongo, Redis, and Traefik config.
- Pushes to S3/B2 via cron (`db-backup` container).

#### ⚠️ Partial / Needs Attention
- Backup encryption at rest is optional.

#### ❌ Not Done / Missing / Broken
- [HIGH] Restore drills are not automated; no `restore-runtime.sh`.

#### 🔧 Action Items
1. Enforce mandatory backup encryption.
2. Create automated restore drill scripts to validate backup integrity.

### 15. EMAIL & NOTIFICATIONS
#### ✅ Done / Working
- BullMQ queue `owner-invite-mail` dispatches emails.
- Resend is configured for delivery.

#### ⚠️ Partial / Needs Attention
- If SMTP config is missing, NestJS logs a warning but BullMQ fails silently without alerting the user.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] Sync failure emails (POS to Finance) are completely missing.

#### 🔧 Action Items
1. Surface BullMQ email failures to the Dashboard UI.
2. Implement Admin Webhook/Email on `bigcapital_sync` failures.

### 16. MONITORING, LOGGING & ALERTING
#### ✅ Done / Working
- Prometheus and Grafana are configured in prod compose.
- `proxysqlConnectionsPct` custom metric tracks pool exhaustion.

#### ⚠️ Partial / Needs Attention
- APM/Tracing is not deeply implemented across polyglot boundaries.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] Traefik scraping and dashboard (`:8080`) is not actively alerted.

#### 🔧 Action Items
1. Set up Grafana alerts for `proxysqlConnectionsPct` > 80%.
2. Implement Sentry tracing headers across API <-> Traefik <-> Finance boundaries.

### 17. SECURITY
#### ✅ Done / Working
- Traefik uses `socket-proxy` to prevent Docker socket exposure.
- Rate limits exist globally (Redis-backed).
- `PROXYSQL_ADMIN_PASSWORD` secures pooler admin.

#### ⚠️ Partial / Needs Attention
- Rate limiting at the Traefik proxy level (IP block) is not configured.
- No payload size limiting in Traefik or API.

#### ❌ Not Done / Missing / Broken
- [HIGH] Large POST bodies can exhaust memory.

#### 🔧 Action Items
1. Configure Traefik rate limit and body size limit middleware.

### 18. SCRIPTS & AUTOMATION
#### ✅ Done / Working
- Extensive script library in `scripts/`: E2E audits, prebuilds, cleanup, dev-stack orchestration.
- Scripts are generally idempotent.

#### ⚠️ Partial / Needs Attention
- Too many bash/mjs scripts scattered; difficult to discover without `package.json` digging.

#### ❌ Not Done / Missing / Broken
- None.

#### 🔧 Action Items
1. Consolidate deployment and orchestration scripts into a single CLI tool inside `packages/cli`.

### 19. TESTING
#### ✅ Done / Working
- Provisioning E2E tests (`provision-suite.mjs`) validate combined module deployments.

#### ⚠️ Partial / Needs Attention
- BullMQ processors lack exhaustive unit test coverage.

#### ❌ Not Done / Missing / Broken
- [MEDIUM] No continuous DB schema mutation test in CI.

#### 🔧 Action Items
1. Expand worker testing suite, particularly around `bigcapitalSyncProcessor.js`.

### 20. CI/CD & DEPLOYMENT
#### ✅ Done / Working
- GitHub Actions pipeline handles builds, Sentry mapping, and deploys.
- `docker compose pull traefik socket-proxy` guarantees secure infrastructure images.

#### ⚠️ Partial / Needs Attention
- Deployment relies on `deploy.sh` script invoking SSH and Compose manually.

#### ❌ Not Done / Missing / Broken
- [LOW] No automated Staging environment pipeline.

#### 🔧 Action Items
1. Fully automate staging deployments on Push to `main`.
2. Transition production deployment to a GitOps model (e.g., ArgoCD) if Kubernetes is adopted.

---

## Priority Matrix

| Priority | Item | Section | Effort | Impact |
|----------|------|---------|--------|--------|
| P0 | Ensure Traefik cleanup on POS provision failure | 11. Provisioning | Low | High |
| P0 | Fix POS hardcoded `pos.zerowix.cloud` hostnames | 12. Frontend | Low | High |
| P1 | Consolidate Provisioning DB-queue & BullMQ | 10. Worker Queues | High | Medium |
| P1 | Implement Traefik Body Size & Rate Limiting | 17. Security | Low | High |
| P2 | Generate OpenAPI Spec for Control Plane | 8. API | Medium | Low |

## What MUST Be Shared Across Tenants
- **Edge Proxy**: Traefik (TLS, Routing).
- **Databases**: `stockix-mysql` (via ProxySQL) and `stockix-mongo` (namespace isolated).
- **Redis Cache/Queues**: `stockix-redis` (isolated by `REDIS_KEY_PREFIX`).
- **Control Plane**: `api`, `api-bullmq`, `infra-worker`, `dashboard`.

## What MUST Be Per-Tenant
- **Runtime Servers**: `server` (Finance/NestJS), `pos-backend`, `pos-bigcapital-worker`, `pos-platform-worker`, `pos-frontend`.
- **Traefik Configuration**: `tenant-{slug}.yml` and `tenant-pos-{slug}.yml`.
- **Database Logical Isolation**: MySQL users, databases, and MongoDB namespaces.

## What Is Currently Wrong About Shared vs Isolated
- **Hardcoded POS Domains**: POS backend relies on `pos.zerowix.cloud` middleware logic, breaking isolation and custom subdomains handled by Traefik.
- **Nginx Confusion**: Static asset gateway `stockix-nginx` is partially implemented; traffic incorrectly bypasses it or Traefik falls back to NestJS static serving.
- **Queue Discrepancy**: Provisioning state sits in a shared Postgres DB queue while other tenant tasks run on BullMQ, breaking observability isolation.
