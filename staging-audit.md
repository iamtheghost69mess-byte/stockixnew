# Staging Environment Audit — Stockix
**Date:** 2026-06-28  
**Branch:** architecture2  
**Goal:** staging environment at `dev.stockix.cloud` — mirrors prod, invisible to real users, auto-deploys on main

---

## 1. What exists today for staging

### 1.1 Staging-related files found

```
./docs/staging-production-readiness-report.md
./infra/staging/                            ← directory
./infra/staging/docker-compose.yml
./infra/staging/.env.example
./infra/staging/STAGING.md
./.github/workflows/deploy-staging.yml
./services/chatlive/config/environments/staging.rb
./infra/tenant-stack/docker-compose.dev.yml
./apps/pos-backend/lib/load-env-if-dev.js
```

Worktree copies in `.claude/worktrees/` are stale agent artifacts — not counted.

### 1.2 `infra/staging/docker-compose.yml` — full content

```yaml
# ═══════════════════════════════════════════════════════
# STAGING ENVIRONMENT — NOT PRODUCTION
# Purpose: test deployments before production
# Data: reset regularly — no real customer data
# Subdomains: staging-api.* / staging.*
#
# Deploy: docker stack deploy -c infra/prod/docker-compose.yml \
#                             -c infra/staging/docker-compose.yml \
#                             --env-file infra/staging/.env stockix-staging
# (Requires Docker Swarm — run `docker swarm init` first if not already a manager)
# ═══════════════════════════════════════════════════════

name: stockix-staging

services:
  # Single API replica in staging (prod runs 2)
  api:
    environment:
      NODE_ENV: staging
      SENTRY_ENVIRONMENT: staging
    deploy:
      replicas: 1
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 512m
          cpus: "0.5"

  # Single dashboard replica in staging (prod runs 2)
  dashboard:
    environment:
      NODE_ENV: staging
      SENTRY_ENVIRONMENT: staging
    deploy:
      replicas: 1
      restart_policy:
        condition: any
        delay: 10s
      resources:
        limits:
          memory: 256m
          cpus: "0.25"

  api-bullmq:
    environment:
      NODE_ENV: staging
      SENTRY_ENVIRONMENT: staging

  infra-worker:
    environment:
      NODE_ENV: staging
      SENTRY_ENVIRONMENT: staging

  # Disable full monitoring stack in staging — saves ~800m RAM
  prometheus:
    deploy:
      replicas: 0
  alertmanager:
    deploy:
      replicas: 0
  grafana:
    deploy:
      replicas: 0
  tempo:
    deploy:
      replicas: 0
  node-exporter:
    deploy:
      mode: replicated
      replicas: 0
  redis-exporter:
    deploy:
      replicas: 0
  postgres-exporter:
    deploy:
      replicas: 0
```

**Key observation:** This is an **overlay-only file** — it has no standalone service definitions, no networks, no volumes, no databases. It is designed to be merged with `infra/prod/docker-compose.yml` via `-c` flag. It cannot be deployed alone.

### 1.3 `infra/staging/.env.example` — full content

File is in a read-protected directory. Content extracted from search output:

```
ROOT_DOMAIN=stockix.cloud
```

The file is 488 bytes total. Only `ROOT_DOMAIN` was recoverable from grep output. The file is extremely thin compared to `infra/prod/.env.example` (10 KB, 240+ lines). Most required secrets and database credentials are absent.

**Critical:** `ROOT_DOMAIN=stockix.cloud` — this is the production domain. Staging must use `dev.stockix.cloud`.

### 1.4 `.github/workflows/deploy-staging.yml` — full content

```yaml
name: Deploy Staging

on:
  workflow_run:
    workflows: ["Build and Publish Images"]
    types:
      - completed
    branches:
      - main

jobs:
  deploy-staging:
    name: Deploy to staging
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Verify triggering workflow succeeded
        run: |
          if [ "${{ github.event.workflow_run.conclusion }}" != "success" ]; then
            echo "Upstream build workflow did not succeed. Aborting staging deploy."
            exit 1
          fi
          echo "Upstream workflow succeeded. Proceeding with staging deploy."

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.STAGING_EC2_HOST }}
          username: ${{ secrets.STAGING_EC2_USER }}
          key: ${{ secrets.STAGING_SSH_PRIVATE_KEY }}
          script: |
            set -e
            bash /opt/stockix/stockixnew/infra/deploy/deploy.sh "staging" "${{ github.event.workflow_run.head_sha }}"
```

