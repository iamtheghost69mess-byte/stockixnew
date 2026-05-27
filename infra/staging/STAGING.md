# Staging environment

Staging validates full-stack deploys before production. **No real customer data** — reset regularly.

## URLs (example)

| Service | URL |
|---------|-----|
| API | `https://staging-api.${ROOT_DOMAIN}` |
| Dashboard | `https://staging.${ROOT_DOMAIN}` |

Set `ROOT_DOMAIN`, `API_DOMAIN`, and `DASHBOARD_URL` in `infra/staging/.env`.

## Setup

```bash
cp infra/staging/.env.example infra/staging/.env
# Fill secrets (can copy from infra/prod/.env with staging domains)
node scripts/sync-prod-env-from-root.mjs  # optional: fill gaps from root .env
cd infra/staging
docker compose --env-file .env config
docker compose --env-file .env up -d --build --wait
curl -fsS "https://staging-api.${ROOT_DOMAIN}/ready"
```

## Differences from production

- Single `api` replica (no scale-out smoke required)
- Lower memory limits (see `docker-compose.yml` comments)
- `BACKUP_B2_PREFIX=stockix-staging-backups`
- Chatwoot optional — disable if not testing `chat` module

## Deploy

- Branch: `staging` → `.github/workflows/deploy-staging.yml`
- Or manual: same steps as `infra/prod/OPERATIONS.md` using `infra/staging/`

## Reset policy

Weekly or before major releases:

```bash
docker compose --env-file .env down -v
pnpm --filter @repo/db db:migrate
```
