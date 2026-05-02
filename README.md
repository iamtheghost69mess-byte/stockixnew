# Stockix

Stockix is the **control plane** for a multi-tenant SaaS: owner dashboard, APIs, and orchestration around **[BigCapital](https://github.com/bigcapitalhq/bigcapital)** (`services/bigcapital`), which is the tenant accounting runtime.

## Repository layout

| Path | Role |
|------|------|
| `apps/dashboard` | Owner-facing Next.js app (App Router, Shadcn UI) |
| `apps/api` | Control-plane HTTP API (Hono) |
| `packages/db` | Platform Postgres schema (Drizzle ORM) |
| `services/bigcapital` | Vendored BigCapital source (upstream `v0.9.9`, not a submodule) |
| `packages/ui` | Shared React components (`@repo/ui`) |
| `packages/eslint-config` / `typescript-config` | Shared tooling |
| `infra/` | Docker Compose (tenant stack, dev Postgres, VPS platform DB) |
| `env/development/` | Committed development env files (`pnpm bootstrap:env`) |

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable` recommended)

## Install

```sh
pnpm install
```

## Environment

Committed development variables live under **`env/development/`**. Install working `.env` files:

```sh
pnpm bootstrap:env
```

Then edit **`apps/api/.env`** for production domains (`ROOT_DOMAIN`, `PUBLIC_BASE_URL_SCHEME`, etc.). Platform Postgres URL must stay aligned across **`packages/db/.env`** and **`apps/api/.env`** for migrations.

## Platform database (Drizzle)

From repo root:

```sh
pnpm --filter @repo/db db:generate   # after schema changes
pnpm --filter @repo/db db:migrate     # apply migrations (requires DATABASE_URL)
```

## BigCapital (`services/bigcapital`)

BigCapital is **vendored** as normal files (tag `v0.9.9`, commit `485138344c6b266c2034214d6f1233259adf6c32`). See [services/README.md](services/README.md) for boundaries and how to refresh from upstream.

## Develop

Run **dashboard + API** together (recommended):

```sh
pnpm dev
```

| App | Port | Individual command |
|-----|------|---------------------|
| Dashboard | 3000 | `pnpm --filter dashboard dev` |
| API | 4000 | `pnpm --filter api dev` |

Same as `pnpm dev:apps`.

## Build

```sh
pnpm exec turbo run build --filter=dashboard --filter=api
```

## Lint and types

```sh
pnpm run lint
pnpm run check-types
```
