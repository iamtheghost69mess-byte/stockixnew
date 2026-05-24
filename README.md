# Stockix

Stockix is the **control plane** for a multi-tenant SaaS: owner dashboard, APIs, and orchestration around **[Stockix](#)** (`services/stockix-finance`), which is the tenant accounting runtime.

## Repository layout

| Path | Role |
|------|------|
| `apps/dashboard` | Owner-facing Next.js app (App Router, Shadcn UI) |
| `apps/api` | Control-plane HTTP API (Hono) |
| `packages/db` | Platform Postgres schema (Drizzle ORM) |
| `services/stockix-finance` | Vendored Stockix source (upstream `v0.9.9`, not a submodule) |
| `packages/ui` | Shared React components (`@repo/ui`) |
| `packages/eslint-config` / `typescript-config` | Shared tooling |
| `infra/` | Docker Compose stacks and reverse proxy config |

## Documentation

| File | Purpose |
|------|---------|
| [docs/PLATFORM_REFERENCE.md](docs/PLATFORM_REFERENCE.md) | Architecture, services, build history |
| [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md) | All environment variables and setup |
| [docs/INTEGRATION_REFERENCE.md](docs/INTEGRATION_REFERENCE.md) | POS + Bigcapital bridge, gaps, status |
| [docs/PROVISIONING_REFERENCE.md](docs/PROVISIONING_REFERENCE.md) | Tenant provisioning, license, plans |
| [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) | Pre-deploy checklist for operators |

## Prerequisites

- Node.js 20.9+ (recommended: use [nvm](https://github.com/nvm-sh/nvm) — a `.nvmrc` is included, so `nvm use` picks the right version automatically)
- [pnpm](https://pnpm.io/) 9+ (`corepack enable` recommended)
- Docker (for local databases)

## Local dev quick start

Run these once after cloning:

```sh
# 1. Install dependencies
pnpm install

# 2. Copy all .env files from examples in one shot
#    Covers: root, packages/db, apps/api, apps/dashboard, services/stockix-finance
pnpm bootstrap:env

# 3. Start Postgres, wait for it, run migrations, and seed
pnpm db:up && pnpm db:wait && pnpm db:migrate && pnpm db:seed:local

# 4. (Once) POS backend deps — npm workspaces under services/posnew
pnpm dev:pos:install

# 5. Start API + Dashboard + worker + POS backend (8010)
pnpm dev
```

| App | URL | Credentials |
|-----|-----|-------------|
| Dashboard | http://localhost:3000 | `admin@localhost` / `admin` |
| API | http://localhost:4000 | — |
| POS platform API | http://localhost:8010 | `POS_PLATFORM_API_KEY` in root `.env` |
| POS restaurant UI | http://localhost:3001 | Provisioned tenants may use `{slug}-pos.localhost` via Traefik |

`pnpm dev` builds `@repo/auth`, starts POS API + POS UI, and syncs `AUTH_TOKEN_SECRET` / Redis for local dev.

Control-plane only (no POS): `STOCKIX_DEV_SKIP_POS=1 pnpm dev`

> To reset the database back to a clean state: `pnpm db:reset:local`

## Environment configuration

Stockix uses a **three-layer** environment model. Each layer has its own file, its own runtime, and a clear owner. Treating them as one “mega `.env`” will cause drift (for example, changing root `SIGNUP_DISABLED` without reprovisioning tenants).

| Layer | File | Loaded by | Purpose |
|-------|------|-----------|---------|
| **1 — Platform** | Repo root `.env` (+ optional `.env.local`) | `@repo/config` → API, dashboard, worker | Control plane: Postgres, auth secrets, signup policy, mail/S3 defaults for provisioning |
| **2 — Tenant runtime** | `~/.stockix/tenants/{slug}/.env` (or `TENANT_ENV_ROOT`) | `docker compose --env-file` per tenant | Isolated Finance stack: per-tenant DB passwords, JWT, ports, signup/mail copied at provision time |
| **3 — Finance local dev** | `services/stockix-finance/.env` | NestJS when running `pnpm dev` in `packages/server` | Optional; only for hacking Finance **outside** tenant Docker |

```text
root .env  →  @repo/config  →  worker (provision)
                    ↓
         buildTenantEnvMap() writes ~/.stockix/tenants/{slug}/.env
                    ↓
         docker compose  →  Finance server + webapp containers
```

**Deeper reference:** [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md)

### First-time setup

```sh
# Copy all example env files (root, db, finance)
pnpm bootstrap:env

# Optional: put machine-specific secrets in .env.local (overrides .env)
cp .env .env.local   # then edit .env.local only
```

| Example | Copied to | Used when |
|---------|-----------|-----------|
| `.env.example` | `.env` | API, dashboard, worker (`pnpm dev`) |
| `services/stockix-finance/.env.example` | `services/stockix-finance/.env` | Finance `pnpm dev` only |
| `infra/prod/.env.example` | `infra/prod/.env` | Production Docker Compose |

```sh
pnpm bootstrap:env          # copy only if destination is missing
pnpm bootstrap:env --force  # reset from examples (overwrites existing)
```

**Do not use** `apps/api/.env` or `apps/dashboard/.env` — the control plane loads **repo root only**.

**Load order** (`@repo/config`): `.env` first, then `.env.local` overrides.

### Generate secrets (required before staging/production)

Use OpenSSL on macOS, Linux, or Git Bash on Windows:

```sh
# One secret per line (64 hex chars = 32 bytes)
openssl rand -hex 32
```

| Variable | Layer | Notes |
|----------|-------|-------|
| `PLATFORM_API_SECRET` | Root / prod | Dashboard → API privileged routes |
| `WORKER_SECRET` | Root / prod | Worker ↔ API `/internal/jobs/*` |
| `INTERNAL_API_SECRET` | Root / prod | Finance internal API (`attach-user`); **set explicitly in prod** (dev can fall back to `WORKER_SECRET`) |
| `SESSION_SECRET` | Root / prod | Dashboard session cookies |
| `AUTH_TOKEN_SECRET` | Root / prod | Owner JWT signing |
| `LICENSE_SIGNING_SECRET` | Root / prod | POS offline license JWT (≥32 chars) |
| `DEPLOYMENT_SECRET_KEY` | Root / prod | Tenant secret derivation (≥32 chars) |
| `JWT_SECRET` | Root (legacy) / tenant file | Per-tenant JWT is **generated at provision**; root value is not copied to tenants |
| `POSTGRES_PASSWORD` | Root / prod | Control-plane Postgres |
| `AGENDASH_AUTH_PASSWORD` | Root / tenant | Queue dashboard basic auth |

**Production checklist** (also at top of root `.env`): rotate every secret above, set strong `PLATFORM_ADMIN_PASSWORD` and `BOOTSTRAP_ADMIN_PASSWORD`, fill `infra/prod/.env`, never commit real `.env` files.

### Platform policy → tenant behavior

These root variables are read by the **provisioner** when creating `~/.stockix/tenants/{slug}/.env`:

| Root variable | Effect on new tenants |
|---------------|------------------------|
| `SIGNUP_DISABLED` | `true` by default; controls Finance signup + login “Sign up” link |
| `SIGNUP_ALLOWED_DOMAINS` | Domain allowlist (comma-separated) |
| `SIGNUP_ALLOWED_EMAILS` | Extra emails appended to each tenant’s admin email |
| `MAIL_*` | Copied into tenant env when set |
| `S3_*` | Worker uses root S3 defaults when provisioning (Backblaze B2 in templates) |

**Existing tenants** keep their on-disk `.env` until you **reprovision** or edit `~/.stockix/tenants/{slug}/.env` and restart the tenant server container.

**Verify signup policy on a running tenant:**

```sh
curl -s http://127.0.0.1:<PUBLIC_PROXY_PORT>/api/auth/meta
# Expect: "signupDisabled": true when SIGNUP_DISABLED=true
```

### Integrations (configured in env)

| Service | Variables | Local default |
|---------|-----------|---------------|
| **Email** | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SECURE`, `MAIL_FROM_*` | Empty (configure Resend: `smtp.resend.com:587`, user `resend`, password = API key) |
| **Files** | `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | Backblaze B2 template in root; MinIO block commented in `services/stockix-finance/.env` |
| **Analytics** | `POSTHOG_API_KEY`, `POSTHOG_HOST` | Optional |
| **Exchange rates** | `EXCHANGE_RATE_SERVICE` | Leave empty — manual rates (MENA-friendly) |

Stripe, Plaid, and LemonSqueezy are **disabled** in Finance `.env` (commented blocks kept for future use).

### Production deployment

1. Copy and fill `infra/prod/.env` from `infra/prod/.env.example`.
2. Generate all secrets with `openssl rand -hex 32`.
3. Set `DATABASE_URL` / `POSTGRES_*`, domain URLs (`ROOT_DOMAIN`, `DASHBOARD_URL`, `NEXT_PUBLIC_*`), Traefik (`ACME_EMAIL`, `CF_DNS_API_TOKEN`), and provisioning paths (`STOCKIX_REPO`, `TENANT_ENV_ROOT`, `STOCKIX_TENANT_APP_ROOT`).
4. Run production Compose from `infra/prod` with `--env-file .env` (not laptop root `.env`).

See [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) for the full deploy flow.

### Stockix Finance local dev (layer 3)

Finance has its **own** Docker stack under `services/stockix-finance` (MariaDB, MongoDB, Redis). This is separate from the control-plane Postgres used by `apps/api`.

```sh
cd services/stockix-finance
docker compose up -d

cd packages/server
pnpm dev    # reads services/stockix-finance/.env
```

Important naming in `services/stockix-finance/.env`:

- Use `JWT_SECRET` (not `APP_JWT_SECRET`).
- `SYSTEM_DB_NAME=stockix_system` and `TENANT_DB_NAME_PREFIX=stockix_tenant_` (match the provisioner).
- For local file uploads, uncomment the **MinIO** block and comment out the Backblaze B2 block.

### Scripts and tooling

- Root `scripts/*.mjs` should call `loadRootEnv()` from `scripts/load-root-env.mjs` (same order as `@repo/config`).
- Turbo invalidates caches when root `.env` or `.env.local` changes (`globalDependencies` in `turbo.json`).
- `NEXT_PUBLIC_*` are inlined at **Docker build** time for the dashboard; locally they come from root env when running `next dev`.

## Schema changes

After editing `packages/db/src/schema`:

```sh
pnpm --filter @repo/db db:generate   # generate migration file
pnpm --filter @repo/db db:migrate    # apply to local DB
```

Migration SQL files are stored in `packages/db/drizzle/` (not `packages/db/migrations/`).

## Build

```sh
pnpm exec turbo run build --filter=dashboard --filter=api
```

## Lint and types

```sh
pnpm run lint
pnpm run check-types
```

## Contributing

**Never commit directly to `main`.** The workflow is:

```
main  ←  pull request (reviewed + passing)  ←  feature/your-branch
```

1. **Create a branch** from the latest `main`:
   ```sh
   git checkout main && git pull
   git checkout -b feature/your-feature-name
   ```

2. **Work on your feature.** Keep commits focused — one logical change per commit.

3. **Open a pull request** against `main`. All peers review before merging.

4. **After the PR is merged and verified**, the branch is deployed to production.
   ```sh
   # After merge, clean up your local branch
   git checkout main && git pull
   git branch -d feature/your-feature-name
   ```

> Branch naming: `feature/`, `fix/`, `chore/` prefixes. Example: `feature/tenant-billing`, `fix/login-redirect`.

## Stockix (`services/stockix-finance`)

Stockix is **vendored** as normal files (tag `v0.9.9`, commit `485138344c6b266c2034214d6f1233259adf6c32`). See [services/README.md](services/README.md) for boundaries and how to refresh from upstream.
