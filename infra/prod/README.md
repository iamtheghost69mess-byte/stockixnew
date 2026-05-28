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
docker compose --env-file .env build api dashboard infra-worker
docker compose --env-file .env up -d --no-build
```

Or rebuild and start in one step: `docker compose --env-file .env up -d --build`

## Mail (control plane + tenants)

| Variable | Service | Purpose |
|----------|---------|---------|
| `MAIL_HOST` | API, worker, tenant Finance stacks | `smtp.resend.com` |
| `MAIL_USERNAME` | same | `resend` |
| `MAIL_PASSWORD` | same | Resend API key |
| `MAIL_FROM_ADDRESS` | same | Verified sender domain |
| `RESEND_WEBHOOK_SECRET` | API | Optional delivery webhooks (`POST /webhooks/resend`) |

Tenant `.env` files receive the same `MAIL_*` values at provision time (`tenant-env.ts`).

## Mail (POS)

POS uses the Resend HTTP API (not SMTP):

| Variable | Service |
|----------|---------|
| `RESEND_API_KEY` | `pos-backend` / `platformWorker.js` |
| `RESEND_FROM_EMAIL` | POS outbound from address |

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
