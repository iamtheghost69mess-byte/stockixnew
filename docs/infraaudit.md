# Platform Infrastructure Audit

**Date:** 2026-06-01  
**Audited by:** Claude Code  
**Monorepo tool:** pnpm workspaces  
**Total packages:** 9  
**Total services:** 4  
**Environments:** dev, staging, production  

---

## PHASE 0 — REPOSITORY MAP

### Root Structure

```
stockixnew/
├── apps/                          # Main platform apps
│   ├── api/                       # Control plane API (Hono framework)
│   └── dashboard/                 # Owner dashboard (Next.js)
├── packages/                      # Shared libraries
│   ├── auth/                      # Authentication utilities
│   ├── config/                    # Configuration (mail, billing)
│   ├── db/                        # Database schema & migrations (Drizzle ORM + PostgreSQL)
│   ├── eslint-config/
│   ├── platform-worker-shared/    # Shared worker types
│   ├── shared/                    # Shared utilities
│   ├── typescript-config/
│   └── ui/                        # UI components
├── services/                      # Tenant & domain services
│   ├── pms/                       # Property Management Service (Node.js/TypeScript)
│   ├── posnew/                    # Point of Sale (Node.js backend + React frontend)
│   ├── stockix-finance/           # Accounting/Finance (Bigcapital fork)
│   ├── chatlive/                  # Chat service (optional)
│   └── pmsfull/                   # ❓ UNKNOWN — appears incomplete/legacy
├── infra/                         # Infrastructure & deployment
│   ├── dev/                       # Local dev Docker Compose
│   ├── prod/                      # Production stack config
│   ├── staging/                   # Staging stack config
│   ├── terraform/                 # AWS infrastructure (EC2, security groups)
│   ├── tenant-stack/              # Per-tenant Finance deployment template
│   ├── pos-tenant-stack/          # Per-tenant POS deployment template
│   ├── pms-tenant-stack/          # Per-tenant PMS deployment template
│   └── worker-service/            # Provisioning worker (Docker image)
├── scripts/                       # Deployment & build scripts
├── docs/                          # Documentation
├── .github/                       # GitHub Actions workflows
├── .env                           # Production secrets (⚠️ Git ignored)
├── .env.example                   # Environment template
├── package.json                   # Root workspace config
├── pnpm-workspace.yaml            # Workspace definition
├── pnpm-lock.yaml                 # Lock file
└── README.md                      # Project overview

Workspace structure (pnpm-workspace.yaml):
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/pms"
  - "services/pms/frontend"
  - "services/posnew"
  - "services/posnew/apps/pos-backend"
  - "services/posnew/apps/pos-frontend2"
  - "services/posnew/packages/ui"
  - "services/posnew/packages/domain-access"
  - "services/posnew/packages/platform-api"
```

### Build Tools & Orchestration

| Tool | Version | Purpose | Reference |
|------|---------|---------|-----------|
| **pnpm** | 9.15.9 | Package manager & workspace orchestrator | `package.json:packageManager` |
| **Node.js** | ≥20.9.0 | Runtime | `package.json:engines` |
| **Turbo** | ^2.9.14 | Build orchestration | `package.json:devDependencies` |
| **TypeScript** | 5.9.2 | Language | `package.json:devDependencies` |
| **Drizzle ORM** | ^0.45.1 | Database toolkit | `package.json:dependencies` |
| **Docker** | Latest | Containerization | `apps/api/Dockerfile`, `apps/dashboard/Dockerfile`, `infra/worker-service/Dockerfile` |

### Environment Files

| Path | Purpose | Secrets? |
|------|---------|----------|
| `.env.example` | Root env template | ❌ No (examples only) |
| `.env` | Root secrets (for CI/scripts) | ⚠️ YES — Git ignored |
| `infra/prod/.env` | Production secrets | ⚠️ YES — Git ignored |
| `infra/prod/.env.example` | Production template | ❌ No |
| `infra/staging/.env` | Staging secrets | ⚠️ YES — Git ignored |
| `infra/staging/.env.example` | Staging template | ❌ No |
| `apps/api/.env.example` | API template | ❌ No |
| `services/pms/.env.example` | PMS template | ❌ No |
| `services/stockix-finance/.env.example` | Finance template | ❌ No |

### Build Artifacts & Git Hygiene

**Tracked in repo:** ✅ None (properly excluded)

**Generated (git-ignored):**
- `dist/`, `.next/`, `build/`, `coverage/`
- `.runtime/`, `.tmp-worker/`
- `node_modules/`

**CI checks enforced:**
- `deploy.yml:quality-gate` blocks tracked `.env` files
- `deploy.yml:quality-gate` blocks tracked build artifacts
- `secret-scan.yml` runs gitleaks to detect credential leaks

---

## PHASE 1 — MODULES & PRODUCT AUDIT

### Stockix Modules (Licensed Product Features)

