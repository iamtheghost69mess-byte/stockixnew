# Stockix — DevOps deployment handoff

**Purpose:** Single-VPS deployment for **`stockix.cloud`** (DNS via Cloudflare). Hand this document to DevOps as the authoritative runbook.

**Repository:** Stockix monorepo — control plane (`apps/api`, `apps/dashboard`), vendored BigCapital runtime (`services/bigcapital`), per-tenant Docker stacks (`infra/tenant-stack/docker-compose.yml`).

---

## 1. Architecture (what runs where)

| Layer | Component | Notes |
|-------|-----------|--------|
| **Edge** | Cloudflare | DNS (and optionally proxy + TLS to origin). Coordinate SSL mode with origin (see §7). |
| **Origin (VPS)** | Reverse proxy | **Traefik** (planned) or publish tenant **`PUBLIC_PROXY_PORT`** until Traefik labels + shared Docker network are implemented. Tenant nginx is **HTTP only** (`WEB_SSL=false`); TLS terminates at edge/proxy. |
| **Origin** | Stockix API | Node (`apps/api`) — Postgres metadata, provisions tenants, runs `docker compose`. |
| **Origin** | Stockix Dashboard | Next.js (`apps/dashboard`) — browser calls API via **`NEXT_PUBLIC_STOCKIX_API_URL`**. |
| **Origin** | Platform DB | PostgreSQL — Stockix platform schema only (`infra/vps/docker-compose.postgres.yml`). **Not** tenant accounting data. |
| **Per tenant** | BigCapital stack | MySQL, MongoDB, Redis, Node API (`server`), nginx, webapp, browserless — **`docker compose -p stockix-<slug>`**. |

---

## 2. Prerequisites (before first deploy)

- [ ] **VPS** with public IPv4, Ubuntu LTS (or equivalent), **Docker Engine + Compose v2**.
- [ ] **DNS** at Cloudflare for **`stockix.cloud`**:
  - [ ] **`api.stockix.cloud`** → VPS A record  
  - [ ] **`dashboard.stockix.cloud`** (or chosen hostname) → VPS A record  
  - [ ] **Wildcard `*.stockix.cloud`** → VPS A record (required for **`<slug>.stockix.cloud`** tenants)
- [ ] **Firewall** (e.g. `ufw`): allow **22** (SSH, restrict to admin IPs), **80**, **443**. Deny direct exposure of tenant host ports **unless** intentionally debugging.
- [ ] **Secrets store** decision: how **`infra/vps/.env`**, **`apps/api/.env`**, and **`TENANT_ENV_ROOT/**/*.env`** are managed (vault, sealed secrets, **never git**).
- [ ] **Git + deploy path** on server (e.g. **`/opt/stockix/app`**) with consistent **`BIGCAPITAL_ROOT`** = **`<deploy>/services/bigcapital`**.

---

## 3. Ordered deployment steps

Execute in order unless noted.

### Step A — Server baseline

1. Install Docker + Compose plugin; verify `docker compose version`.
2. Configure firewall (§2).
3. Clone/checkout application repo to deploy path; **`pnpm install`** at repo root when building Node apps.

### Step B — Platform PostgreSQL (Stockix metadata DB)

1. Create **`infra/vps/.env`** from **`env/development/vps-postgres.env`** (or run **`pnpm bootstrap:env`** from repo checkout). Replace **`POSTGRES_PASSWORD`** with a production secret.
3. Start Postgres:

   ```bash
   docker compose -f infra/vps/docker-compose.postgres.yml --env-file infra/vps/.env up -d
   ```

4. Postgres listens on **`127.0.0.1:5432` only** — not bound to `0.0.0.0`.

### Step C — Stockix API & Dashboard configuration

1. **`apps/api/.env`** (production):

   | Variable | Example / rule |
   |----------|----------------|
   | `DATABASE_URL` | `postgresql://postgres:<password>@127.0.0.1:5432/stockix_platform` |
   | `PORT` | e.g. `4000` (bind behind proxy) |
   | `ROOT_DOMAIN` | `stockix.cloud` |
   | `PUBLIC_BASE_URL_SCHEME` | `https` |
   | `TENANT_ENV_ROOT` | e.g. `/opt/stockix/tenants` (create dir, **0700**) |
   | `BIGCAPITAL_ROOT` | Absolute path to **`services/bigcapital`** on server |