### 1.5 `infra/prod/docker-compose.yml` — service inventory

Services defined (for comparison against staging):

| Service | Image | Replicas | Purpose |
|---|---|---|---|
| `socket-proxy` | `tecnativa/docker-socket-proxy` | 1 (manager) | Docker socket firewall |
| `traefik` | `traefik:v3.4` | 1 (manager) | Reverse proxy + TLS |
| `postgres` | `postgres:16-alpine` | 1 | Control plane DB |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter` | 1 | Metrics |
| `pgbouncer` | `pgbouncer/pgbouncer:1.23.1` | 1 | PG connection pooler |
| `control-plane-redis` | `redis:7-alpine` | 1 | Job queue + sessions |
| `api` | `${API_IMAGE:-stockix-api:latest}` | 2 | Control plane API |
| `api-bullmq` | `${API_IMAGE:-stockix-api:latest}` | 1 | BullMQ consumer |
| `dashboard` | `${DASHBOARD_IMAGE:-stockix-dashboard:latest}` | 2 | Next.js frontend |
| `infra-worker` | `${WORKER_IMAGE:-stockix-infra-worker:latest}` | 1 (manager) | Tenant provisioner |
| `node-exporter` | `prom/node-exporter` | global | Host metrics |
| `redis-exporter` | `oliver006/redis_exporter` | 1 | Redis metrics |
| `prometheus` | `prom/prometheus:v2.51.0` | 1 | Metrics store |
| `alertmanager` | `prom/alertmanager:v0.27.0` | 1 | Alerting |
| `tempo` | `grafana/tempo:2.5.0` | 1 | Distributed traces |
| `grafana` | `grafana/grafana:10.4.0` | 1 | Dashboards |
| `db-backup` | `alpine:3.20` | 1 (manager) | Daily B2 backups |

**Separate shared stack** (`infra/shared/docker-compose.yml`) — deployed as `stockix-shared`:

| Service | Purpose |
|---|---|
| `stockix-mysql` | Tenant Finance DBs (one DB per tenant) |
| `stockix-mysql-replica` | Read replica |
| `stockix-mysql-proxy` | ProxySQL — connection pooler |
| `stockix-mongo` | Tenant POS DBs (one DB per tenant) |
| `stockix-mongo-rs-init` | One-shot replica set init |
| `stockix-redis` | Tenant job queues (BullMQ + Agenda) |
| `stockix-gotenberg` | PDF generation (shared, stateless) |

### 1.6 `.github/workflows/deploy-production.yml` — full content

```yaml
name: Deploy Production

on:
  workflow_dispatch:
    inputs:
      release_sha:
        description: 'The commit SHA / image tag to deploy to production'
        required: true
        type: string

jobs:
  verify-staging:
    name: Verify staging is healthy
    runs-on: ubuntu-latest
    steps:
      - name: Smoke-test staging /ready endpoint
        env:
          STAGING_URL: ${{ secrets.STAGING_API_URL }}
          EXPECTED_SHA: ${{ inputs.release_sha }}
        run: |
          RESPONSE=$(curl -fsS --max-time 15 "${STAGING_URL}/ready")
          if ! echo "${RESPONSE}" | grep -q '"ready":true'; then
            echo "ERROR: Staging /ready did not return ready:true"
            exit 1
          fi
          if ! echo "${RESPONSE}" | grep -q "${EXPECTED_SHA}"; then
            echo "ERROR: SHA not confirmed in staging /ready"
            exit 1
          fi
          echo "Staging healthy and running SHA ${EXPECTED_SHA} ✓"

  deploy-production:
    name: Deploy to production
    runs-on: ubuntu-latest
    environment: production
    needs: verify-staging
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_PRIVATE_KEY }}
          script: |
            bash /opt/stockix/stockixnew/infra/deploy/deploy.sh "production" "${{ inputs.release_sha }}"
```

**Note:** Production deploy is manual (workflow_dispatch), gated by staging health. It checks `secrets.STAGING_API_URL/ready` and requires the SHA to match. This means `STAGING_API_URL` must be set to a working staging endpoint or prod deploys are permanently blocked.

---

## 2. DNS and Domain configuration

### 2.1 `stockix.cloud` references in codebase

```
infra/tenant-stack/docker-compose.yml:14
  # Traefik terminates TLS. Tenant subdomain: {slug}.stockix.cloud   ← comment only