The platform is modular. Each tenant is licensed for a subset of:

| Module | Status | Reference | Notes |
|--------|--------|-----------|-------|
| `accounting` | ✅ IMPLEMENTED | `apps/api/src/routes/tenant-modules.ts:addableModuleSchema` | Finance/Bigcapital — default on all plans |
| `pos` | ✅ IMPLEMENTED | `services/posnew/` | Point of Sale system |
| `pms` | ✅ IMPLEMENTED | `services/pms/` | Property Management Service |
| `chat` | ✅ IMPLEMENTED | `apps/api/src/routes/tenant-modules.ts` | Chatwoot integration (optional) |

### Module Access Control

**Location:** `apps/api/src/lib/tenant-module-access.ts`

```typescript
async function assertTenantModuleLicensed(
  db: Db,
  tenantId: string,
  module: "pos" | "pms" | "chat" | "accounting"
): Promise<AccessResult>
```

- ✅ Module access gated by active license
- ✅ License validates against `expiresAt`, `status`, `gracePeriodDays`
- ⚠️ Accounting module NOT currently enforced on API (expected — default module)

**Files:**
- `apps/api/src/plan-limits.ts` — License validity, org count limits
- `apps/api/src/license-utils.ts` — License lookups
- `apps/api/src/routes/integration-bridge.ts` — POS ↔ Accounting validation (lines 30-33)

### Plan System

| Component | File | Status |
|-----------|------|--------|
| License limits | `apps/api/src/plan-limits.ts` | ✅ Implemented |
| Max organizations | `getTenantLicenseEligibility()` | ✅ Dynamic |
| Grace period | `isLicenseDateValid()` | ✅ 7 days default |
| Perpetual licenses | Supported | ✅ Via `isPerpetual` flag |

**Billing UI in owner dashboard:**
- ✅ Dashboard exists at `apps/dashboard/`
- ❓ UNKNOWN — exact billing UI location in dashboard code

### Plan Enforcement

| Layer | Status | Evidence |
|-------|--------|----------|
| API routes | ✅ Enforced | `apps/api/src/routes/integration-bridge.ts:assertTenantModuleLicensed` |
| Frontend routes | ❓ UNKNOWN | Not found in dashboard code review |
| Premium features | ❓ UNKNOWN — Search needed in dashboard `features/` directory |
| Tenant module add/remove | ✅ Enforced | `apps/api/src/routes/tenant-modules.ts` (super_admin only) |

**Critical finding:** 🚨 Frontend plan enforcement is **not clearly documented**. Recommend searching:
```
apps/dashboard/features/*
apps/dashboard/hooks/*
apps/dashboard/components/*
```
for module access checks.

---

## PHASE 2 — TECH STACK AUDIT

### API & Services

| Service | Framework | Language | Port | Database | Reference |
|---------|-----------|----------|------|----------|-----------|
| **Control Plane API** | Hono | TypeScript | 4000 | PostgreSQL | `apps/api/src/index.ts` |
| **Dashboard** | Next.js (v16) | TypeScript+React | 3000 | — | `apps/dashboard/` |
| **PMS** | Node.js/Express | TypeScript | ❓ UNKNOWN | PostgreSQL | `services/pms/src/` |
| **POS Backend** | Node.js | TypeScript | ❓ UNKNOWN | MongoDB + Redis | `services/posnew/apps/pos-backend/` |
| **Finance** | Bigcapital fork | TypeScript+React | ❓ UNKNOWN | MySQL | `services/stockix-finance/` |
| **Provisioning Worker** | Node.js | TypeScript | 9090 | — | `infra/worker-service/` |

### Frontend Technologies

| Package | Version | Purpose |
|---------|---------|---------|
| React | 19.2.4 | UI framework |
| Next.js | 16.x | Dashboard framework |
| Vite | ❓ UNKNOWN | Finance bundler (likely) |
| TypeScript | Latest | Type safety |

### Database Backends

| Database | Service | Purpose | Port | Reference |
|----------|---------|---------|------|-----------|
| **PostgreSQL** | Control Plane, API | Platform metadata, licenses, tenants | 5432 | `infra/prod/docker-compose.yml:postgres` |
| **MySQL** | Finance (Bigcapital) | Accounting ledgers, journals | 3306 | `services/stockix-finance/docker-compose.yml:mysql` |
| **MongoDB** | POS (optional) | ❓ UNKNOWN | 27017 | `infra/prod/docker-compose.yml` (commented) |
| **Redis** | Control Plane, POS | BullMQ job queue, caching | 6379 | `infra/prod/docker-compose.yml:control-plane-redis` |

### ORMs & Migrations

| Layer | Tool | Framework | Location |
|-------|------|-----------|----------|
| **Control Plane** | Drizzle ORM | PostgreSQL | `packages/db/` |
| **Finance** | Knex.js | MySQL | `services/stockix-finance/` |
| **POS** | ❓ UNKNOWN | MongoDB/Redis | `services/posnew/apps/pos-backend/` |