2. **`apps/dashboard/.env.local`** (or `.env` depending on your Next.js layout):

   | Variable | Example |
   |----------|---------|
   | `NEXT_PUBLIC_STOCKIX_API_URL` | `https://api.stockix.cloud` |

3. **`packages/db/.env`** or root `.env`: same **`DATABASE_URL`** if CI/migrate runs from repo root.

4. Run migrations: **`pnpm db:migrate`** (from repo, DB reachable).

### Step D — Run control plane processes

Deploy API and Dashboard by your standard (**systemd**, **PM2**, **Dockerfile**, etc.). Requirements:

- API must execute **`docker`** and **`docker compose`** for provisioning (Docker socket access — **high privilege**; restrict host access).
- Dashboard must be reachable on hostname configured at Cloudflare (e.g. **`dashboard.stockix.cloud`**).

**Production requirement:** Restrict **`apps/api`** (authentication, API keys, VPN, or private network). Do not expose provisioning endpoints to the open internet without controls.

### Step E — Edge routing (Traefik or interim)

**Target state:** Traefik on **80/443**, Docker provider, shared **`traefik`** network, **router per hostname**:

- `api.stockix.cloud` → Stockix API  
- `dashboard.stockix.cloud` → Dashboard  
- `{slug}.stockix.cloud` → tenant **nginx** container (internal port 80)

**Interim:** Publish tenant **`PUBLIC_PROXY_PORT`** to localhost or restricted interface and route Cloudflare/SSH tunnel until Traefik integration is merged — document chosen approach for operators.

See **`infra/README.md`** for TLS notes.

### Step F — Tenant stacks (BigCapital)

Provisioner generates **`TENANT_ENV_ROOT/<slug>/.env`** and runs compose with project **`-p stockix-<slug>`**.

Manual equivalent:

```bash
docker compose \
  -p stockix-<slug> \
  -f infra/tenant-stack/docker-compose.yml \
  --env-file /opt/stockix/tenants/<slug>/.env \
  up -d
```

**Rules:**

- Always **same** **`-p`** and **`--env-file`** for `up`, `logs`, `ps`.
- Container names: **`stockix-<slug>-<service>-1`** (use **`docker ps`**, not ambiguous compose project mismatch).

---

## 4. Operational commands (support)

| Situation | Command / action |
|-----------|-------------------|
| Tenant stack unhealthy (502, auth/meta, MySQL, stale nginx) | **`pnpm repair:tenant -- <slug>`** — full project recreate + long `/api/ping/` wait. MySQL-only: **`pnpm repair:tenant-mysql -- <slug>`** |
| Restart tenant API after DB fix | **`docker restart stockix-<slug>-server-1`** |
| Logs | **`docker logs stockix-<slug>-server-1`**, **`docker logs stockix-<slug>-nginx-1`** |
| Platform DB backup | Volume **`stockix_platform_pg`** or **`pg_dump`** to off-site storage |
| Tenant DB backup | Per-tenant MySQL volume / logical backup policy |

---

## 5. Failure modes (known)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **502** on tenant URL | **One command on the host:** **`pnpm repair:tenant -- <slug>`** (MySQL align + rebuild nginx + recreate **server**/**nginx** + wait for **/api/ping**). For MySQL only: **`pnpm repair:tenant-mysql -- <slug>`**. |
| **`docker compose ps` empty** | Wrong **`-p`** or different machine | Use **`docker ps`**; confirm project name **`stockix-<slug>`** |
| nginx container **Exited (1)** | Bad nginx build/envsubst | Rebuild nginx from **`BIGCAPITAL_ROOT`**; **`envsubst`** must not strip **`$host`** (see **`services/bigcapital/docker/nginx/scripts/build-nginx.sh`**) |
| Auth/meta errors in browser | **`BASE_URL`** / **`ROOT_DOMAIN`** mismatch | Tenant **`BASE_URL`** must be **`https://<slug>.stockix.cloud`** — matches **`ROOT_DOMAIN`** + **`PUBLIC_BASE_URL_SCHEME`** |

---

## 6. Verification checklist (sign-off)

