# Tenant stack (BigCapital) — **single source of truth**

**One compose file:** `docker-compose.yml` only. There are no `local-*.yml` overrides.

### Docker compose build defaults

Interpolation variables for **`docker compose build`** live in **`env/development/tenant-docker-build.env`** (committed). CI can override any key via environment.

### Pull base images (browserless, Postgres alpine, optional registry mirror)

```bash
pnpm images:pull
```

If CI publishes images matching `scripts/stockix-docker-pull.mjs` naming, set **`STOCKIX_BC_PULL_PREFIX`** and **`STOCKIX_BC_TAG`**, then run **`pnpm images:pull`**. To skip building locally afterward: **`STOCKIX_BC_SKIP_LOCAL_BUILD=1 pnpm provision:prepull`**.

## Nginx upstreams (Docker DNS — mandatory for stable routing)

The vendored **`services/bigcapital/docker/nginx/sites/server.template`** configures **`resolver 127.0.0.11`** and **`proxy_pass`** via **`$variables`** so **`server`** and **`webapp`** are **re-resolved** when containers get a new IP. Without this, nginx can keep an old IP and return **502** / “No route to host” after **`server`** restarts.

Rebuild **nginx** after changing that template:

```bash
docker compose -p stockix-<slug> -f infra/tenant-stack/docker-compose.yml \
  --env-file <path-to-tenant>/.env build nginx --no-cache && \
docker compose -p stockix-<slug> -f infra/tenant-stack/docker-compose.yml \
  --env-file <path-to-tenant>/.env up -d nginx
```

Or **`pnpm images:tenant`** (includes nginx). **Do not** rely on manually restarting nginx on every server restart once this image is deployed.

### Full stack repair (MySQL + nginx + recreate + health check)

From the monorepo root (same machine that runs Docker for the tenant):

```bash
pnpm repair:tenant -- <slug>
```

Runs **MySQL `ALTER USER` alignment**, **rebuilds `nginx`**, **`docker compose up -d --force-recreate` for the entire tenant project** (all services — fixes 502 / stale upstream / partial cold starts), then waits up to **~10 minutes** for **`/api/ping/`** (each probe uses **curl -m 45s** by default).

Options: **`--skip-mysql`**, **`--no-nginx-build`**, **`--rebuild-images`** (also build `server`, `webapp`, `database_migration`), **`--light`** (old behavior: only `server`+`nginx`, 2 min wait, 8s curl).

Env: **`REPAIR_PING_DEADLINE_MS`**, **`REPAIR_CURL_MAX_SEC`** (override wait / per-request curl timeout).

## Canonical image names

All built from **`BIGCAPITAL_ROOT`** (vendored `services/bigcapital`), tagged with **`STOCKIX_BC_TAG`** (default **`latest`**).

| Service | Image |
|---------|--------|
| Webapp | `stockix/bigcapital-webapp:${STOCKIX_BC_TAG}` |
| API server | `stockix/bigcapital-server:${STOCKIX_BC_TAG}` |
| Nginx (edge to webapp+server) | `stockix/bigcapital-nginx:${STOCKIX_BC_TAG}` |
| DB migrations (one-shot) | `stockix/bigcapital-migration:${STOCKIX_BC_TAG}` |

Set **`STOCKIX_BC_TAG`** in the tenant `.env` (provisioner copies from **`STOCKIX_BC_TAG`** in `apps/api/.env`, default `latest`) to pin a release in production.

**CI / registry:** build on the tag above, then push to your registry, e.g. `ghcr.io/<org>/bigcapital-webapp:1.4.0`, and set **`STOCKIX_BC_TAG=1.4.0`** (or use a `STOCKIX_IMAGE_PREFIX` pattern in a future change if you need full registry paths).

## Build all images (from monorepo root)

```bash
pnpm images:tenant
```

Faster iteration (no server image):

```bash
node scripts/build-stockix-tenant-images.mjs --minimal
```

**Before first provision** (pull browserless + build above):

```bash
pnpm provision:prepull
```

### Fresh rebuild (scrub Stockix images + build cache → rebuild)

Use when layers are corrupted, tags are confused, or you want a clean baseline before tagging for production:

```bash
pnpm images:fresh
```

This removes local **`stockix/bigcapital-*`** for **`STOCKIX_BC_TAG`** (and **`latest`** when the tag is not `latest`), prunes dangling images, runs **`docker builder prune -af`**, **`pnpm images:pull`**, then **`pnpm images:tenant`**.

To remove **every unused image** on the host (not only Stockix — destructive):

```bash
STOCKIX_CONFIRM_DOCKER_NUKE=1 pnpm images:fresh -- --prune-all-unused-images --yes
```

Stop tenant stacks first if Docker reports images are still in use (**`docker compose -p stockix-<slug> down`**).

## Run a tenant

```bash
docker compose \
  -p stockix-<slug> \
  -f infra/tenant-stack/docker-compose.yml \
  --env-file /path/to/tenants/<slug>/.env \
  up -d
```

### 502 on `/api/ping` while `server` keeps restarting

Nginx returns **502** when the **`server`** container is not listening on port 3000. Check **`docker logs stockix-<slug>-server-1`**.

If logs show **`SyntaxError: Unexpected token '||='`** (or similar), the runtime **Node version is too old** for a transitive dependency — rebuild **`stockix/bigcapital-server`** from the current **`packages/server/Dockerfile`** (uses Node 20). Then **`pnpm repair:tenant -- <slug> --rebuild-images`** or **`docker compose … build server && … up -d --force-recreate server`**.

## When to rebuild

| Change | Action |
|--------|--------|
| Anything under `packages/webapp` | `pnpm images:tenant` (or `--minimal` if you only need UI) |
| `packages/server` | `pnpm images:tenant` |
| `docker/nginx` | `pnpm images:tenant` |
| `docker/migration` | `pnpm images:tenant` |

---

See **`../DEVOPS-HANDOFF.md`** for full production steps.