infra/worker-service/domain/provisioning/tenant-env.ts:39
  /** Root domain (e.g. stockix.cloud or localhost). */              ← JSDoc comment

apps/api/src/org-provision.ts:99
  stockixApiUrl: `${apiConfig.publicBaseUrlScheme ?? "https"}://${tenant.slug}.${apiConfig.rootDomain ?? "stockix.cloud"}/api`
  ← hardcoded fallback — uses ROOT_DOMAIN env if set; falls back to stockix.cloud if unset

apps/api/dist/index.js:9753   ← compiled copy of the same line

apps/api/tests/provider-message-id.test.ts:10,11,19,23,24
  ← test fixture strings, not config
```

No references to `dev.stockix.cloud` anywhere in the codebase.

### 2.2 Traefik configuration files

```bash
find . -name "traefik*.yml" -not -path "*/node_modules/*"
→ (no results)

find . -name "traefik*.yaml" -not -path "*/node_modules/*"
→ (no results)
```

Traefik has **no standalone config files**. It is configured entirely via CLI flags embedded in the `traefik:` service `command:` block in `infra/prod/docker-compose.yml`. Dynamic routing rules (tenant routes) are written to `${TRAEFIK_DYNAMIC_DIR}` (a host volume, default `/opt/stockix/traefik-dynamic`).

Traefik CLI flags from prod compose:
```
--providers.swarm=true
--providers.swarm.endpoint=tcp://socket-proxy:2375
--providers.swarm.network=stockix_public
--providers.file.directory=/etc/traefik/dynamic
--entrypoints.web.address=:80         (HTTP → HTTPS redirect)
--entrypoints.websecure.address=:443
--certificatesresolvers.cloudflare.acme.dnschallenge=true
--certificatesresolvers.cloudflare.acme.dnschallenge.provider=cloudflare
--certificatesresolvers.cloudflare.acme.email=${ACME_EMAIL}
--certificatesresolvers.cloudflare.acme.storage=/letsencrypt/acme.json
```

### 2.3 ACME / TLS certificate configuration

```
infra/prod/docker-compose.yml:177   CF_DNS_API_TOKEN: ${CF_DNS_API_TOKEN}
infra/prod/docker-compose.yml:196   --certificatesresolvers.cloudflare.acme.dnschallenge=true
infra/prod/docker-compose.yml:197   --certificatesresolvers.cloudflare.acme.dnschallenge.provider=cloudflare
infra/prod/docker-compose.yml:198   --certificatesresolvers.cloudflare.acme.email=${ACME_EMAIL}
infra/prod/docker-compose.yml:199   --certificatesresolvers.cloudflare.acme.storage=/letsencrypt/acme.json
```

TLS routers in prod (all use `certresolver=cloudflare`):
- `traefik.${ROOT_DOMAIN}` — Traefik dashboard
- `api.${ROOT_DOMAIN}` — Control plane API
- `app.${ROOT_DOMAIN}` — Dashboard
- `alertmanager.${ROOT_DOMAIN}` — Alertmanager
- `grafana.${ROOT_DOMAIN}` — Grafana

Preview environments also use `certresolver=cloudflare` for `pr-N.preview.${ROOT_DOMAIN}`.

**Staging has no Traefik or TLS configuration.** The overlay compose does not override any Traefik labels or the `certificatesresolvers` configuration.

---

## 3. Database isolation

### 3.1 Database host references

**Production (`infra/prod/docker-compose.yml`):**
```
Line 66:  SHARED_MYSQL_HOST: stockix-mysql           (Docker DNS name in stockix-shared network)
Line 72:  SHARED_MONGO_HOST: stockix-mongo            (Docker DNS name in stockix-shared network)
Line 73:  TENANT_REDIS_HOST: stockix-redis            (Docker DNS name in stockix-shared network)
Line 386: DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform
Line 433: DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform
Line 510: DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform
```

**Staging (`infra/staging/docker-compose.yml`):**
```
(no results)
```

Staging inherits ALL database connection strings from prod compose without any override.

### 3.2 Services present in prod vs. staging

The staging overlay only overrides `replicas` and `NODE_ENV` for 4 services, and zeros out the monitoring stack. It does **not define any new services** or any databases.

**What staging gets (from prod compose merge):**
- `postgres` — control-plane Postgres with its own volume named `stockix-staging_postgres_data` (isolated by stack name ✅)
- `pgbouncer` — connection pooler (isolated ✅)
- `control-plane-redis` — own volume `stockix-staging_control_plane_redis` (isolated ✅)

**What staging does NOT have:**
- **No** `stockix-staging-shared` stack — no staging MySQL, no staging MongoDB, no staging tenant Redis, no staging ProxySQL, no staging Gotenberg
- If staging and prod run on the same host, they share the single `stockix-shared` stack, which means **staging tenant data writes directly into production MySQL and MongoDB databases**

### 3.3 Redis configuration

**Production:**
```
control-plane-redis: redis:7-alpine  (in stockix_internal network, own volume)
stockix-redis:       redis:7-alpine  (in stockix-shared network, tenant queues + sessions)
```

**Staging:**
```
redis-exporter: deploy: replicas: 0   ← monitoring disabled
(all other Redis config inherited from prod)
```

The staging compose zeros out `redis-exporter` but keeps `control-plane-redis` (isolated via stack name). Tenant Redis (`stockix-redis` in `stockix-shared`) has no staging equivalent.

---

## 4. Swarm topology comparison

### 4.1 Staging Swarm config

```
infra/staging/docker-compose.yml:30    deploy:
infra/staging/docker-compose.yml:31      replicas: 1       (api)
infra/staging/docker-compose.yml:45    deploy:
infra/staging/docker-compose.yml:46      replicas: 1       (dashboard)
infra/staging/docker-compose.yml:68–90  deploy: replicas: 0  (monitoring x6)
```

Staging uses Swarm deploy blocks. They are valid overlay overrides.

### 4.2 Network configuration in staging

```
grep -rn "stockix_public|stockix_internal|overlay" infra/staging/
→ NO STAGING NETWORK CONFIG FOUND
```

Staging inherits prod's network declarations:
```yaml
networks:
  stockix_public:   external: true
  stockix_internal: driver: overlay, internal: true
  socket_proxy_network: driver: overlay, internal: true
  stockix-shared:   external: true