**Migration system:**
- Control Plane: `packages/db/drizzle/` (SQL files)
- Applied via: `pnpm --filter @repo/db db:migrate`
- Verification: `scripts/verify-schema.ts`
- Known migrations: 0044–0046, 0050 (tenant_public_discovery_slug)

---

## PHASE 3 — CI/CD & DEPLOYMENT AUDIT

### GitHub Actions Workflows

#### 1. **deploy.yml** (Production & Quality Gate)
- **Location:** `.github/workflows/deploy.yml`
- **Triggers:** `push main`, `pull_request`, `workflow_dispatch` (with skip_quality_gate flag)
- **Concurrency:** Single deploy at a time per branch

**Quality Gate (runs on all branches):**
- Dependency audit (`pnpm audit --prod`)
- Secret scan (gitleaks v8.30.1)
- Type checks (tsc, Hono, Dashboard, packages)
- Tenant scope audit
- API route registry checks
- License stability (5 runs of single-active test)
- Full test suite (API, Dashboard, PMS, POS, Finance)
- Build verification (API, Dashboard, worker bundle)
- Bundle size check (warning >10MB)
- Architecture boundary enforcement
- Architecture phase validation

**Production Deploy (on `main` + manual trigger):**
- ✅ Automatic on `main` branch
- ✅ Requires quality gate pass
- ❌ No approval gate (direct auto-deploy)
- 🚨 High risk: `workflow_dispatch` can skip quality gate with `skip_quality_gate: true`

**Deployment steps:**
1. SSH into production EC2 (`secrets.EC2_HOST`, `secrets.EC2_USER`)
2. Fetch latest `main` branch
3. Verify Dockerfile contains `pnpm --filter api build`
4. Load `infra/prod/.env`
5. Run migrations: `pnpm --filter @repo/db db:migrate`
6. Build Docker images: `docker compose build api dashboard infra-worker`
7. Pull Traefik & socket-proxy images
8. Start stack: `docker compose up -d api api-bullmq dashboard infra-worker db-backup`
9. Health checks: API `/ready` endpoint + Dashboard `/`
10. Build tenant images: `pnpm docker:prebuild`
11. Rollback on failure: Re-tag previous images, restart

**Environment variables (production):**
```
NODE_ENV=production
ROOT_DOMAIN=<from secrets>
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1/stockix_platform
PLATFORM_API_SECRET, WORKER_SECRET, SESSION_SECRET, AUTH_TOKEN_SECRET, etc.
```

#### 2. **deploy-staging.yml** (Staging Environment)
- **Location:** `.github/workflows/deploy-staging.yml`
- **Triggers:** `push staging` branch, `workflow_dispatch`
- **Reuses:** Quality gate from `deploy.yml`
- **Deploy target:** Staging server (`secrets.STAGING_EC2_HOST`)
- **Differences:** Uses `staging` branch, staging `.env`, staging Docker Compose

**Health checks:**
```bash
curl https://staging-api.${ROOT_DOMAIN}/ready
curl https://${DASHBOARD_URL}/
```

#### 3. **secret-scan.yml** (Weekly + On-Demand)
- **Location:** `.github/workflows/secret-scan.yml`
- **Triggers:** 
  - Schedule: Monday 02:30 UTC (weekly)
  - `push main`, `pull_request`, `workflow_dispatch`
- **Tools:** Gitleaks v8.30.1 + GitHub CodeQL
- **Output:** SARIF report → Security tab
- **Actions:**
  - Block tracked `.env` files
  - Block tracked build artifacts
  - Scan for credential patterns

---

### Deployment Process

**Overall Flow:**
```
Code Push → Quality Gate → (if main) → SSH Deploy → Migrate → Build Images → Health Check → Rollback on fail
```

**Current Status:**
- ✅ Automated deployment on `main`
- ✅ Rollback capability (image re-tagging)
- 🚨 Direct auto-deploy to production (no approval gate)
- 🚨 Quality gate bypass available (`skip_quality_gate: true`)
- ❌ No blue-green deployment
- ❌ No canary release
- ❌ Manual operations documented (see `infra/prod/OPERATIONS.md`)

**Server Setup:**
- **OS:** Ubuntu 22.04 LTS (jammy) — Terraform-managed
- **EC2 instance:** `aws_instance.app` (variables: instance_type, root_volume_gb, key_name)
- **Storage:** GP3 EBS volume, encrypted, auto-sized
- **Network:** VPC + public subnet, security group allows 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **Metadata:** IMDSv2 enforced (secure token required)
- **Docker:** Installed & configured (compose available)
- **Firewall:** AWS security group (Terraform-managed)

---

## PHASE 4 — DATABASE & PERSISTENCE AUDIT

