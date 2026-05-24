v# Services

## Stockix (`stockix/`)

This directory contains a **vendored copy** of upstream [Stockix](#-finance) (not a git submodule).

**Pinned revision:** tag `v0.9.9`, commit `485138344c6b266c2034214d6f1233259adf6c32`.

Stockix **does not** embed Stockix into Next.js apps. The control plane (`apps/api`, `apps/dashboard`) will orchestrate tenants **around** this runtime using APIs and automation you add later—not by importing Stockix source from `apps/*`.

To track your own changes, add a **GitHub fork** as a remote only if you use git inside this folder; the Stockix repo stores Stockix as normal files so the whole tree is versioned with Stockix.

### Run Stockix

Follow Stockix’s own documentation (Docker, env, database) in `services/stockix-finance/README.md` and [their docs](#/). Stockix does not replace that setup.

### Updating the vendored version

Replace the contents of `services/stockix-finance` with a fresh export from upstream at the desired tag/commit, then commit the diff in Stockix. Prefer doing this in a dedicated PR because the change set can be large.

## Boundary

| Area | Location |
|------|----------|
| Platform (API, dashboard, workers, Postgres control plane) | `apps/*`, `packages/*`, `infra/*` |
| Vendored finance runtime (Nest + webapp + tenant Docker stack) | `services/stockix-finance` only |

Provisioning (`tenant.provision` jobs) uses **`REPO_ROOT`** and optional **`STOCKIX_TENANT_APP_ROOT`** from the **repo root** `.env` (see `infra/worker-service/domain/provision-paths.ts`). It writes per-tenant env under **`TENANT_ENV_ROOT`** / default `~/.stockix/tenants` — not `services/stockix-finance/.env`, which is for **local** finance dev only.

The tenant compose file (`infra/tenant-stack/docker-compose.yml`) builds **nginx**, **server**, **webapp**, **mysql** (MariaDB), and **redis** from `${STOCKIX_TENANT_APP_ROOT}`; **mongo** uses the **`mongo:5.0`** image so a missing `docker/mongo` folder does not block provisioning. Bind mounts expect `docker/certbot/certs` and `data/logs/nginx` under that root (tracked as empty dirs in the clone).