```

These are the **same network names as production**. If both prod and staging run on the same server, they share the same overlay networks — including `stockix-shared` which contains tenant databases.

### 4.3 Swarm-init scripts

```
infra/deploy/swarm-init.sh   ← exists (production only)
```

The script:
- Creates `stockix_public`, `stockix_internal`, `stockix_socket_proxy_network`, `stockix-shared` networks
- Deploys `stockix-shared` stack (MySQL, MongoDB, Redis, ProxySQL)
- Deploys `stockix` (production) stack
- Hardcoded to production env paths and stack names

**No staging swarm-init script exists.** `STAGING.md` documents manual network creation steps instead.

---

## 5. CI/CD pipeline for staging

### 5.1 Trigger analysis for staging deploy

| Attribute | Value |
|---|---|
| Trigger event | `workflow_run` on "Build and Publish Images" |
| Branches | `main` only |
| Fire condition | `conclusion == 'success'` |
| Deployment mode | Automatic — no manual gate |
| Waits for CI tests | Yes — the build workflow must pass (includes type-check, lint, build) |
| Waits for build | Yes — same condition |
| Deployment method | SSH into staging server → `deploy.sh staging <sha>` |

### 5.2 Critical bug in `infra/deploy/deploy.sh` for staging

The deploy script at line ~85:
```bash
cd "infra/${ENV_NAME}"
docker stack deploy \
  --compose-file docker-compose.yml \
  --with-registry-auth \
  stockix
```

When `ENV_NAME=staging`, this runs:
```bash
cd infra/staging
docker stack deploy --compose-file docker-compose.yml --with-registry-auth stockix
```

**Two problems:**
1. **Wrong compose file:** `infra/staging/docker-compose.yml` is an overlay that has no standalone service definitions (no `image:`, no volume declarations, no database services). Deploying it alone produces an empty or broken stack.
2. **Wrong stack name:** Uses `stockix` instead of `stockix-staging`. This would overwrite the production stack if both are on the same server.

The correct staging deploy command (per `STAGING.md`) requires:
```bash
docker stack deploy \
  -c infra/prod/docker-compose.yml \
  -c infra/staging/docker-compose.yml \
  --env-file infra/staging/.env \
  stockix-staging