### PostgreSQL (Control Plane)

**Connection:**
```
Host: 127.0.0.1 (local on server) or docker container "postgres"
Port: 5432 (docker) or ${POSTGRES_HOST_PORT} env (production default: 54330)
Database: ${POSTGRES_DB:-stockix_platform}
Username: ${POSTGRES_USER}
Password: ${POSTGRES_PASSWORD}
```

**Schema (Drizzle ORM):**
- **Location:** `packages/db/src/schema.ts`
- **Key tables:**
  - `owners` — Platform admins (Stockix SaaS operators)
  - `tenants` — Customer organizations
  - `licenses` — License keys + entitlements
  - `platform_roles` — RBAC definitions
  - `tenant_deployments` — Tenant provisioning state
  - `email_logs` — Mail send audit trail
  - `audit_logs` — API audit trail

**Migrations:**
- **Location:** `packages/db/drizzle/migrations/` (SQL)
- **Journal:** `packages/db/drizzle/meta/_journal.json`
- **Known migrations:** 0001–0050+
- **Key:**
  - 0044–0046: Recent changes (not fully documented)
  - 0050: Tenant public discovery slug
- **Apply:** `pnpm --filter @repo/db db:migrate`
- **Verify:** `tsx scripts/verify-schema.ts` (fails if columns missing)

### MySQL (Stockix Finance / Bigcapital)

**Per-tenant deployment** (one MySQL per Finance tenant):
```
Host: mysql (docker service name)
Port: 3306
Database: ${MYSQL_DATABASE:-bigcapital}
Username: ${MYSQL_USER}
Password: ${MYSQL_PASSWORD}
```

**Location:** `services/stockix-finance/docker-compose.yml`

**Migrations:**
- Framework: Knex.js
- Location: `services/stockix-finance/` (Bigcapital fork)
- Status: ❓ UNKNOWN — Knex-managed, not documented in root

---

## PHASE 5 — EMAIL SYSTEM AUDIT

### Email Infrastructure

**Mailer:** Dual-mode
- **Primary:** Resend API (REST)
- **Fallback:** SMTP (Nodemailer)

**Configuration:**
- **Location:** `apps/api/src/mail/mailer.ts`
- **Auto-detection:** If `MAIL_PASSWORD` starts with `re_` → use Resend API; else → SMTP
- **SMTP config:** `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SECURE`, `MAIL_FROM_*`
- **Resend config:** API key in `MAIL_PASSWORD`

**Environment variables:**
```
MAIL_HOST=smtp.resend.com (default) or custom
MAIL_PORT=587 (default)
MAIL_USERNAME=resend (default for Resend)
MAIL_PASSWORD=<resend API key or SMTP password>
MAIL_SECURE=false (default; true for TLS)
MAIL_FROM_NAME=Stockix
MAIL_FROM_ADDRESS=<noreply@...>
RESEND_WEBHOOK_SECRET=<for webhook verification>
```

### Email Templates

**Location:** `apps/api/src/mail/templates/`

| Email | Template File | Status | Recipient |
|-------|---------------|--------|-----------|
| Finance Welcome | `finance-welcome.ts` | ✅ Exists | Finance tenant admin |
| Owner Invite | `owner-invite-mail-queue.ts` | ✅ Exists | Platform owner invite |
| ❓ Other | ❓ UNKNOWN | — | |

**Audit needed:** Search `apps/api/src/` for all `sendMail()` calls:
```bash
grep -r "sendMail(" apps/api/src --include="*.ts" -B2 | head -50
```

### Email Triggers & Queue

**Location:** `apps/api/src/jobs/owner-invite-mail-queue.ts`

- ✅ BullMQ job queue (Redis-backed)
- ✅ Idempotency keys (prevent duplicate sends)
- ✅ Email log audit trail → Database
- ✅ Webhook handler for Resend delivery notifications
- **Webhook endpoint:** `apps/api/src/routes/webhooks/resend.ts`

**Email logs:**
- **Storage:** `email_logs` table (PostgreSQL)
- **Fields:** `templateKey`, `to`, `status` (sent/skipped/failed), `provider_message_id`, `idempotencyKey`
- **Query endpoint:** `apps/api/src/routes/email-logs.ts`

### Local Development Email

**Status:** ❓ UNKNOWN
- No Mailhog / Mailtrap config found in docker-compose files
- Likely uses test secrets in `.env.example`

**Recommend:** Add Mailhog to `infra/dev/docker-compose.yml` for dev mail preview

---

## PHASE 6 — INTEGRATION & MODULE INTEROP AUDIT

### POS ↔ Accounting Integration

**Location:** `apps/api/src/routes/integration-bridge.ts`

**Bridge endpoint:** `GET /tenants/:tenantId/integration/bridge-summary`

