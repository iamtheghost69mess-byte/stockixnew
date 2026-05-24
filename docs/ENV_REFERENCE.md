# Environment Variables — Single Source of Truth

All env vars, their purpose, which service uses them, and how to set up local vs production.

**Last consolidated:** 2026-05-24  
**Supersedes:** `env.md`, `envexplanation.md`, `ENV_CONSOLIDATION_REPORT.md`, `ENV_MAP.md`, `LOCAL_SETUP.md`

---

## Table of Contents

1. [How Env Loading Works](#1-how-env-loading-works)
2. [Root `.env` — All Variables](#2-root-env--all-variables)
3. [Per-Service Strategy](#3-per-service-strategy)
4. [Per-Tenant Generated Env](#4-per-tenant-generated-env)
5. [Local Dev Setup](#5-local-dev-setup)
6. [Production Setup](#6-production-setup)
7. [Conflicts & Critical Secrets](#7-conflicts--critical-secrets)
8. [Env Audit Findings (worker policy)](#8-env-audit-findings-worker-policy)

---

## 1. How Env Loading Works

Stockix uses a **three-layer** model. Treating everything as one mega `.env` causes drift.

| Strategy | Name | Description |
|----------|------|-------------|
| **A** | Root via `@repo/config` | API, dashboard, worker, PMS read repo-root `.env` then `.env.local` |
| **B** | Own `.env` (standalone dev) | Finance Nest server, POS backend/frontend when run outside Docker |
| **C** | Worker-generated tenant file | `{TENANT_ENV_ROOT}/{slug}/.env` for Finance tenant Docker stacks |
| **D** | Prod compose injection | Chatwoot + prod services from `infra/prod/.env` |

### `@repo/config` loading

**File:** `packages/config/src/index.ts`

- Loads `<monorepoRoot>/.env` then `.env.local` (override).
- Skip root load when `STOCKIX_LOAD_ROOT_ENV=0` (prod containers set this so Compose `environment:` wins).
- Exports: `env`, `apiConfig`, `dashboardConfig`, `dbConfig`, `mailConfig`, `infraConfig`, **`posConfig`**, **`pmsConfig`**, **`chatwootConfig`**, **`moduleGatingConfig`**.

### Load order diagram

```text
root .env  →  @repo/config  →  worker (provision)
                    ↓
         buildTenantEnvMap() writes ~/.stockix/tenants/{slug}/.env
                    ↓
         docker compose --env-file  →  Finance server + webapp containers
```

### All `.env.example` files in repo

```
.env.example                          # Canonical schema (~138 keys)
apps/api/.env.example                 # Pointer → root
apps/dashboard/.env.example           # Pointer → root
infra/prod/.env.example               # Production compose
services/pms/.env.example
services/pms/frontend/.env.example
services/posnew/apps/pos-backend/.env.example
services/posnew/apps/pos-frontend2/.env.example
services/stockix-finance/.env.example
services/stockix-finance/packages/server/.env.example
services/stockix-finance/packages/webapp/.env.example
services/chatlive/.env.example        # Upstream template; prod uses infra/prod
```

**Do not use** `apps/api/.env` or `apps/dashboard/.env` alone — control plane loads **repo root only**.

---

## 2. Root `.env` — All Variables

Canonical schema: `.env.example`. Variable-by-variable glossary below grouped by section.

> **Format:** `VAR_NAME` — Purpose · Local · Production · Required · Used by

### Core / Node

| Variable | Purpose | Local | Production | Required |
|----------|---------|-------|------------|----------|
| `NODE_ENV` | Runtime profile | `development` | `production` | Yes |
| `HOSTNAME` | Process label in logs | `server` | `server` | No |

### Database (control plane)

| Variable | Purpose | Local | Production | Required |
|----------|---------|-------|------------|----------|
| `DATABASE_URL` | Postgres control-plane DSN | `postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform` | `postgresql://...@postgres:5432/stockix_platform` | Yes |
| `DB_WAIT_TIMEOUT_MS` | Startup wait for Postgres | `90000` | `90000` | No |

**Legacy Finance blocks** (`DB_*`, `SYSTEM_DB_*`, `TENANT_DB_*`) at root are for isolated Finance server dev; often empty at platform layer. Tenant stacks set MySQL vars in generated `.env`.

### API / Control plane

| Variable | Purpose | Required | Used by |
|----------|---------|----------|---------|
| `PORT` | API listen port (default 4000) | Yes | API |
| `PLATFORM_API_SECRET` | Dashboard→API privileged auth | Yes | API, Dashboard BFF |
| `WORKER_SECRET` | Worker job claim/complete | Yes | API, Worker |
| `INTERNAL_API_SECRET` | Finance internal routes (`x-internal-secret`) | **Yes in prod** (dev may fall back to `WORKER_SECRET`) | API, Worker, Finance tenant containers |
| `DASHBOARD_URL` | Dashboard public URL (redirects, CSRF) | Yes (staging/prod) | API |
| `ROOT_DOMAIN` | Tenant hostnames `{slug}.ROOT_DOMAIN` | Yes | API, Worker, Traefik |
| `PUBLIC_BASE_URL_SCHEME` | `http` or `https` for URL building | Yes | API, Worker |
| `MAX_TENANT_PORT` | Upper bound for dev tenant ports | No | API provisioning |
| `TENANT_INTERNAL_HOST` | Host API/worker use to reach tenant stacks | `127.0.0.1` | `host.docker.internal` | Yes for Finance user proxy |
| `STOCKIX_TENANT_APP_ROOT` | Path to finance monorepo for tenant images | Auto | `/opt/stockix/.../services/stockix-finance` | Provisioning |
| `REPO_ROOT` / `TENANT_ENV_ROOT` | Monorepo root; generated tenant env dir | Auto | `/opt/stockix/tenants` | Worker |
| `TRAEFIK_DYNAMIC_DIR` / `TRAEFIK_TENANT_UPSTREAM_HOST` | Traefik file provider + upstream | Defaults | Same on Linux host | Traefik deploy |
| `CORS_ORIGINS` | Comma-separated browser origins | Empty/permissive | Your dashboard domain(s) | Recommended prod |
| `STOCKIX_API_URL` | API base for scripts | `http://localhost:4000` | `https://api.[domain]` | Scripts |
| `PROVISION_POLL_MS` / `PROVISION_MAX_MS` | Provision job polling | `2000` / `2700000` | Same | No |
| `DOCKER_COMPOSE_*_TIMEOUT_MS` | Worker compose timeouts | See `.env.example` | Same | No |

### Auth & Security

| Variable | Purpose | Required | Used by |
|----------|---------|----------|---------|
| `SESSION_SECRET` | Owner dashboard HMAC session cookie | Yes | API, Dashboard |
| `AUTH_TOKEN_SECRET` | **Stockix product JWT** — must match POS/PMS | Yes | API, POS compose, PMS |
| `LICENSE_SIGNING_SECRET` | Offline POS license file JWT (≥32 chars) | Yes outside dev | API |
| `DEPLOYMENT_SECRET_KEY` | Derives bootstrap admin password HMAC | Yes | API, Worker |
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` | Dashboard operator login | Yes | Dashboard |
| `BOOTSTRAP_ADMIN_*` | Break-glass bootstrap | If using bootstrap | API |
| `ALLOW_BOOTSTRAP_LOGIN` | Enable bootstrap endpoint | No | API |
| `SIGNUP_DISABLED` | Disable Finance self-signup | `true` | API → tenant env |
| `SIGNUP_ALLOWED_DOMAINS` / `SIGNUP_ALLOWED_EMAILS` | Signup allowlists | Optional | API, Finance |
| `JWT_SECRET` | Legacy name; **not** copied to tenant JWT | No at root | Legacy refs only |

### Dashboard public (Next.js)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_STOCKIX_API_URL` | Browser API base |
| `NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME` | URL scheme for tenant links |
| `NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN` | Root domain in browser |
| `NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST` | Local tenant host override (`127.0.0.1`) |
| `NEXT_PUBLIC_PMS_API_URL` | PMS frontend API URL |

### Infra / Deploy

| Variable | Purpose |
|----------|---------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_HOST_PORT` | Prod/dev Postgres compose |
| `ACME_EMAIL` | Let's Encrypt contact |
| `CF_DNS_API_TOKEN` | Cloudflare DNS for Traefik ACME — **manual from Cloudflare dashboard** |
| `STOCKIX_REPO` | Git checkout path on server for volume mounts |

### Mail

| Variable | Purpose | Local | Production |
|----------|---------|-------|------------|
| `MAIL_HOST` | SMTP host | Empty or Mailpit `localhost` | `smtp.resend.com` |
| `MAIL_PORT` | SMTP port | `1025` (Mailpit) | `587` |
| `MAIL_USERNAME` | SMTP user | Empty | `resend` |
| `MAIL_PASSWORD` | SMTP password | Empty | **Resend API key (`re_*`) — manual** |
| `MAIL_SECURE` | TLS | `false` | `false` for Resend :587 |
| `MAIL_FROM_NAME` / `MAIL_FROM_ADDRESS` | Sender | Dev placeholder | Verified Resend domain |

Worker copies `MAIL_*` into tenant `.env` when set. Finance uses Nodemailer (no Resend SDK).

### Storage (S3-compatible)

| Variable | Purpose |
|----------|---------|
| `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | Backblaze B2 / MinIO; worker copies to tenant env |

### Analytics

| Variable | Purpose |
|----------|---------|
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | Optional product analytics (prod compose) |

### Multi-product platform

| Variable | Purpose | Local | Production |
|----------|---------|-------|------------|
| `POS_PLATFORM_BASE_URL` | POS platform API for proxy/bootstrap | `http://localhost:8010` | `http://host.docker.internal:8010` |
| `POS_PLATFORM_API_KEY` | `X-Api-Key` for Stockix→POS (≥10 chars) | Empty until POS configured | **Manual after POS first run** |
| `POS_APP_ROOT` | Path to `services/posnew` | `services/posnew` | Host absolute path |
| `PMS_PORT` / `PMS_BASE_URL` | PMS Hono service | `3003` / `http://localhost:3003` | Internal URL |
| `PMS_APP_ROOT` | Path to `services/pms` | `services/pms` | Host path |
| `PMS_ICAL_SYNC_INTERVAL_MS` | iCal sync interval | `600000` | Same |
| `GEMINI_API_KEY` | Optional PMS passport OCR | Empty | Optional |
| `CHATWOOT_BASE_URL` | Shared Chatwoot URL | `http://localhost:3200` | `https://chat.[domain]` |
| `CHATWOOT_API_ACCESS_TOKEN` | Super-admin API token | Empty until boot | **Manual after first boot** |
| `CHATWOOT_SECRET_KEY_BASE` | Rails secret | Generate | `openssl rand -hex 64` |
| `CHATWOOT_DB_PASSWORD` | Chatwoot Postgres | Strong password | Required |
| `CHATWOOT_FRONTEND_URL`, `CHATWOOT_*_BRAND_*`, logo URLs | White-label metadata | Defaults in example | Match public hostname |
| `PROVISION_MODULE_GATING` | `0`=always Finance; `1`=honor `modules[]` | `0` | `1` |

### Production runtime

| Variable | Purpose |
|----------|---------|
| `STOCKIX_LOAD_ROOT_ENV=0` | Set in prod compose so container env wins over mounted `.env` |

### Still manual (cannot be generated by code)

- `CHATWOOT_API_ACCESS_TOKEN` — after Chatwoot first boot
- `POS_PLATFORM_API_KEY` — after POS platform first run
- `CF_DNS_API_TOKEN` — Cloudflare dashboard
- `MAIL_PASSWORD` — Resend API key
- `AUTH_TOKEN_SECRET` — must be identical in root + POS/PMS tenant compose (auto on provision)

---

## 3. Per-Service Strategy

| Service | Strategy | Env file | Uses `@repo/config`? | How vars are read |
|---------|----------|----------|----------------------|-------------------|
| **apps/api** | A | Root `.env` | ✅ | `apiConfig`; POS/PMS proxies still use raw `process.env` in places |
| **apps/dashboard** | A | Root (via `next.config.ts`) | ✅ | `dashboardConfig` |
| **infra worker** | A | Root (bundled with API) | ✅ | `apiConfig`, `process.env` for provision |
| **packages/db** | A | Root | ✅ | `dbConfig.databaseUrl` |
| **services/pms** | A | Root | ✅ | `apiConfig.authTokenSecret`, `PMS_PORT` |
| **services/pms/frontend** | A/B | Root + `NEXT_PUBLIC_PMS_API_URL` | ❌ | Next.js public env |
| **Finance tenant stack** | C | Generated `{slug}/.env` | Partial (worker uses config to build) | Docker `--env-file` |
| **Finance server (local dev)** | B | `packages/server/.env` | ❌ | NestJS `ConfigModule` cwd-relative |
| **Finance webapp** | B/C | Tenant `.env` → `REACT_APP_*` | ❌ | Build-time CRA/Vite env |
| **POS backend** | B/C | Local `.env` or compose inject | ❌ | `config/config.js`; `AUTH_TOKEN_SECRET` for Stockix JWT |
| **POS frontend2** | B | `.env.local` | ❌ | `NEXT_PUBLIC_POS_API_ORIGIN` |
| **Chatwoot** | D | `infra/prod/.env` → compose | ❌ | Rails env |

### API proxy env (not yet migrated to typed config)

- `apps/api/src/pos-proxy.ts`: `POS_PLATFORM_BASE_URL`, `POS_PLATFORM_API_KEY`
- `apps/api/src/pms-proxy.ts`: `PMS_BASE_URL`

---

## 4. Per-Tenant Generated Env

**Source:** `infra/worker-service/domain/provisioning/tenant-env.ts` → `buildTenantEnvMap()`  
**Path:** `{TENANT_ENV_ROOT}/{slug}/.env` (atomic write)

### Written variables

| Source | Variables |
|--------|-----------|
| **Generated** | `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `JWT_SECRET` (per-tenant random), `BASE_URL`, `PUBLIC_PROXY_PORT`, `MYSQL_VOLUME_NAME`, `AGENDASH_AUTH_PASSWORD` |
| **From worker/root config** | `MAIL_*`, `MONGODB_DATABASE_URL`, `S3_*`, `INTERNAL_API_SECRET`, `REACT_APP_STOCKIX_API_URL`, `REACT_APP_STOCKIX_TENANT_ID`, `STOCKIX_TENANT_APP_ROOT` |
| **Fixed in map** | `SIGNUP_DISABLED=true`, `DB_HOST=mysql`, `DB_CLIENT=mysql`, `SYSTEM_DB_NAME=stockix_system`, `TENANT_DB_NAME_PERFIX=stockix_tenant_` (typo preserved) |
| **Param at provision** | `SIGNUP_ALLOWED_EMAILS` = admin email |

**Not written to Finance tenant `.env`:** `AUTH_TOKEN_SECRET`, `POS_*`, `PMS_*`, `CHATWOOT_*`.

### POS tenant stack (`provisionPosStack`)

Passes: `AUTH_TOKEN_SECRET` from `apiConfig.authTokenSecret`, `TENANT_ID`, `POS_APP_ROOT`, `FINANCE_INTERNAL_BASE_URL`, compose project name.

### PMS tenant stack (`provisionPmsStack`)

Passes: `AUTH_TOKEN_SECRET`, `PLATFORM_API_SECRET`, `DATABASE_URL`, `TENANT_ID`, `PMS_APP_ROOT`.

### Compose vs tenant file gaps

Variables in `docker-compose.yml` with compose defaults but **not** in tenant `.env` file: `REDIS_HOST`, `REDIS_PORT`, `QUEUE_HOST`, `QUEUE_PORT`, `S3_FORCE_PATH_STYLE` — OK via compose defaults.

**Do not manually edit** `{TENANT_ENV_ROOT}/{slug}/.env` except emergencies — worker regenerates on provision.

---

## 5. Local Dev Setup

### Security notice

Commit `09a7152d` exposed secrets in git history. Rotate `PLATFORM_API_SECRET`, `SESSION_SECRET`, `PLATFORM_ADMIN_PASSWORD` on any deployed server. Scrub history separately if needed (`git filter-repo` / BFG).

### Steps

```bash
# 1. Install
pnpm install

# 2. Copy env examples
pnpm bootstrap:env
# or: cp .env.example .env

# 3. Generate secrets
node scripts/generate-env-secrets.js
# Paste into .env secret fields

# 4. Set operator email
# PLATFORM_ADMIN_EMAIL=your@email.com

# 5. Database
docker compose -f infra/dev/docker-compose.yml up -d
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform

# 6. Migrate + seed
pnpm db:migrate
pnpm db:seed:local   # optional

# 7. Start
pnpm dev
```

| App | URL | Credentials |
|-----|-----|-------------|
| Dashboard | http://localhost:3000 | `admin@localhost` / `admin` (or your bootstrap) |
| API | http://localhost:4000 | — |

Reset DB: `pnpm db:reset:local`

### Secret variables (must set)

| Variable | How to generate |
|----------|-----------------|
| `SESSION_SECRET`, `AUTH_TOKEN_SECRET` | `node -e "require('crypto').randomBytes(64).toString('hex')"` |
| `LICENSE_SIGNING_SECRET`, `DEPLOYMENT_SECRET_KEY` | 32-byte hex |
| `PLATFORM_API_SECRET`, `WORKER_SECRET` | 64-byte hex |
| `BOOTSTRAP_ADMIN_PASSWORD`, `PLATFORM_ADMIN_PASSWORD` | Strong passwords |

Or run once: `node scripts/generate-env-secrets.js`

### Mail (local)

Install [Mailpit](https://github.com/axllent/mailpit): `MAIL_HOST=localhost`, `MAIL_PORT=1025`, `MAIL_SECURE=false` — view at http://localhost:8025

### Verify env completeness

```bash
node -e "
const fs = require('fs');
const example = fs.readFileSync('.env.example', 'utf8');
const env = fs.readFileSync('.env', 'utf8');
const exampleKeys = [...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]);
const envKeys = [...env.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]);
const missing = exampleKeys.filter(k => !envKeys.includes(k));
console.log('Missing from .env:', missing.length ? missing : 'NONE');
"
```

### Merge multi-product block

If local `.env` predates rebuild, merge from `.env.example`:

- `POS_PLATFORM_*`, `PMS_*`, `CHATWOOT_*`, `PROVISION_MODULE_GATING`, `NEXT_PUBLIC_PMS_API_URL`

Empty values OK until those services run locally.

### Finance local dev (layer 3 — optional)

```bash
cd services/stockix-finance
docker compose up -d
cd packages/server && pnpm dev   # reads services/stockix-finance/.env
```

Use `JWT_SECRET` (not `APP_JWT_SECRET` in local file), `SYSTEM_DB_NAME=stockix_system`, `TENANT_DB_NAME_PREFIX=stockix_tenant_`.

---

## 6. Production Setup

### Deploy flow

```bash
# On server only
cp infra/prod/.env.example infra/prod/.env
# Edit secrets: CF_DNS_API_TOKEN, MAIL_PASSWORD, INTERNAL_API_SECRET, multi-product keys

pnpm env:sync-prod                              # infra/prod/.env → repo root .env on server

cd infra/prod
docker compose --env-file .env up -d --build
```

### Variable ownership (dev vs prod)

| Group | Dev | Prod |
|-------|-----|------|
| `NODE_ENV` | `development` | `production` |
| `ROOT_DOMAIN` | `localhost` | e.g. `stockix.cloud` |
| `DATABASE_URL` | `127.0.0.1:54330` | `postgres:5432` in Docker network |
| `TENANT_INTERNAL_HOST` | `127.0.0.1` | `host.docker.internal` |
| `INTERNAL_API_SECRET` | Optional (WORKER fallback) | **Required**, ≠ `WORKER_SECRET` |
| `PROVISION_MODULE_GATING` | `0` | `1` |
| `SIGNUP_DISABLED` | `true` | `true` |

### Must set before go-live

| Variable | Why |
|----------|-----|
| `CF_DNS_API_TOKEN` | Traefik ACME DNS challenge |
| `MAIL_PASSWORD` | Resend API key |
| `MAIL_FROM_ADDRESS` | Verified Resend domain |
| `INTERNAL_API_SECRET` | Finance internal routes + user proxy |
| `AUTH_TOKEN_SECRET` | Same on root, POS, PMS stacks |
| `POS_PLATFORM_API_KEY` | POS org bootstrap (if using POS) |
| `CHATWOOT_API_ACCESS_TOKEN` | After Chatwoot boot |
| `S3_*` | When tenant uploads enabled |
| `PROVISION_MODULE_GATING=1` | After module scenarios validated |

### Platform policy → tenant behavior

Root vars read by provisioner when creating tenant `.env`:

| Root variable | Effect on new tenants |
|---------------|------------------------|
| `SIGNUP_DISABLED` | Finance signup disabled |
| `SIGNUP_ALLOWED_*` | Allowlists |
| `MAIL_*` | Copied when set |
| `S3_*` | Worker defaults copied |

**Existing tenants** keep on-disk `.env` until reprovision or manual edit + container restart.

Verify signup on running tenant:

```bash
curl -s http://127.0.0.1:<PUBLIC_PROXY_PORT>/api/auth/meta
# Expect "signupDisabled": true
```

---

## 7. Conflicts & Critical Secrets

### Must match across services

| Secret | Must match |
|--------|------------|
| `AUTH_TOKEN_SECRET` | Root `.env`, POS tenant compose, PMS service |
| `INTERNAL_API_SECRET` | Root API/worker, **each** tenant `{slug}/.env` (Finance `x-internal-secret`) |
| `PLATFORM_API_SECRET` | Root API, Dashboard BFF, PMS internal routes |

### JWT / auth secret families (do not conflate)

| Name | Purpose |
|------|---------|
| `SESSION_SECRET` | Owner dashboard cookies |
| `AUTH_TOKEN_SECRET` | Stockix **product** JWT (`@repo/auth`) |
| `JWT_SECRET` | Finance app auth; POS **legacy** access tokens |
| `PLATFORM_JWT_SECRET` | POS platform/admin plane |
| `LICENSE_SIGNING_SECRET` | Offline license file JWT (separate from product JWT) |

### Database URL naming

- Control plane: `DATABASE_URL` (Postgres)
- Finance tenant: MySQL `DB_*` in generated `.env`
- POS: `MONGODB_URI`
- PMS: uses control-plane `DATABASE_URL`

### Public API URL naming

- Dashboard: `NEXT_PUBLIC_STOCKIX_API_URL`
- Finance webapp: `REACT_APP_STOCKIX_API_URL`
- POS frontend: `NEXT_PUBLIC_POS_API_ORIGIN`
- PMS frontend: `NEXT_PUBLIC_PMS_API_URL`

---

## 8. Env Audit Findings (worker policy)

**Historical audit (`env.md`) — structural issues:**

| Issue | Severity | Status |
|-------|----------|--------|
| Worker hardcodes `SIGNUP_DISABLED=true` ignoring root policy | High | Documented; worker should read `apiConfig` |
| Duplicate `composeEnv` + tenant file write can drift | Medium | Two code paths in `provision-runtime.ts` |
| Root `JWT_SECRET` misleading (tenant generates own) | Medium | Naming collision |
| `.env.example` claimed "single source of truth for all services" | High | **False** for tenant Docker — use 3-layer docs |
| Finance duplicate `signup.ts` vs `signup-restrictions.ts` | Low | Remove dead module |

**Ideal 3-layer ownership:**

1. **Root** — platform secrets, policy defaults, mail/S3 for provisioner to copy.
2. **Worker** — reads root, generates tenant secrets, writes tenant file.
3. **Tenant `.env`** — everything `docker compose --env-file` needs; no platform `DATABASE_URL` or session secrets.

**Most important fix (from audit):** Worker should read platform signup and mail policy from `@repo/config` when generating tenant `.env`, not hardcode signup/mail in `tenant-env.ts`.

---

## Related

- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) — pre-deploy operator checklist
- [infra/prod/README.md](../infra/prod/README.md) — prod compose details
- [PLATFORM_REFERENCE.md](./PLATFORM_REFERENCE.md) — architecture context
