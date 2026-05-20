# Environment Files Map

Last updated: 2026-05-20

## Overview

| File | Purpose | Loaded By | Committed? | Status |
|------|---------|-----------|------------|--------|
| `.env` | Local dev — API, Dashboard, worker (canonical) | `@repo/config` (`packages/config`) | ❌ gitignored | ✅ Complete (96 keys, 0 placeholders) |
| `.env.example` | Template for root `.env` | Documentation / `pnpm bootstrap:env` | ✅ committed | ✅ Complete |
| `.env.local` | Machine-specific overrides (optional) | `@repo/config` (overrides `.env`) | ❌ gitignored | ⚪ Not present (optional) |
| `infra/prod/.env` | Production `docker compose` stack | `docker compose --env-file infra/prod/.env` | ❌ gitignored | ⚠️ Partial — secrets set; manual fields empty |
| `infra/prod/.env.example` | Minimal prod template (22 keys) | Documentation | ✅ committed | ✅ Template only |
| `apps/api/.env` | Legacy per-app copy | **Not loaded** by API runtime | N/A | ❌ Does not exist |
| `apps/api/.env.example` | API env hints | Documentation | ✅ committed | Template only |
| `apps/dashboard/.env` | Legacy per-app copy | **Not loaded** (use root) | N/A | ❌ Does not exist |
| `apps/dashboard/.env.example` | Dashboard hints | Documentation | ✅ committed | Template only |
| `services/stockix-finance/.env` | Finance monorepo local dev | Finance `docker-compose` / manual `pnpm dev` | ❌ gitignored | ⚠️ Separate stack (MariaDB keys); not root canonical |
| `services/stockix-finance/.env.example` | Finance template | Documentation | ✅ committed | Template |
| `services/stockix-finance/packages/server/.env` | Legacy server-only dev | `packages/server` when run in isolation | ❌ gitignored | ⚠️ Outdated defaults (`bigcapital_*`); use finance root `.env` |
| `services/stockix-finance/packages/server/.env.example` | Server template | Documentation | ✅ committed | Template |
| `services/stockix-finance/packages/webapp/.env.example` | Webapp Vite template | Vite (if present) | ✅ committed | Template |
| `~/.stockix/tenants/{slug}/.env` | Per-tenant provisioned stack | Tenant Docker compose (worker) | ❌ not in repo | Created at provision time |

## Variable Ownership

| Variable Group | Dev (`.env`) | Prod (`infra/prod/.env`) | Notes |
|---|---|---|---|
| `DATABASE_URL` | `127.0.0.1:54330` / `postgres:postgres` | `postgres:5432` (Docker service) | Different host; prod password is hex-only (URL-safe) |
| `SESSION_SECRET` | Dev-generated (64-byte hex) | Prod-generated (different) | Must differ ✅ |
| `AUTH_TOKEN_SECRET` | Dev-generated | Prod-generated (different) | Must differ ✅ |
| `PLATFORM_API_SECRET` | Dev-generated | Prod-generated (different) | Must differ ✅ |
| `WORKER_SECRET` | Dev-generated | Prod-generated (different) | Must differ ✅ |
| `SIGNUP_DISABLED` | `true` | `true` | Always true |
| `NODE_ENV` | `development` | `production` | |
| `ROOT_DOMAIN` | `localhost` | `stockix.cloud` | |
| `MAIL_*` | Empty (use Mailpit locally) | `smtp.resend.com` | `MAIL_PASSWORD` ⚠️ manual |
| `CF_DNS_API_TOKEN` | Empty | Empty | ⚠️ manual — Cloudflare DNS for Traefik ACME |
| `ACME_EMAIL` | `ops@example.com` | `jad.haidar.ahmad315@gmail.com` | SSL cert contact |
| `STOCKIX_REPO` | `/opt/stockix/stockixnew` | `/opt/stockix/stockixnew` | Host path on deploy server |
| `S3_*` / `POSTHOG_*` | Empty in root | Empty in prod | Finance tenant `.env` may set these |

## Docker Compose Env References

| Compose file | `env_file` | Inline `${VAR}` from host env | Secrets in compose? |
|---|---|---|---|
| `infra/dev/docker-compose.yml` | None | Hardcoded `postgres/postgres` for Postgres only | No |
| `infra/prod/docker-compose.yml` | `--env-file .env` (operator) | `${POSTGRES_PASSWORD}`, `${SESSION_SECRET}`, `${CF_DNS_API_TOKEN}`, etc. | No hardcoded secrets |
| `infra/tenant-stack/docker-compose.yml` | Per-tenant `.env` | Tenant vars | No |
| `services/stockix-finance/docker-compose.yml` | Implicit `.env` in finance dir | MySQL/Mongo vars | Dev passwords in comments only |

## Secrets That Need Manual Input Before Production Deploy

| Variable | File | Why Manual |
|---|---|---|
| `CF_DNS_API_TOKEN` | `infra/prod/.env` | Cloudflare account-specific DNS API token |
| `MAIL_PASSWORD` | `infra/prod/.env` | Resend API key (SMTP password) |
| `S3_ACCESS_KEY_ID` | `infra/prod/.env` | Backblaze B2 credentials |
| `S3_SECRET_ACCESS_KEY` | `infra/prod/.env` | Backblaze B2 credentials |
| `POSTHOG_API_KEY` | `infra/prod/.env` | Optional analytics |

`ACME_EMAIL` and `STOCKIX_REPO` are set to operator values; confirm on the server before deploy.

## Git History — Secrets Exposure

| Commit | File | Finding |
|---|---|---|
| `09a7152d` | Root `.env` (deleted) | **Contained real secrets** in git history: `PLATFORM_API_SECRET`, `SESSION_SECRET`, `PLATFORM_ADMIN_PASSWORD`. Rotate any credentials that were ever used in production. |

`infra/prod/.env` was **not** found in `git ls-files` or commit history (gitignored).

Current dev `.env` uses **new** generated secrets (not the leaked stub values).

## How To Set Up Locally

1. `cp .env.example .env`
2. `node scripts/generate-env-secrets.js`
3. Copy output into `.env` secret fields
4. Set `PLATFORM_ADMIN_EMAIL` to your email
5. `docker compose -f infra/dev/docker-compose.yml up -d` (Postgres)
6. `pnpm dev`

See also: [LOCAL_SETUP.md](./LOCAL_SETUP.md)

## How To Set Up Production

1. SSH into server; clone repo to `/opt/stockix/stockixnew`
2. `cp infra/prod/.env.example infra/prod/.env` (or use existing `infra/prod/.env`)
3. `node scripts/generate-env-secrets.js` — paste **new** values (never reuse dev secrets)
4. Fill all ⚠️ `FILL MANUALLY` fields in `infra/prod/.env`
5. `cd infra/prod && docker compose --env-file .env up -d --build`
