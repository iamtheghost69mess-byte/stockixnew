# Environment Files Map

Last updated: 2026-05-21

## Overview

| File | Purpose | Loaded by | Committed? |
|------|---------|-----------|------------|
| `.env` | **Local dev** — API, dashboard, worker on your machine | `@repo/config` (repo root) | No (gitignored) |
| `.env.local` | Machine overrides (optional) | `@repo/config` (overrides `.env`) | No |
| `.env.example` | Dev template + glossary | Documentation / `pnpm bootstrap:env` | Yes |
| `infra/prod/.env` | **Production** — `docker compose --env-file` | Compose + sync to root on server | No |
| `infra/prod/.env.example` | Full prod template | Documentation | Yes |
| `infra/prod/README.md` | Prod deploy checklist | Documentation | Yes |
| `~/.stockix/tenants/{slug}/.env` | Per-tenant finance stack | Tenant Docker Compose | Created at provision |

**Rule:** Dev and prod use the **same variable names**, **different values**, and **different secrets**. Never copy prod secrets into dev.

## Production deploy flow

```bash
# On the server only
cp infra/prod/.env.example infra/prod/.env   # first time
# Edit infra/prod/.env (secrets, CF_DNS_API_TOKEN, MAIL_PASSWORD, …)

pnpm env:sync-prod                              # infra/prod/.env → repo root .env

cd infra/prod
docker compose --env-file .env up -d --build
```

`docker compose.yml` injects mail, `INTERNAL_API_SECRET`, S3, and provisioning vars into **api** and **infra-worker**. Containers set `STOCKIX_LOAD_ROOT_ENV=0` so a stray dev `.env` on the mount cannot override Compose.

## Variable ownership (dev vs prod)

| Variable group | Dev (`.env`) | Prod (`infra/prod/.env`) |
|----------------|--------------|---------------------------|
| `NODE_ENV` | `development` | `production` |
| `ROOT_DOMAIN` | `localhost` | `stockix.cloud` |
| `DATABASE_URL` | `127.0.0.1:54330` | `postgres:5432` in Docker network |
| `MAIL_*` | Resend or Mailpit | Resend SMTP (`smtp.resend.com`) |
| `INTERNAL_API_SECRET` | Set (may equal `WORKER_SECRET` in dev) | **Required** — finance internal API |
| `PLATFORM_*` / `WORKER_*` secrets | Dev-generated | **Separate** prod-generated |
| `CF_DNS_API_TOKEN` | Often empty locally | **Required** for Traefik ACME |
| `S3_*` | Optional / empty | Set when tenant uploads enabled |
| `SIGNUP_DISABLED` | `true` | `true` |

## Docker Compose references

| Compose file | Env source |
|--------------|------------|
| `infra/dev/docker-compose.yml` | Postgres only (hardcoded dev password) |
| `infra/prod/docker-compose.yml` | `--env-file infra/prod/.env` + explicit service `environment:` blocks |
| `infra/tenant-stack/docker-compose.yml` | Per-tenant `.env` from worker |

## Manual fields before production go-live

| Variable | Why |
|----------|-----|
| `CF_DNS_API_TOKEN` | Cloudflare DNS for TLS certificates |
| `MAIL_PASSWORD` | Resend API key (SMTP password) |
| `MAIL_FROM_ADDRESS` | Must be on a verified Resend domain |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | Tenant file storage (optional until needed) |

## Local setup

1. `cp .env.example .env`
2. `node scripts/generate-env-secrets.js` → paste into `.env`
3. Set `INTERNAL_API_SECRET` (dev: can match `WORKER_SECRET`)
4. `pnpm setup:local` or `pnpm dev`

See [LOCAL_SETUP.md](./LOCAL_SETUP.md).

## Related

- [infra/prod/README.md](../infra/prod/README.md) — production checklist
- [envexplanation.md](./envexplanation.md) — extended glossary (if present)