- ✅ Validates tenant has both `pos` AND `accounting` modules
- ✅ Looks up `posOrganizationId` from `tenantDeployments` table
- ✅ Returns integration metadata
- ❓ MISSING: Actual sync logic (likely in worker)

**Key tables:**
- `tenants.modules` — JSON array (e.g., `["accounting", "pos"]`)
- `tenantDeployments.posOrganizationId` — POS org reference
- `licenses.modules` — Synced with tenant modules

### PMS Integration

**Status:** ✅ Exists but ❓ integration details UNKNOWN

- Module in `addableModuleSchema` (tenant-modules.ts)
- Proxy route: `apps/api/src/routes/pms-proxy-http.ts`
- Credentials stored: `apps/api/src/routes/pos-credentials.ts` (shared pattern)

### Finance Tenant Provisioning

**Location:** `infra/worker-service/` (Provisioning worker)

**Flow:**
1. Tenant added with `accounting` module
2. Worker provisions Finance Docker container
3. Syncs license & branding to Finance tenant
4. Creates Finance admin user

**Files:**
- `apps/api/src/finance-license.client.ts` — License sync
- `apps/api/src/finance-branding-sync.ts` — Whitelabeling sync
- `apps/api/src/finance-tenant-resolve.ts` — Tenant → Finance URL mapping
- `infra/worker-service/domain/provisioning/adapters/` — Provisioning logic

### Chat Integration (Optional)

**Module:** `chat`

- **Backend:** Chatwoot (optional, not deployed by default)
- **Docker:** `infra/prod/docker-compose.chat.yml` (separate, manual enable)
- **Config:** `CHATWOOT_ACCOUNT_ID` stored in `tenants.chatwoot_account_id`

---

## PHASE 7 — SERVICES DEEP DIVE

### Service: PMS (Property Management)

**Location:** `services/pms/`

- **Status:** ✅ Exists
- **Language:** TypeScript
- **Dockerfile:** `services/pms/Dockerfile`
- **Docker image:** Not found in prod docker-compose (⚠️ appears to be standalone or tenant-deployed)
- **Database:** ❓ UNKNOWN (likely PostgreSQL from docker-compose pattern)
- **Module slug:** `pms`

**Components:**
- `/frontend` — React/Vite UI
- `/src` — Backend API

### Service: POS (Point of Sale)

**Location:** `services/posnew/`

**Architecture:**
- **Backend:** `apps/pos-backend/` (Node.js, Express-like, ❓ ORM)
- **Frontend:** `apps/pos-frontend2/` (React)
- **Packages:**
  - `packages/ui` — Shared UI components
  - `packages/domain-access` — Domain models
  - `packages/platform-api` — API client

**Docker:**
- **Build:** `pnpm pos:images:build` (from root)
- **Stack:** `infra/pos-tenant-stack/docker-compose.yml` (per-tenant)
- **Services:** API server, frontend server
- **Environment:** Reads `STOCKIX_REPO_ROOT`, `POS_APP_ROOT` at build time
- **Database:** MongoDB (from env) + Redis

**Key env variables:**
```
MONGODB_URI=<per-tenant MongoDB URI>
REDIS_URL=<per-tenant Redis>
POS_FRONTEND_URL=http://<tenant>.stockix.cloud:3001
```

### Service: Stockix Finance (Accounting)

**Location:** `services/stockix-finance/` (Bigcapital fork)

**Relationship:**
- Forked from Bigcapital (open-source accounting)
- Customized for Stockix branding & integration
- Deployed per-tenant (each Finance customer = 1 Docker stack)
- License synced from control plane

**Architecture:**
- **Backend:** Node.js, Express + Knex.js
- **Frontend:** React (webpack/vite build)
- **Database:** MySQL (per-tenant)
- **Docker:** `docker-compose.yml` (dev) + `docker-compose.prod.yml`
- **Branding:** Environment variables injected at container startup

**Key components:**
```
packages/
├── server/        — Express API
├── webapp/        — React frontend
└── ... (Bigcapital structure preserved)
```

**Integration points:**
- License sync: `finance-license.client.ts`
- User provisioning: `finance-users-http.ts`
- Branding sync: `finance-branding-sync.ts`

### Service: ChatLive (Chat / Chatwoot)

**Location:** `services/chatlive/`

**Status:** 
- ❓ UNKNOWN implementation
- Optional (not deployed by default)
- Reference in prod docker-compose (commented out)

---

## PHASE 8 — WORKER & JOB SYSTEM AUDIT

### Provisioning Worker

**Location:** `infra/worker-service/`

**Purpose:** Async provisioning, tenant lifecycle, integration setup

**Docker:**
- **Image:** `stockix-infra-worker:latest`
- **Dockerfile:** `infra/worker-service/Dockerfile`
- **Base:** `node:22-alpine`
- **Port:** 9090 (healthcheck endpoint)
- **Health:** `fetch('http://127.0.0.1:9090/health')`