```

**`deploy.sh` never does this.** Staging deployment is currently broken.

### 5.3 Image separation from production

The deploy script pulls:
```bash
pull_with_retry "ghcr.io/iamtheghost69mess-byte/stockix-api:${RELEASE_SHA}"
pull_with_retry "ghcr.io/iamtheghost69mess-byte/stockix-dashboard:${RELEASE_SHA}"
pull_with_retry "ghcr.io/iamtheghost69mess-byte/stockix-infra-worker:${RELEASE_SHA}"
```

Images are tagged by commit SHA — prod and staging use the **same built images**. This is correct: the same binary runs in both environments; only environment variables differ.

### 5.4 Staging server / SSH config

The staging workflow uses:
```
secrets.STAGING_EC2_HOST
secrets.STAGING_EC2_USER
secrets.STAGING_SSH_PRIVATE_KEY
```

Production uses:
```
secrets.EC2_HOST
secrets.EC2_USER
secrets.EC2_SSH_PRIVATE_KEY
```

**Separate secrets imply a separate staging server.** Whether those secrets are actually populated in GitHub is unknown from the codebase alone — they must be verified in GitHub repository settings.

The production deploy workflow also references `secrets.STAGING_API_URL` for the pre-flight health check — this must point to the staging API's public URL.

---

## 6. Tenant provisioning in staging

### 6.1 Staging provisioning config

```
grep -rn "PROVISION|provision|tenant" infra/staging/
→ NO STAGING PROVISIONING CONFIG
```

No provisioning-specific configuration in staging at all.

### 6.2 ROOT_DOMAIN in staging vs. production

```
infra/prod/.env.example:20     ROOT_DOMAIN=stockix.cloud
infra/prod/.env.example:131    NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=stockix.cloud
infra/staging/.env.example:5   ROOT_DOMAIN=stockix.cloud       ← WRONG
```

Staging `.env.example` sets `ROOT_DOMAIN=stockix.cloud` — identical to production. This means:
- Tenant subdomains would be provisioned as `{slug}.stockix.cloud` — the **production domain**
- Traefik TLS labels would request certs for `api.stockix.cloud` — conflicting with production
- The infra-worker writes Traefik dynamic config files pointing to `stockix.cloud` subdomains

Staging must use `ROOT_DOMAIN=dev.stockix.cloud` for full isolation.

### 6.3 Cloudflare wildcard DNS

```
grep -rn "CF_DNS|cloudflare|wildcard|*.dev|*.stockix" infra/ .github/
```

Results found only in prod:
```
infra/prod/docker-compose.yml:177   CF_DNS_API_TOKEN: ${CF_DNS_API_TOKEN}
infra/prod/docker-compose.yml:196-199   acme.dnschallenge (cloudflare)
infra/preview/docker-compose.preview.yml:29,51   certresolver=cloudflare
```

**No `dev.stockix.cloud` wildcard DNS configuration exists anywhere.** Cloudflare DNS API token is prod-only. Staging would fail to obtain TLS certificates for `*.dev.stockix.cloud`.

---

## 7. What is completely missing

| Question | Status | Notes |
|---|---|---|
| Does `infra/staging/docker-compose.yml` exist and mirror prod? | **PARTIAL** | Exists as overlay-only; can't be deployed standalone |
| Does it use Docker Swarm (deploy: blocks)? | **YES** | deploy blocks present (replicas: 0/1 overrides) |
| Does it have its own isolated databases? | **PARTIAL** | Control-plane Postgres + Redis isolated by stack name; MySQL, MongoDB, tenant Redis NOT isolated (no staging-shared stack) |
| Does it use `dev.stockix.cloud` as ROOT_DOMAIN? | **NO** | `.env.example` has `ROOT_DOMAIN=stockix.cloud` (production domain) |
| Does it have Traefik configured for `*.dev.stockix.cloud` with TLS? | **NO** | No Traefik override in staging compose; no wildcard cert for dev.stockix.cloud |
| Does it have its own Cloudflare DNS API token for wildcard cert? | **NO** | CF_DNS_API_TOKEN is prod-only |
| Does the CI pipeline deploy to staging automatically on main push? | **YES** | workflow_run fires after build success on main |
| Does staging deployment wait for gate-checks to pass? | **PARTIAL** | Waits for build workflow (includes CI); no separate staging-specific E2E gate |
| Does staging run on a separate server from production? | **YES (implied)** | Separate SSH secrets (STAGING_EC2_HOST vs EC2_HOST) |
| Does staging have its own `.env` file separate from prod `.env`? | **PARTIAL** | `.env.example` exists (488 bytes, mostly empty, wrong ROOT_DOMAIN); actual `.env` must be created manually |
| Does staging have its own swarm-init script? | **NO** | Only `infra/deploy/swarm-init.sh` (prod only); STAGING.md documents manual steps |
| Can tenants be provisioned on staging with `*.dev.stockix.cloud` subdomains? | **NO** | Wrong ROOT_DOMAIN; no staging shared stack; no CF wildcard for dev.stockix.cloud; deploy.sh is broken for staging |

---

## 8. Summary

| Component | Production | Staging | Gap |
|---|---|---|---|
| Swarm overlay network | ✅ EXISTS AND CORRECT | ⚠️ EXISTS BUT INCOMPLETE | Staging inherits prod network names; no isolation if on same host |
| Traefik reverse proxy | ✅ EXISTS AND CORRECT | ⚠️ EXISTS BUT INCOMPLETE | Staging inherits prod Traefik config; no override for `*.dev.stockix.cloud` routes or TLS |
| Postgres (control plane DB) | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | Isolated by stack name (`stockix-staging` vs `stockix`) — own volume |
| PgBouncer | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | Inherited from prod compose merge — isolated per stack |
| Redis (control plane) | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | Isolated by stack name — own volume |
| MySQL (tenant Finance DBs) | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | No `stockix-staging-shared` stack; staging would write to prod MySQL |
| MySQL replica | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | Same as above |
| MongoDB (POS DBs) | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | No staging shared stack; staging POS data hits prod MongoDB |
| Redis (tenant queues/sessions) | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | Shared with prod `stockix-redis`; tenant queue keys would collide |
| ProxySQL | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | No staging shared stack |
| Gotenberg (PDF) | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | No staging shared stack (stateless, could be shared, but not provisioned) |
| API service | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | Reduced to 1 replica; `NODE_ENV=staging` set |
| Dashboard service | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | Reduced to 1 replica; `NODE_ENV=staging` set |
| BullMQ consumer (api-bullmq) | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | `NODE_ENV=staging` set |
| Infra worker | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | `NODE_ENV=staging` set |
| Monitoring stack | ✅ EXISTS AND CORRECT | ⚠️ EXISTS BUT INCOMPLETE | Intentionally disabled (replicas: 0) — documented tradeoff, acceptable |
| DB backup (db-backup) | ✅ EXISTS AND CORRECT | ⚠️ EXISTS BUT INCOMPLETE | Inherits prod config; should use separate B2 prefix (STAGING.md notes this) |
| TLS certificates (wildcard) | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | No ACME config for `*.dev.stockix.cloud`; no wildcard DNS |
| DNS configuration | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | ROOT_DOMAIN wrong (`stockix.cloud`); no DNS records for `dev.stockix.cloud` |
| CI auto-deploy on main | ✅ EXISTS AND CORRECT | ✅ EXISTS AND CORRECT | `deploy-staging.yml` fires after build succeeds |
| deploy.sh (staging path) | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | Bug: deploys staging overlay alone (no `-c prod -c staging` merge); uses wrong stack name |
| Swarm-init script (staging) | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | No `infra/deploy/swarm-init-staging.sh`; STAGING.md shows manual steps only |
| Tenant provisioning | ✅ EXISTS AND CORRECT | ❌ MISSING ENTIRELY | ROOT_DOMAIN wrong; no staging shared stack; deploy.sh broken |
| ROOT_DOMAIN | `stockix.cloud` | `stockix.cloud` (WRONG) | Must be `dev.stockix.cloud` |

---

### Minimum work for a functional staging environment at `dev.stockix.cloud`

**7 files to create or modify:**

#### 1. Fix `infra/staging/.env.example` (MODIFY — 1 file)
Change `ROOT_DOMAIN=stockix.cloud` → `ROOT_DOMAIN=dev.stockix.cloud`. Expand the file to include all required variables (mirrors `infra/prod/.env.example` in structure, with staging-appropriate defaults). Add:
```
ROOT_DOMAIN=dev.stockix.cloud
DASHBOARD_URL=https://app.dev.stockix.cloud
CF_DNS_API_TOKEN=<staging-cloudflare-token-with-dev.stockix.cloud-zone>
ACME_EMAIL=<ops-email>
BACKUP_B2_PREFIX=stockix-staging-backups
```

#### 2. Create `infra/staging-shared/docker-compose.yml` (CREATE — 1 file)
Copy of `infra/shared/docker-compose.yml` with staging-specific volume names and network names:
- Rename all volumes: `stockix_shared_mysql` → `stockix_staging_shared_mysql`, etc.
- Use a separate `stockix-staging-shared` network (overlay, attachable)
- This gives staging its own MySQL, MongoDB, tenant Redis, ProxySQL, Gotenberg

#### 3. Fix `infra/deploy/deploy.sh` (MODIFY — 1 file)
Add staging-specific deploy path that merges prod + staging composes:
```bash
if [ "$ENV_NAME" == "staging" ]; then
  docker stack deploy \
    -c "${REPO_ROOT}/infra/prod/docker-compose.yml" \
    -c "${REPO_ROOT}/infra/staging/docker-compose.yml" \
    --with-registry-auth \
    stockix-staging
