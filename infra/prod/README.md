# Production environment (`infra/prod`)

Canonical production configuration for the Stockix control plane (Traefik, Postgres, API, worker, dashboard).

## Files

| File | Purpose |
|------|---------|
| `.env` | **Secrets and domain-specific values** (gitignored). Edit on the server only. |
| `.env.example` | Committed template — copy and fill `__MUST_OVERRIDE__` / manual fields. |
| `docker-compose.yml` | Injects platform env into containers explicitly (mail, internal API, provisioning). |

## First-time server setup

```bash
cd /opt/stockix/stockixnew

# 1. Create production env
cp infra/prod/.env.example infra/prod/.env
# Edit infra/prod/.env — new secrets, CF_DNS_API_TOKEN, MAIL_PASSWORD (Resend), S3, etc.

# 2. Sync to repo root (worker + tenant provisioning read MAIL_* from here)
pnpm env:sync-prod

# 3. Deploy
cd infra/prod
docker compose --env-file .env up -d --build
```

## After changing `infra/prod/.env`

```bash
pnpm env:sync-prod
cd infra/prod
docker compose --env-file .env up -d
```

## Local development

Use the **repo root** `.env` (`NODE_ENV=development`, `localhost`). Do **not** run `pnpm env:sync-prod` on your laptop — it overwrites local `.env` with production values.

## Required manual values before go-live

- `CF_DNS_API_TOKEN` — Cloudflare DNS for Traefik ACME (`*.stockix.cloud`)
- `MAIL_PASSWORD` — Resend API key (SMTP password)
- `MAIL_FROM_ADDRESS` — address on a **verified** Resend domain
- `S3_*` — if tenants use file uploads

## Architecture note

- **Compose** passes env into `api` and `infra-worker` (`STOCKIX_LOAD_ROOT_ENV=0` disables accidental dotenv override).
- **Worker** still writes per-tenant `~/.stockix/tenants/{slug}/.env` using `MAIL_*` from `@repo/config` — keep root `.env` synced on the server via `pnpm env:sync-prod`.

See [docs/ENV_REFERENCE.md](../../docs/ENV_REFERENCE.md) for the full variable glossary.