- [ ] **`curl -fsS https://api.stockix.cloud/health`** or equivalent API health endpoint you expose (add if missing).
- [ ] Dashboard loads and can reach API (**browser network tab** — no mixed content / wrong API URL).
- [ ] **`pnpm db:migrate`** succeeded; API starts without DB errors.
- [ ] Create **one test tenant**; open **`https://<slug>.stockix.cloud`**; **`GET /api/ping/`** returns **200** via tenant nginx.
- [ ] **`docker ps`** shows **`stockix-<slug>-server-1`** **healthy** (healthcheck) where applicable.
- [ ] Backups scheduled for platform Postgres and tenant data per policy.

---

## 7. Cloudflare SSL (origin vs proxy)

- **Proxied (orange cloud):** Use **SSL/TLS → Full** or **Full (strict)** with valid origin cert; or **DNS-01** ACME if Traefik terminates TLS and HTTP-01 is unreliable.
- **DNS-only (grey cloud):** Simpler Let’s Encrypt HTTP-01 to VPS **:80** — Traefik/Let’s Encrypt common pattern.

Align **SSL mode** with whether Traefik or Cloudflare terminates HTTPS to the browser.

---

## 8. Stockix BigCapital images (single source of truth)

Tenant stacks use **only** `infra/tenant-stack/docker-compose.yml`. Runtime images are **`stockix/bigcapital-*:${STOCKIX_BC_TAG:-latest}`**, built from **`BIGCAPITAL_ROOT`** or **pulled** from your registry (see below).

- **Compose build interpolation:** committed defaults in **`env/development/tenant-docker-build.env`** (override fields via **`process.env`** in CI if needed).
- **Pull upstream base images:** **`pnpm images:pull`** (browserless, Postgres 16; optional registry mirror via **`STOCKIX_BC_PULL_PREFIX`** — see `scripts/stockix-docker-pull.mjs`).
- **Build fork images:** **`pnpm images:tenant`**, or **`STOCKIX_BC_SKIP_LOCAL_BUILD=1 pnpm provision:prepull`** after a successful registry pull.
- **Clean slate before a release:** **`pnpm images:fresh`** removes **`stockix/bigcapital-*`**, clears build cache, re-pulls bases, rebuilds images (see **`infra/tenant-stack/README.md`**).
- **Pin versions:** **`STOCKIX_BC_TAG`** in **`apps/api/.env`**; provisioned tenant `.env` inherits it.
- **Before rebuilding images or provisioning:** platform Postgres up, **`pnpm dev`** (or API only), then **`pnpm verify:provision-ready`** — checks compose paths, Docker, **`DATABASE_URL`**, **`GET /health`**, **`GET /owners`**, and the dry **`provision-smoke`** path (does **not** build images or create tenants).
- **Docker builds:** BigCapital **`services/bigcapital/.dockerignore`** excludes legacy **`package-lock.json`**; Dockerfiles use **`npm install -w @bigcapital/<pkg>`** so **`npm 10`** does not run lockfile v1 migration inside **`docker build`** (which previously failed with exit code 1).

Details: **`infra/tenant-stack/README.md`**.

## 9. Deliverables from engineering (reference)

| Path | Purpose |
|------|---------|
| `infra/vps/docker-compose.postgres.yml` | Platform Postgres |
| `env/development/vps-postgres.env` | Starting point for `infra/vps/.env` |
| `env/development/tenant-docker-build.env` | Compose build interpolation (non-runtime strings) |
| `infra/tenant-stack/docker-compose.yml` | Per-tenant BigCapital stack |
| `infra/tenant-stack/README.md` | Fork image build & overrides |
| `scripts/repair-tenant-mysql-auth.mjs` | MySQL password alignment |
| `scripts/repair-tenant-stack.mjs` | Full repair (**`pnpm repair:tenant`**) |
| `scripts/build-stockix-tenant-images.mjs` | Build `stockix/bigcapital-*` images from fork |
| `scripts/docker-fresh-images.mjs` | Scrub + rebuild (**`pnpm images:fresh`**) |
| `scripts/verify-provision-ready.mjs` | Pre-flight + dry smoke (**`pnpm verify:provision-ready`**) |
| `infra/README.md` | Extended ops notes |

---

## 10. Contacts / escalation

| Role | Name | Contact |
|------|------|---------|
| Application owner | | |
| DevOps lead | | |
| On-call | | |

---

*Document version: aligned with Stockix repo layout. Update edge routing (**§3 Step E**) when Traefik manifests are added to the repository.*