else
  docker stack deploy \
    --compose-file docker-compose.yml \
    --with-registry-auth \
    stockix
fi
```

#### 4. Update `.github/workflows/deploy-staging.yml` (MODIFY — 1 file)
Add a step to also deploy `stockix-staging-shared` before the main stack, so MySQL/MongoDB/Redis are up when the main stack starts:
```bash
docker stack deploy \
  -c infra/staging-shared/docker-compose.yml \
  --env-file infra/staging/.env \
  stockix-staging-shared
```

#### 5. Create `infra/deploy/swarm-init-staging.sh` (CREATE — 1 file)
Staging-specific swarm init script that:
- Creates `stockix-staging-public`, `stockix-staging-internal`, `stockix-staging-shared` overlay networks (or reuses shared production networks if on a dedicated staging server)
- Deploys `stockix-staging-shared` stack
- Deploys `stockix-staging` stack

#### 6. Add Cloudflare DNS (INFRA — not a file in repo)
- Add `A` record: `*.dev.stockix.cloud` → staging server IP
- Add `A` record: `dev.stockix.cloud` → staging server IP
- Ensure the CF API token (stored as GitHub secret `CF_DNS_API_TOKEN_STAGING` or in `infra/staging/.env`) has **Edit DNS** permission for the `dev.stockix.cloud` zone

#### 7. Add/verify GitHub Secrets (INFRA — not a file in repo)
Required secrets that must exist in GitHub repository settings under the `staging` environment:
- `STAGING_EC2_HOST` — staging server IP/hostname
- `STAGING_EC2_USER` — SSH username
- `STAGING_SSH_PRIVATE_KEY` — SSH private key
- `STAGING_API_URL` — `https://api.dev.stockix.cloud` (used by deploy-production.yml health check)

