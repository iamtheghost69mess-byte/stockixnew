# Environment Files Map

Last updated: 2026-05-23

## Overview

| File | Purpose | Loaded by | Committed? |
|------|---------|-----------|------------|
| `.env` | **Local dev** — API, dashboard, worker on your machine | `@repo/config` (repo root) | No (gitignored) |
| `.env.local` | Machine overrides (optional) | `@repo/config` (overrides `.env`) | No |
| `.env.example` | Dev template + glossary (~138 keys) | `pnpm bootstrap:env` / manual copy | Yes |
| `infra/prod/.env` | **Production** — `docker compose --env-file` | Compose + `pnpm env:sync-prod` → root | No |
| `infra/prod/.env.example` | Full prod template (multi-product block included) | Documentation | Yes |
| `infra/prod/README.md` | Prod deploy checklist | Documentation | Yes |
| `~/.stockix/tenants/{slug}/.env` | Per-tenant Finance stack | Tenant Docker Compose (`--env-file`) | Created at provision |
| `services/pms/.env.example` | PMS standalone pointer | Docs only (Strategy A uses root) | Yes |
| `services/posnew/apps/pos-backend/.env.example` | POS backend local dev | Shell / compose | Yes |
| `apps/api/.env.example` | Points to root | Documentation | Yes |
| `apps/dashboard/.env.example` | Points to root | Documentation | Yes |

**Rule:** Dev and prod use the **same variable names**, **different values**, and **different secrets**. Never copy prod secrets into dev.

Canonical variable glossary: [envexplanation.md](./envexplanation.md).  
Consolidation audit and gaps: [ENV_CONSOLIDATION_REPORT.md](./ENV_CONSOLIDATION_REPORT.md).

## Production deploy flow

```bash
# On the server only
cp infra/prod/.env.example infra/prod/.env   # first time
# Edit infra/prod/.env (secrets, CF_DNS_API_TOKEN, MAIL_PASSWORD, …)

pnpm env:sync-prod                              # infra/prod/.env → repo root .env (on server)

cd infra/prod
docker compose --env-file .env up -d --build
```

`infra/prod/docker-compose.yml` injects mail, `INTERNAL_API_SECRET`, S3, and provisioning vars into **api** and **infra-worker**. Containers set `STOCKIX_LOAD_ROOT_ENV=0` so a stray dev `.env` on the volume mount cannot override Compose.

## Variable ownership (dev vs prod)

| Variable group | Dev (`.env`) | Prod (`infra/prod/.env`) |
|----------------|--------------|---------------------------|
| `NODE_ENV` | `development` | `production` |
| `ROOT_DOMAIN` | `localhost` | e.g. `stockix.cloud` |
| `DATABASE_URL` | `127.0.0.1:54330` | `postgres:5432` in Docker network |
| `MAIL_*` | Resend or Mailpit | Resend SMTP (`smtp.resend.com`) |
| `INTERNAL_API_SECRET` | Set (dev: may fall back to `WORKER_SECRET` via `@repo/config`) | **Required** — must match each tenant Finance stack |
| `TENANT_INTERNAL_HOST` | `127.0.0.1` | `host.docker.internal` (API/worker → tenant containers) |
| `PLATFORM_*` / `WORKER_*` secrets | Dev-generated | **Separate** prod-generated |
| `CF_DNS_API_TOKEN` | Often empty locally | **Required** for Traefik ACME |
| `S3_*` | Optional / empty | Set when tenant uploads enabled |
| `PROVISION_MODULE_GATING` | `0` (always provision Finance) | `1` (honor tenant `modules[]`) |
| `SIGNUP_DISABLED` | `true` | `true` |

## Critical cross-service secrets

| Secret | Must match across |
|--------|-------------------|
| `AUTH_TOKEN_SECRET` | Root `.env`, POS tenant compose, PMS service |
| `INTERNAL_API_SECRET` | Root API/worker, **each** tenant `{slug}/.env` (Finance server `x-internal-secret`) |
| `PLATFORM_API_SECRET` | Root API, Dashboard BFF, PMS internal routes |

**Finance users (dashboard):** The control plane stores `finance_tenant_id` in Postgres after provision. Listing users calls `http://{TENANT_INTERNAL_HOST}:{internalPort}` with `INTERNAL_API_SECRET`. If the link is missing, the API can auto-repair via Finance `GET /api/internal/resolve-tenant` when the stack is up and secrets align.

## Docker Compose references

| Compose file | Env source |
|--------------|------------|
| `infra/dev/docker-compose.yml` | Postgres only (hardcoded dev password) |
| `infra/prod/docker-compose.yml` | `--env-file infra/prod/.env` + explicit service `environment:` blocks |
| `infra/tenant-stack/docker-compose.yml` | Per-tenant `.env` from worker (`tenant-env.ts`) |

## Manual fields before production go-live

| Variable | Why |
|----------|-----|
| `CF_DNS_API_TOKEN` | Cloudflare DNS for TLS certificates |
| `MAIL_PASSWORD` | Resend API key (SMTP password) |
| `MAIL_FROM_ADDRESS` | Must be on a verified Resend domain |
| `INTERNAL_API_SECRET` | Finance internal routes + finance user proxy (≠ `WORKER_SECRET` in prod) |
| `POS_PLATFORM_API_KEY` | After POS platform first run (if using POS proxy) |
| `CHATWOOT_API_ACCESS_TOKEN` | After Chatwoot first boot |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | Tenant file storage (optional until needed) |

## Local setup

1. `cp .env.example .env`
2. `node scripts/generate-env-secrets.js` → paste into `.env`
3. Set `INTERNAL_API_SECRET` (dev: can leave empty to use `WORKER_SECRET` fallback, or set explicitly)
4. `pnpm bootstrap:env` or `pnpm setup:local` or `pnpm dev`

See [LOCAL_SETUP.md](./LOCAL_SETUP.md).

## Related

- [infra/prod/README.md](../infra/prod/README.md) — production checklist
- [envexplanation.md](./envexplanation.md) — variable-by-variable glossary
- [ENV_CONSOLIDATION_REPORT.md](./ENV_CONSOLIDATION_REPORT.md) — audit, conflicts, Strategy A/B/C/D