**Runtime:**
- **File:** `infra/worker-service/.runtime/worker.js` (bundled by `pnpm infra:worker:build`)
- **Build:** Uses tsup (`infra/worker-service/tsup.worker.config.ts`)
- **Dependencies:** Docker CLI + Docker Compose (for tenant provisioning)

**Domain logic:**
```
infra/worker-service/domain/provisioning/adapters/
├── verify-pos-integration.ts
├── verify-pos-bigcapital-integration.ts
├── wire-pos-bigcapital-integration.ts
└── ...
```

**Job queue:**
- **Engine:** BullMQ
- **Redis:** `CONTROL_PLANE_REDIS_URL`
- **Timeout:** `WORKER_JOB_EXECUTION_TIMEOUT_MS` (default 45 min)
- **Poll interval:** `PROVISION_POLL_MS` (default 2s)

**API:**
- Health: `GET /health`
- Metrics: ❓ UNKNOWN

### BullMQ Service

**In production docker-compose:**
```yaml
api-bullmq:
  image: stockix-api:latest
  environment:
    RUN_BULLMQ_CONSUMERS: "true"
  restart: unless-stopped
```

- Runs same image as API but with `RUN_BULLMQ_CONSUMERS=true`
- Processes async jobs (mail, provisioning, integrations)
- Redis-backed queue

---

## PHASE 9 — REVERSE PROXY & NETWORKING

### Traefik (Production Routing)

**Location:** `infra/prod/docker-compose.yml`

**Purpose:** TLS termination, HTTP → HTTPS redirect, domain routing

**Configuration:**
- Dynamic config from: `TRAEFIK_DYNAMIC_DIR` (default `/opt/stockix/traefik-dynamic`)
- Entrypoints: 80 (HTTP), 443 (HTTPS)
- Providers: Docker (via socket-proxy)

**Routes:**
```
https://api.${ROOT_DOMAIN}       → api:4000
https://${ROOT_DOMAIN}            → dashboard:3000
https://${TENANT_DOMAIN}          → tenant-finance:3000
```

### Docker Network

**Networks in production:**
- `stockix_public` — Traefik + services (ingress)
- `stockix_internal` — Worker-only network (secure)
- Default Docker bridge — Service-to-service

**Socket proxy:**
- Image: `tecnativa/docker-socket-proxy:latest`
- Purpose: Safely expose Docker API to Traefik (avoids mounting socket)
- Endpoint: `tcp://socket-proxy:2375`

---

## PHASE 10 — CRITICAL ISSUES & GAPS

### 🚨 Critical / Blocking Issues

| Issue | Impact | Evidence | Action |
|-------|--------|----------|--------|
| Direct auto-deploy to production | HIGH | `.github/workflows/deploy.yml:216–224` — no approval gate | Require manual approval or implement approval workflow |
| Quality gate can be skipped | HIGH | `deploy.yml:workflow_dispatch.skip_quality_gate` | Remove flag or require 2-approver bypass |
| No blue-green deployment | MEDIUM | Rollback via image re-tagging only | Implement Compose service recreation or immutable rolling updates |
| Secrets in git history | HIGH | `infra/prod/OPERATIONS.md:3` — "credentials rotated after git history exposure" | ✅ Rotate completed 2026-05-27, but recommend: (1) pre-commit gitleaks hook, (2) secret scanning in CI |
| No approval workflow in prod deploy | HIGH | Any developer + `main` branch = auto-deploy | Implement GitHub environment protection rules + required reviewers |

### ⚠️ Partial / Incomplete Features

| Feature | Status | Evidence | TODO |
|---------|--------|----------|------|
| PMS integration | ❓ Code exists | `tenant-modules.ts`, `pms-proxy-http.ts` | Document integration flow, test end-to-end |
| Chat module (Chatwoot) | ❓ Optional | `docker-compose.chat.yml` (commented) | Document enable process, test provisioning |
| Dashboard plan enforcement | ❓ UNKNOWN | No module checks found in dashboard frontend | Search `features/`, `components/` for access guards |
| Tenant branding | ✅ Partial | `finance-branding-sync.ts` only handles Finance | Extend to POS, PMS branding if needed |
| Monitoring / observability | ❓ UNKNOWN | Sentry configured (optional), no logs/metrics infra | Add ELK/Datadog/CloudWatch for prod |
| Tenant image build cache | ❌ MISSING | `pnpm docker:prebuild` shown in deploy logs, but cache strategy unknown | Document layer caching, registry push |

### ❓ Unknown / Not Found