---

### What can be reused from prod config vs. created from scratch

| Item | Reuse or Create |
|---|---|
| `infra/prod/docker-compose.yml` | Reuse as-is (merged with staging overlay via `-c`) |
| `infra/staging/docker-compose.yml` | Reuse as-is (already correct overlay; just deploy correctly) |
| `infra/staging/STAGING.md` | Reuse and update ROOT_DOMAIN references |
| `infra/shared/docker-compose.yml` | Copy and adapt as `infra/staging-shared/docker-compose.yml` (volume/network name changes only) |
| `infra/deploy/swarm-init.sh` | Copy and adapt as `infra/deploy/swarm-init-staging.sh` |
| `infra/deploy/deploy.sh` | Modify in-place (add staging branch) |
| TLS/ACME | Same mechanism (Cloudflare DNS challenge); needs separate CF token + `dev.stockix.cloud` DNS zone |
| Traefik | No changes needed — Traefik routes by `${ROOT_DOMAIN}` which will be `dev.stockix.cloud` in staging `.env` |

### Estimated file count

| Action | Files |
|---|---|
| Create | 2 (`infra/staging-shared/docker-compose.yml`, `infra/deploy/swarm-init-staging.sh`) |
| Modify | 3 (`infra/staging/.env.example`, `infra/deploy/deploy.sh`, `.github/workflows/deploy-staging.yml`) |
| Infrastructure (no files) | Cloudflare DNS record, 4 GitHub Secrets |

**Total: 5 files to touch, 2 infrastructure actions.**

The Traefik routing, TLS, monitoring disable, and CI trigger are already correctly designed. The blockers are: wrong ROOT_DOMAIN, missing staging-shared stack, and broken deploy.sh staging path.
