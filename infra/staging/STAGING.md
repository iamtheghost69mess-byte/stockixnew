# Staging environment

Staging validates full-stack deploys before production. **No real customer data** — reset regularly.

> **Requires Docker Swarm.** The prod compose uses Traefik's Swarm provider; `docker compose up` will
> not route requests. Run `docker swarm init` on the staging host before first deploy.

## URLs

| Service | URL |
|---------|-----|
| API | `https://staging-api.${ROOT_DOMAIN}` |
| Dashboard | `https://staging.${ROOT_DOMAIN}` |

Set `ROOT_DOMAIN`, `DASHBOARD_URL`, and all secrets in `infra/staging/.env`.

## Prerequisites (first deploy only)

```bash
# 1. Init Swarm (skip if already a manager)
docker swarm init

# 2. Create external networks
docker network create -d overlay --attachable stockix_public
docker network create -d overlay --internal stockix_internal
docker network create -d overlay --internal socket_proxy_network
docker network create -d overlay --attachable stockix-shared

# 3. Create required host directories
mkdir -p /opt/stockix/tenants
mkdir -p /opt/stockix/traefik-dynamic
# Clone or mount the repo at /opt/stockix/stockixnew (worker reads compose files from here)

# 4. Start shared infra (MySQL, MongoDB, Redis, ProxySQL) — required for provisioning
docker stack deploy \
  -c infra/shared/docker-compose.yml \
  --env-file infra/staging/.env \
  stockix-shared
```

## Setup

```bash
# Copy and fill secrets
cp infra/staging/.env.example infra/staging/.env
# Edit infra/staging/.env — set ROOT_DOMAIN, DASHBOARD_URL, all *_SECRET, *_PASSWORD vars
# SENTRY_ENVIRONMENT is automatically set to "staging" by the compose override
# BACKUP_B2_PREFIX should be "stockix-staging-backups" to isolate staging backups

# Validate config
docker stack config \
  -c infra/prod/docker-compose.yml \
  -c infra/staging/docker-compose.yml \
  --env-file infra/staging/.env

# Deploy
docker stack deploy \
  -c infra/prod/docker-compose.yml \
  -c infra/staging/docker-compose.yml \
  --env-file infra/staging/.env \
  stockix-staging

# Verify
docker stack services stockix-staging
curl -fsS "https://staging-api.${ROOT_DOMAIN}/ready"
```

## Differences from production

| Setting | Production | Staging |
|---------|-----------|---------|
| `api` replicas | 2 | 1 |
| `dashboard` replicas | 2 | 1 |
| `NODE_ENV` | production | staging |
| `SENTRY_ENVIRONMENT` | production | staging |
| Monitoring stack | Full (Prometheus, Grafana, etc.) | Disabled (saves ~800m RAM) |
| Backups B2 prefix | `stockix-prod-backups` | `stockix-staging-backups` |

Re-enable monitoring in staging by removing the `deploy.replicas: 0` overrides for prometheus/grafana/etc.
in `docker-compose.yml` when you need staging metrics.

## Tenant provisioning in staging

Requires shared infra stack (`stockix-shared`) to be running. Verify:
```bash
docker stack services stockix-shared
# MySQL, MongoDB, Redis, ProxySQL must all be healthy
```

E2E failure injection (`e2e-fail-inject-*` slugs) works in staging because `NODE_ENV=staging` is set.
It is disabled in production (`NODE_ENV=production` short-circuits the injection check).

## Deploy pipeline

- Branch: `staging` → `.github/workflows/deploy-staging.yml`
- Manual: follow the deploy command above from repo root on the staging server

## Reset policy

Weekly or before major releases:

```bash
docker stack rm stockix-staging
# Wait for all containers to stop
docker volume ls | grep stockix-staging | awk '{print $2}' | xargs docker volume rm
# Redeploy
docker stack deploy -c infra/prod/docker-compose.yml -c infra/staging/docker-compose.yml \
  --env-file infra/staging/.env stockix-staging
pnpm --filter @repo/db db:migrate
```
