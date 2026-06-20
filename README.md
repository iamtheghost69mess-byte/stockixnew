# Stockix

**Stockix** is a multi-tenant SaaS control plane: owner dashboard, orchestration API, and provisioning engine built around [Stockix Finance](#stockix-finance-servicesfinance) — the per-tenant accounting and POS runtime.

---

## Table of Contents

- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Dev Scripts](#dev-scripts)
- [Environment Configuration](#environment-configuration)
- [Schema Changes](#schema-changes)
- [Build](#build)
- [Lint & Types](#lint--types)
- [End-to-End Tests](#end-to-end-tests)
- [CI/CD](#cicd)
- [Contributing](#contributing)
- [Branch Protection](#branch-protection)

---

## Repository Layout

```
stockixnew/
├── apps/
│   ├── dashboard/          # Owner-facing Next.js app (App Router, Shadcn UI)
│   └── api/                # Control-plane HTTP API (Hono)
├── packages/
│   ├── db/                 # Platform Postgres schema (Drizzle ORM)
│   ├── auth/               # Shared authentication utilities
│   ├── config/             # @repo/config — env loader (root .env + .env.local)
│   ├── shared/             # Cross-package types and helpers
│   ├── platform-worker-shared/ # Shared types between API and worker-service
│   ├── pms-db/             # PMS Postgres schema (Drizzle ORM)
│   ├── ui/                 # Shared React components (@repo/ui)
│   ├── eslint-config/      # Shared ESLint config
│   └── typescript-config/  # Shared TypeScript config
├── services/
│   ├── stockix-finance/    # Vendored Stockix Finance (upstream v0.9.9)
│   ├── pms/                # Property Management System service (@stockix/pms)
│   ├── posnew/             # Point-of-Sale restaurant monorepo
│   └── chatlive/           # Self-hosted Chatwoot instance
├── infra/
│   ├── dev/                # Local Docker Compose (Postgres, Redis)
│   ├── prod/               # Production Compose + Traefik + Monitoring
│   ├── staging/            # Staging Compose stack
│   ├── tenant-stack/       # Finance tenant Docker Compose template
│   ├── pms-tenant-stack/   # PMS tenant Docker Compose template
│   ├── pos-tenant-stack/   # POS tenant Docker Compose template
│   ├── worker-service/     # Compiled BullMQ worker service
│   ├── deploy/             # Server-side deploy scripts
│   └── terraform/          # Optional EC2 + security group + Elastic IP
└── scripts/                # Dev tooling, E2E, env management scripts
```

### Key Docs

| File | Purpose |
|------|---------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture and design decisions |
| [`docs/DEVOPS.md`](docs/DEVOPS.md) | DevOps runbooks and operational guides |
| [`infra/prod/OPERATIONS.md`](infra/prod/OPERATIONS.md) | Prod ops: scaling, Redis, BullMQ, backups |
| [`infra/prod/FAILOVER_RUNBOOK.md`](infra/prod/FAILOVER_RUNBOOK.md) | Failover and disaster recovery |
| [`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md) | Deploy quickstart |
| [`.github/DEPLOYMENT_FULL_GUIDE.md`](.github/DEPLOYMENT_FULL_GUIDE.md) | Full deployment guide |
| [`.github/GITHUB_WORKFLOWS.md`](.github/GITHUB_WORKFLOWS.md) | CI/CD workflow reference |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | **22+** (use [nvm](https://github.com/nvm-sh/nvm) — `.nvmrc` included, `nvm use` picks it automatically) |
| pnpm | **9+** (`corepack enable` recommended) |
| Docker | Any recent version (for local databases and tenant stacks) |

---

## Quick Start

Run these once after cloning:

```sh
# 1. Install dependencies
pnpm install

# 2. Copy all .env files from examples
#    Covers: root, packages/db, apps/api, apps/dashboard, services/stockix-finance
pnpm bootstrap:env

# 3. Start Postgres, run migrations, and seed — all in one command
pnpm setup:local

# 4. Start API + Dashboard + worker + PMS + POS
pnpm dev
```

> **Reset to a clean state at any time:** `pnpm db:reset:local`

### Local Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Owner Dashboard | http://localhost:3000 | `admin@localhost` / `admin` |
| Platform Login | http://localhost:3000/login | `admin@localhost` / `admin` |
| PMS (platform admin) | http://localhost:3000/pms | Same login → select **PMS Demo** tenant |
| PMS Tenant App | http://localhost:3004 | Full property-manager UI |
| Control-Plane API | http://localhost:4000 | — |
| PMS API (Hono) | http://localhost:3003 | Proxied via `/pms/api/*` |
| POS Platform API | http://localhost:8010 | `POS_PLATFORM_API_KEY` in root `.env` |
| POS Restaurant UI | http://localhost:3001 | Provisioned tenants via `{slug}-pos.localhost` |

`pnpm dev` runs `scripts/dev-stockix.mjs`: runs migrations, then starts **dashboard**, **API**, **worker**, **PMS**, and **POS**. If a default port is taken, the next free port is used (printed in the startup banner).

---

## Dev Scripts

### Core

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start everything (dashboard, API, worker, PMS, POS) |
| `pnpm dev:kill` | Kill all stale dev processes |
| `pnpm dev:clean` | Clean dev artifacts |
| `pnpm setup:local` | Bootstrap env + start DB + migrate + seed (one-shot first-run) |
| `pnpm db:reset:local` | Tear down volumes and re-run `setup:local` |

### Selective Dev

| Script | Purpose |
|--------|---------|
| `STOCKIX_DEV_SKIP_POS=1 pnpm dev` | Control-plane + PMS only, skip POS |
| `pnpm dev:pms` | PMS service only |
| `pnpm dev:pms:stack` | API + PMS backend + PMS UI together |
| `pnpm dev:pms:ui` | PMS frontend only |
| `pnpm dev:pos` | POS API + restaurant UI |
| `pnpm dev:pos:backend` | POS API only (`pos-backend`) |
| `pnpm dev:pos:frontend` | POS UI only (`studio-admin`) |

### Database

| Script | Purpose |
|--------|---------|
| `pnpm db:up` | Start local Postgres (Docker) |
| `pnpm db:down` | Stop local Postgres |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed:local` | Seed local database |
| `pnpm db:seed:pms-demo` | Add PMS Demo tenant for `/pms` dropdown |

### Build & Test

| Script | Purpose |
|--------|---------|
| `pnpm build:pos` | Production Next.js build for POS UI |
| `pnpm test:pos` | POS backend unit tests |
| `pnpm test:e2e:preflight` | Provision preflight smoke test |
| `pnpm test:e2e` | Full provision E2E suite |
| `pnpm audit:e2e` | Platform audit runner (20 scenarios) |
| `pnpm provision:modules` | Module matrix test (accounting / POS / both) |
| `pnpm provision:smoke` | Single quick provision smoke test |
| `pnpm provision:diagnose` | Hang diagnosis with live event/Docker snapshots |

### Env & Infra

| Script | Purpose |
|--------|---------|
| `pnpm bootstrap:env` | Copy `.env.example` files (skips existing) |
| `pnpm bootstrap:env --force` | Overwrite existing env files from examples |
| `pnpm env:audit` | Audit env variable coverage |
| `pnpm env:align-local` | Align local env gaps + sync POS env from root |
| `pnpm docker:prebuild` | Pre-build Finance tenant Docker images |
| `pnpm pos:images:build` | Build POS tenant Docker images |

---

## Environment Configuration

Stockix uses a **three-layer** environment model. Treat each layer independently — merging them into one "mega `.env`" causes drift.

```
root .env  →  @repo/config  →  worker (provision)
                   ↓
        buildTenantEnvMap() writes ~/.stockix/tenants/{slug}/.env
                   ↓
        docker compose  →  Finance server + webapp containers
```

| Layer | File | Runtime | Purpose |
|-------|------|---------|---------|
| **1 — Platform** | Repo root `.env` (+ `.env.local`) | `@repo/config` → API, dashboard, worker | Control plane: Postgres, auth secrets, signup policy, mail/S3 defaults |
| **2 — Tenant runtime** | `~/.stockix/tenants/{slug}/.env` | `docker compose --env-file` per tenant | Isolated Finance stack: per-tenant DB passwords, JWT, ports |
| **3 — Finance local dev** | `services/stockix-finance/.env` | NestJS via `pnpm dev` in `packages/server` | Only needed for hacking Finance **outside** tenant Docker |

> **Do not use** `apps/api/.env` or `apps/dashboard/.env` — the control plane loads **repo root only**.
>
> **Load order** (`@repo/config`): `.env` first, then `.env.local` overrides.

### First-Time Setup

```sh
pnpm bootstrap:env           # copy only if destination is missing
pnpm bootstrap:env --force   # reset from examples (overwrites existing)
```

| Example file | Copied to | Used when |
|-------------|-----------|-----------|
| `.env.example` | `.env` | API, dashboard, worker (`pnpm dev`) |
| `services/stockix-finance/.env.example` | `services/stockix-finance/.env` | Finance `pnpm dev` only |
| `infra/prod/.env.example` | `infra/prod/.env` | Production Docker Compose |

### Required Secrets (Staging / Production)

Generate each with: `openssl rand -hex 32`

| Variable | Layer | Notes |
|----------|-------|-------|
| `PLATFORM_API_SECRET` | Root / prod | Dashboard → API privileged routes |
| `WORKER_SECRET` | Root / prod | Worker ↔ API `/internal/jobs/*` |
| `INTERNAL_API_SECRET` | Root / prod | Finance internal API (`attach-user`) |
| `SESSION_SECRET` | Root / prod | Dashboard session cookies |
| `AUTH_TOKEN_SECRET` | Root / prod | Owner JWT signing |
| `LICENSE_SIGNING_SECRET` | Root / prod | POS offline license JWT (≥ 32 chars) |
| `DEPLOYMENT_SECRET_KEY` | Root / prod | Tenant secret derivation (≥ 32 chars) |
| `JWT_SECRET` | Root (legacy) / tenant file | Per-tenant JWT is generated at provision time |
| `POSTGRES_PASSWORD` | Root / prod | Control-plane Postgres |
| `AGENDASH_AUTH_PASSWORD` | Root / tenant | Queue dashboard basic auth |

### Platform Policy → Tenant Behavior

These root variables are consumed by the **provisioner** when creating `~/.stockix/tenants/{slug}/.env`:

| Root variable | Effect on new tenants |
|--------------|----------------------|
| `SIGNUP_DISABLED` | `true` by default — controls Finance signup + "Sign up" link |
| `SIGNUP_ALLOWED_DOMAINS` | Domain allowlist (comma-separated) |
| `SIGNUP_ALLOWED_EMAILS` | Extra emails appended to each tenant's admin email |
| `MAIL_*` | Copied into tenant env when set |
| `S3_*` | Worker uses root S3 defaults when provisioning |

Existing tenants keep their on-disk `.env` until you reprovision or edit `~/.stockix/tenants/{slug}/.env` and restart the tenant container.

**Verify signup policy on a running tenant:**

```sh
curl -s http://127.0.0.1:<PUBLIC_PROXY_PORT>/api/auth/meta
# Expect: "signupDisabled": true
```

### Integrations

| Service | Variables | Local default |
|---------|-----------|---------------|
| **Email** | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_*` | Empty — configure Resend: `smtp.resend.com:587`, user `resend`, password = API key |
| **File storage** | `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET` | Backblaze B2 template in root; MinIO block in `services/stockix-finance/.env` |
| **Analytics** | `POSTHOG_API_KEY`, `POSTHOG_HOST` | Optional |
| **Exchange rates** | `EXCHANGE_RATE_SERVICE` | Leave empty — manual rates (MENA-friendly) |

### Production Deployment

1. Copy and fill `infra/prod/.env` from `infra/prod/.env.example`.
2. Generate all secrets with `openssl rand -hex 32`.
3. Set `DATABASE_URL`, domain URLs (`ROOT_DOMAIN`, `DASHBOARD_URL`, `NEXT_PUBLIC_*`), Traefik (`ACME_EMAIL`, `CF_DNS_API_TOKEN`), and provisioning paths (`STOCKIX_REPO`, `TENANT_ENV_ROOT`, `STOCKIX_TENANT_APP_ROOT`).
4. Run production Compose from `infra/prod/` with `--env-file .env`.

See [`.github/DEPLOYMENT_FULL_GUIDE.md`](.github/DEPLOYMENT_FULL_GUIDE.md) for the full deploy flow.

**Scale-first production:** `api` runs 2 replicas (`RUN_BULLMQ_CONSUMERS=false`); `api-bullmq` runs 1 replica for BullMQ only.

---

## Stockix Finance (`services/stockix-finance`)

Finance has its **own** Docker stack (MariaDB, MongoDB, Redis), separate from the control-plane Postgres.

**Vendored revision:** tag `v0.9.9`, commit `485138344c6b266c2034214d6f1233259adf6c32`

```sh
cd services/stockix-finance
docker compose up -d

cd packages/server
pnpm dev    # reads services/stockix-finance/.env
```

Key naming in `services/stockix-finance/.env`:
- Use `JWT_SECRET` (not `APP_JWT_SECRET`)
- `SYSTEM_DB_NAME=stockix_system` and `TENANT_DB_NAME_PREFIX=stockix_tenant_`
- For local file uploads, uncomment the **MinIO** block

> See [`services/README.md`](services/README.md) for boundary rules and how to update the vendored version.

---

## Schema Changes

After editing `packages/db/src/schema`:

```sh
pnpm --filter @repo/db db:generate   # generate migration file
pnpm --filter @repo/db db:migrate    # apply to local DB
```

Migration SQL files live in `packages/db/drizzle/`.

---

## Build

```sh
pnpm exec turbo run build --filter=dashboard --filter=api
```

---

## Lint & Types

```sh
pnpm run lint
pnpm run check-types
```

---

## End-to-End Tests

Integration tests against the **real** local stack (API, worker, Docker, MySQL/Mongo/Redis). No mocks for Docker or the provision worker.

### Prerequisites

```sh
STOCKIX_DEV_STABLE_API=1 pnpm dev   # API without --watch (SSE won't drop mid-provision)
pnpm docker:prebuild                 # Finance tenant images
pnpm pos:images:build                # POS tenant images
```

Required root `.env` variables: `SHARED_MYSQL_ROOT_PASSWORD`, `DEPLOYMENT_SECRET_KEY`, `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` (or `PLATFORM_API_SECRET`), `POS_PLATFORM_API_KEY` (POS scenarios), `PROVISION_MODULE_GATING=1` (POS-only path).

### Scenarios

| Scenario | `--only` flag | What it verifies |
|----------|---------------|-----------------|
| Finance-only | `finance` | Journal through `edge.publish`, Finance health + sign-in, MySQL system DB, Traefik YAML, teardown |
| POS-only | `pos` | 4 POS containers healthy, `pos.schema_migration`, POS health/login, Mongo `{slug}_pos`, Traefik POS route |
| Finance + POS | `combined` | All of the above plus `wire_pos_integration`, BullMQ `bigcapital_sync` |
| Multi-org isolation | `multi-org` | Second org, `/auth/switch-tenant`, per-org MySQL DBs, slug uniqueness |
| Failure injection | `failure` | Crash after `docker.data_step`; rollback cleans MySQL/Mongo/Redis; tenant → `failed` |
| Correlation auth | `correlation` | Foreign owner gets **403** on `provision-status` and `provision-stream` |

```sh
pnpm test:e2e -- --only finance
pnpm test:e2e -- --only pos
pnpm test:e2e -- --only combined
pnpm test:e2e -- --only multi-org
pnpm test:e2e -- --only failure
pnpm test:e2e -- --only correlation
```

Each scenario provisions with a unique slug, asserts journal `operationKey` order and SSE events, then **deprovisions** and verifies cleanup across MySQL/Mongo/Redis/Traefik/Postgres.

Tune timeouts with `PROVISION_MAX_MS` and `PROVISION_POLL_MS` in root `.env`.

Suite: [`scripts/e2e/provision-suite.mjs`](scripts/e2e/provision-suite.mjs) · helpers: [`scripts/e2e/lib/`](scripts/e2e/lib/)

---

## CI/CD

| Workflow | File | Trigger | What it does |
|----------|------|---------|-------------|
| **CI Pipeline** | `ci.yml` | PRs to `main`, `develop`, `staging` | Lint, typecheck, tests (Turborepo affected) |
| **Build & Publish** | `build-and-publish.yml` | Push to `main` | Build + push Docker images to GHCR |
| **Deploy Staging** | `deploy-staging.yml` | After Build & Publish succeeds | SSH deploy to staging EC2 |
| **Deploy Production** | `deploy-production.yml` | Manual `workflow_dispatch` (requires SHA) | SSH deploy to production EC2 |
| **Secret Scan** | `secret-scan.yml` | PRs + `main` | Gitleaks secret detection |

> If `.env` or `infra/prod/.env` was ever committed to git history, rotate all affected secrets on the server before the next deploy.

---

## Contributing

**Never commit directly to `main`.** The workflow is:

```
main  ←  pull request (reviewed + passing CI)  ←  feature/your-branch
```

1. **Branch** from latest `main`:
   ```sh
   git checkout main && git pull
   git checkout -b feature/your-feature-name
   ```

2. **Work** — keep commits focused (one logical change per commit).

3. **Open a pull request** against `main`. All peers review before merging.

4. **After merge**, clean up your local branch:
   ```sh
   git checkout main && git pull
   git branch -d feature/your-feature-name
   ```

**Branch naming:** `feature/`, `fix/`, `chore/` prefixes.
Examples: `feature/tenant-billing`, `fix/login-redirect`, `chore/update-deps`

---

## Branch Protection

Enable on GitHub under **Settings → Branches → Add rule → `main`**:

- Require a pull request before merging (minimum **1** approval)
- Require status checks to pass:
  - **CI Pipeline** (`ci.yml`)
  - **Secret Scan** (`secret-scan.yml`)
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

**Optional:** Create a **production** environment under **Settings → Environments** so the Deploy Production job requires manual approval before SSH deploys.

---

## Repo-Root Files Reference

| File | Purpose |
|------|---------|
| `provisioning.lock` | Stability marker — signals provisioning pipeline is frozen. Not an OS lockfile; do not delete. |
| `scripts/decrypt-tenant-env.mjs` | Decrypts `enc:v1:*` values in a tenant `.env`. Usage: `node scripts/decrypt-tenant-env.mjs <path>` |
| `scripts/inspect-monorepo.sh` | Prints workspace package list, lockfile version, and dependency summary |
