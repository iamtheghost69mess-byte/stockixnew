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

# 4. Start API + Dashboard
pnpm dev
```

| App | URL | Credentials |
|-----|-----|-------------|
| Dashboard | http://localhost:3000 | `admin@localhost` / `admin` |
| API | http://localhost:4000 | — |

> To reset the database back to a clean state: `pnpm db:reset:local`

## Stockix Finance local dev

Stockix Finance has its own database stack. Run it separately from `services/stockix-finance`:

```sh
# Start MariaDB, MongoDB, and Redis
docker compose up -d

# Start the server (from services/stockix-finance/packages/server)
pnpm inspect
```

The server reads `services/stockix-finance/.env` (created by `pnpm bootstrap:env`).
Default values are safe for local dev. Two placeholders to be aware of:
- `JWT_SECRET` — change before using in production
- `AGENDASH_AUTH_PASSWORD` — change before using in production

## Environment files

`pnpm bootstrap:env` copies each `*.env.example` to a real env file. Run it once after cloning, or with `--force` to reset:

```sh
pnpm bootstrap:env          # copy only if destination is missing
pnpm bootstrap:env --force  # overwrite from examples (reset local config)
```

| Example | Copied to | Purpose |
|---------|-----------|---------|
| `.env.example` | `.env` | Root convenience copy |
| `packages/db/.env.example` | `packages/db/.env` | Drizzle ORM |
| `apps/api/.env.example` | `apps/api/.env` | Control-plane API |
| `apps/dashboard/.env.example` | `apps/dashboard/.env.local` | Dashboard (Next.js) |
| `services/stockix-finance/.env.example` | `services/stockix-finance/.env` | Stockix Finance server |

Runtime precedence notes:
- API (`apps/api`) loads dotenv files in this order with override enabled: `root/.env` -> `apps/api/.env` -> `apps/api/.env.local` (last wins).
- Dashboard (`apps/dashboard`): `NEXT_PUBLIC_*` values are build-time values; server-only secrets (e.g. `DATABASE_URL`, `SESSION_SECRET`, `PLATFORM_API_SECRET`) are runtime values.

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