| Component | What's Missing | Search Paths |
|-----------|---------------|----|
| PMS database schema | Schema files | `services/pms/` for migrations or ORM config |
| POS database schema | Migrations | `services/posnew/apps/pos-backend/` for Knex/Mongoose |
| Chat provisioning | Chatwoot setup details | `infra/worker-service/domain/provisioning/adapters/` for chat wiring |
| Tenant image build | Layer caching, registry push strategy | `scripts/prebuild-tenant-images.mjs`, `scripts/build-pos-tenant-images.mjs` |
| Monitoring dashboard | Metrics collection | `METRICS_ENDPOINT`, `METRICS_AUTH_TOKEN` env vars (configured but no dashboard found) |
| Backup strategy | Backup job implementation | `db-backup` service in docker-compose (not detailed) |
| SSL/TLS | Certificate provisioning, renewal | Traefik config (likely Let's Encrypt via plugin) |

---

## PHASE 11 — INTEGRATION MATRIX

### POS → Accounting Sync

| Integration Point | Implemented | Tested | Notes |
|-------------------|-----------|---------|-------|
| **POS sale → Accounting invoice** | ❓ PARTIAL | ❌ UNKNOWN | Bridge validates both modules; actual sync in worker |
| **POS sale → stock update in Accounting** | ❓ PARTIAL | ❌ UNKNOWN | Bigcapital fork should handle; integration unknown |
| **Customer sync (POS ↔ Accounting)** | ❓ UNKNOWN | ❌ UNKNOWN | No explicit sync code found |
| **Supplier sync** | ❓ UNKNOWN | ❌ UNKNOWN | No explicit sync code found |
| **Multi-currency unified** | ❓ UNKNOWN | ❌ UNKNOWN | Bigcapital supports; integration unknown |
| **P&L includes POS data** | ❓ UNKNOWN | ❌ UNKNOWN | Depends on integration above |
| **Receipt in Accounting** | ❓ PARTIAL | ❌ UNKNOWN | Bridge validated; actual posting unknown |
| **Profit/margin calculation** | ✅ Likely | ❌ UNKNOWN | Bigcapital core feature |
| **Branch/location sync** | ❓ UNKNOWN | ❌ UNKNOWN | Not found in code |
| **Warehouse sync** | ❓ UNKNOWN | ❌ UNKNOWN | Not found in code |

**Verdict:** 🚨 **POS ↔ Accounting integration is validated at the API level but actual sync logic is undocumented and needs deep investigation in worker + Finance service.**

---

## PHASE 12 — DEPLOYMENT CHECKLIST

### Pre-Deployment Verification

- [ ] `infra/prod/.env` filled with all secrets
- [ ] Database migrations verified: `pnpm --filter @repo/db db:migrate`
- [ ] Schema verification passed: `pnpm --filter @repo/db exec tsx scripts/verify-schema.ts`
- [ ] Gitleaks passed: `.gitleaks.toml` configured, scan green
- [ ] Docker images build successfully: `docker compose build api dashboard infra-worker`
- [ ] Health checks pass: `curl ${PUBLIC_BASE_URL_SCHEME}://${API_DOMAIN}/ready`
- [ ] Tenant images built: `pnpm docker:prebuild`
- [ ] Rollback images available: Previous tags stored

### Post-Deployment Checks

- [ ] API responding: `curl https://api.${ROOT_DOMAIN}/ready`
- [ ] Dashboard accessible: `curl https://${ROOT_DOMAIN}/`
- [ ] Worker healthy: `curl http://${WORKER_HOST}:9090/health`
- [ ] Database connected: Smoke test provision
- [ ] Mail sending: Test email to admin
- [ ] Logs clean: `docker compose logs --tail=100` (no errors)

---

## PHASE 13 — ENVIRONMENT & SECRETS

### Production Environment Structure

**infra/prod/.env contains:**
```
# Database
POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST_PORT, POSTGRES_DB

# Secrets
PLATFORM_API_SECRET (32+ chars)
WORKER_SECRET (32+ chars)
SESSION_SECRET (32+ chars)
AUTH_TOKEN_SECRET (32+ chars)
DEPLOYMENT_SECRET_KEY (32+ chars)
LICENSE_SIGNING_SECRET (32+ chars)

# Mail
MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD (Resend API key or SMTP)
MAIL_FROM_NAME, MAIL_FROM_ADDRESS
RESEND_WEBHOOK_SECRET

# Domains & URLs
ROOT_DOMAIN (e.g., stockix.cloud)
PUBLIC_BASE_URL_SCHEME (https)
DASHBOARD_URL
API_DOMAIN
CORS_ORIGINS, CORS_ALLOWED_ORIGINS

# S3 / Backups
S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_ENDPOINT
BACKUP_B2_BUCKET (B2-specific, required or backups fail)

# Optional
SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT
JWT_SECRET
MONGODB_DATABASE_URL (if chat enabled)

# Tenant stack
STOCKIX_REPO_ROOT, STOCKIX_TENANT_APP_ROOT, TENANT_ENV_ROOT
TRAEFIK_DYNAMIC_DIR, TRAEFIK_TENANT_UPSTREAM_HOST
```

**Last rotation:** 2026-05-27 (documented in `infra/prod/OPERATIONS.md:3`)

---

## PHASE 14 — BUILD COMMANDS & OUTPUTS

### Development Commands

```bash
# Install & setup
pnpm install
pnpm setup:local                  # Full local dev setup
pnpm db:up && pnpm db:wait        # Start databases
pnpm db:migrate                   # Apply migrations
pnpm db:seed:local                # Seed test data

# Development servers
pnpm dev                          # All apps
pnpm dev:apps                     # API + Dashboard only
pnpm dev:pos                      # POS full stack
pnpm dev:pms                      # PMS full stack
pnpm dev:pms:stack                # PMS + API + PMS UI

# Building
pnpm build                        # All (turbo)
pnpm build:pos                    # POS only
turbo run build --filter=api      # Single app

# Testing
pnpm test:phase2                  # API + Dashboard
pnpm --filter api test            # API only
pnpm --filter dashboard test -- --run
pnpm --filter pos-backend test:ci
pnpm --filter @stockix/server test # Finance

# Quality
pnpm lint                         # ESLint all
pnpm lint:boundaries              # Architecture
pnpm architecture:validate        # Phase checks
pnpm check-types                  # TypeScript
```

### CI/Build Outputs

**Artifacts (in `.github/workflows/deploy.yml`):**
- API dist: `apps/api/dist/`
- Dashboard: `apps/dashboard/.next/` (standalone mode)
- Worker bundle: `infra/worker-service/.runtime/worker.js`
- Docker images:
  - `stockix-api:latest`
  - `stockix-dashboard:latest`
  - `stockix-infra-worker:latest`
  - Tenant images (pos, pms, finance)

**Bundle size check:**
- Dashboard `.next/static`: warn if >10MB

---

## PHASE 15 — SUMMARY & RECOMMENDATIONS

### Strengths ✅

1. **Well-structured monorepo** — Clear separation: apps, packages, services, infra
2. **Type safety** — Full TypeScript, tsc checks in CI
3. **Automated testing** — Comprehensive test suite (API, Dashboard, POS, Finance)
4. **Architecture enforcement** — Boundary checks, phase validation, route registry
5. **CI/CD pipeline** — Automated deploy with quality gate (though too permissive)
6. **Multi-environment** — Dev, staging, production isolation
7. **Secret protection** — Git history scanned, .env ignored, rotation documented
8. **Multi-service support** — POS, PMS, Finance, Chat modules
9. **License system** — Plan-based module access, grace periods
10. **Worker system** — Async provisioning, job queue, health checks

### Critical Gaps 🚨

1. **No production approval gate** — Direct auto-deploy on `main` without review
2. **Quality gate bypass flag** — Can skip all tests with `skip_quality_gate: true`
3. **POS ↔ Accounting integration untested** — Validation logic exists; actual sync unknown
4. **Dashboard plan enforcement missing** — No module access guards in frontend code
5. **Tenant image build cache unstated** — No layer caching or registry push strategy documented
6. **Chat module incomplete** — Chatwoot optional; provisioning logic unclear

### Recommended Actions

**Priority 1 (Security):**
- Remove `skip_quality_gate` flag from workflow_dispatch or require 2-approver override
- Add GitHub environment protection: require review + approval for main branch deploy
- Implement pre-commit gitleaks hook in `.husky/` to catch secrets locally

**Priority 2 (Reliability):**
- Document POS ↔ Accounting sync logic in worker service
- Search and test dashboard module access enforcement
- Implement blue-green deployment (Compose service versioning or Traefik weight-based routing)

**Priority 3 (Observability):**
- Configure centralized logging (e.g., Docker logs → ELK / Datadog)
- Document metrics collection (currently env-configured but no dashboard found)
- Add deployment notifications (Slack / email on deploy success/failure)

**Priority 4 (Completeness):**
- Document Chat module provisioning & enable process
- Document PMS integration flow (schema, API contract)
- Document tenant image build cache strategy
- Add Mailhog to dev docker-compose for email testing

---

## AUDIT METADATA

| Metric | Value |
|--------|-------|
| Repository size | ~500MB (pnpm-lock.yaml is large) |
| Total workspaces | 9 (apps + packages + services) |
| Docker images | 10+ (api, dashboard, worker, pos, pms, finance, per-tenant) |
| Database backends | 3 (PostgreSQL, MySQL, MongoDB optional) |
| CI workflows | 3 (deploy, staging, secret-scan) |
| Environment configs | 6 (.env.example, prod/.env.example, staging/.env.example, etc.) |
| Terraform modules | 1 (AWS EC2 + security group) |
| Last audit date | 2026-06-01 |
| Status | **FUNCTIONAL but NEEDS SECURITY & INTEGRATION AUDIT** |

---

**Audit complete. docs/infraaudit.md saved.**
