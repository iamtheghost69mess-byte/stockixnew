# Infrastructure

**→ Send to DevOps:** **[`DEVOPS-HANDOFF.md`](./DEVOPS-HANDOFF.md)** (ordered steps, verification checklist, failure modes).

## Single VPS (`stockix.cloud` + Cloudflare) — do things in this order

Put **`DATABASE_URL` last**: bring up Docker, tenant routing, and Stockix env **before** you paste the production Postgres URL into `apps/api/.env`.

### Phase 1 — VPS baseline

1. **Ubuntu LTS** (or similar), install **Docker Engine + Compose plugin**.
2. **Firewall** (e.g. `ufw`): allow **22**, **80**, **443** from the internet; **do not** expose tenant **`PUBLIC_PROXY_PORT`** ranges to the world unless you intentionally publish raw ports (prefer routing everything behind **Cloudflare** + one edge proxy later).
3. Clone this repo on the server and set **`BIGCAPITAL_ROOT`** in tenant `.env` files to the Linux path of **`services/bigcapital`** (e.g. `/opt/stockix/...`).

### Phase 2 — Avoid nginx / MySQL / “empty compose” failures

| Failure | What to do |
|--------|------------|
| **502** | **MySQL:** **`PROTOCOL_CONNECTION_LOST`** → align passwords with `pnpm repair:tenant-mysql -- <slug>`, restart **`server`**. **Stale nginx upstream** (502 after container IP changed): nginx image must include **`resolver 127.0.0.11`** + variable **`proxy_pass`** (`server.template`) — rebuild **`nginx`**; see **`infra/tenant-stack/README.md`**. |
| **nginx exits** | Build nginx from **`BIGCAPITAL_ROOT`** (`tenant-stack` compose); keep **`build-nginx.sh`** substituting only **`SERVER_PROXY_PORT`** so **`$host`** is not stripped. |
| **`docker compose ps` empty / wrong** | Always use the **same** **`-p stockix-<slug>`** and **`--env-file`** as `up`. Trust **`docker ps`** and names like **`stockix-<slug>-server-1`**. |

### Phase 3 — Cloudflare

- DNS **A** (or **AAAA**) records for **`stockix.cloud`**, **`api.stockix.cloud`**, **`dashboard.stockix.cloud`** (names you choose) → **your VPS public IP**.
- **SSL/TLS**: **Full** or **Full (strict)** so HTTPS works to origin.
- Orange-cloud proxy on only what should pass through Cloudflare.

### Phase 4 — Stockix app env (before DB URL)

On the VPS, configure **`apps/api/.env`** with production values:

- **`ROOT_DOMAIN=stockix.cloud`**
- **`PUBLIC_BASE_URL_SCHEME=https`**
- **`TENANT_ENV_ROOT`** — Linux path for tenant `.env` files (default on Linux is **`/opt/stockix/tenants`**; create it and use consistent permissions).

Configure the dashboard (typically **`apps/dashboard/.env.local`** after **`pnpm bootstrap:env`**):

- **`NEXT_PUBLIC_STOCKIX_API_URL=https://api.stockix.cloud`** (your real API hostname).

### Phase 5 — Platform PostgreSQL on the same VPS (**then** `DATABASE_URL`)

1. From repo root run **`pnpm bootstrap:env`** (installs **`infra/vps/.env`** from **`env/development/vps-postgres.env`**) or set **`POSTGRES_PASSWORD`** yourself in **`infra/vps/.env`**.
2. Start Postgres:

   ```bash
   docker compose -f infra/vps/docker-compose.postgres.yml --env-file infra/vps/.env up -d
   ```

3. Set **`DATABASE_URL`** in **`apps/api/.env`** and **`packages/db/.env`** to match **`infra/vps/.env`** (same user/password/db), e.g. `postgresql://postgres:<password>@127.0.0.1:5432/stockix_platform`.

4. Run migrations from the repo: **`pnpm db:migrate`** (after **`pnpm install`** and DB reachable).

**Backup discipline**: snapshot **`stockix_platform_pg`** volume or schedule **`pg_dump`** off-server — this is your platform DB.

---

## Tenant stack (BigCapital per tenant)

Compose lives in **`tenant-stack/docker-compose.yml`**. Each tenant uses its own project name and env file, for example:

```powershell
docker compose `
  -p stockix-<slug> `
  -f infra/tenant-stack/docker-compose.yml `
  --env-file "$env:USERPROFILE\.stockix\tenants\<slug>\.env" `
  up -d
```

`BIGCAPITAL_ROOT` in that `.env` must point at the vendored app (for example `...\stockix\services\bigcapital`).

### Production checklist

1. **Secrets**: Strong `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `JWT_SECRET`; never commit tenant `.env`; rotate on compromise.
2. **MySQL credentials vs volume**: If you change `DB_PASSWORD` in `.env` but the MySQL volume was created with an older password, app users get `ER_ACCESS_DENIED` or unstable connections. Repair without wiping data:

   ```bash
   pnpm repair:tenant-mysql -- <slug>
   ```

3. **Startup order**: The stack waits for **MySQL health**, runs **`database_migration` to completion**, then starts **`server`**. That avoids the API opening connections before migrations finish.
4. **Health**: `server` exposes a Docker **healthcheck** on `GET /api/ping/` (see `docker ps` — `healthy` / `unhealthy`).
5. **502 / `PROTOCOL_CONNECTION_LOST`**: The upstream BigCapital Node image can **exit** on an unhandled MySQL socket error. Fix MySQL stability and credential alignment, then `docker restart stockix-<slug>-server-1`. **`restart: unless-stopped`** is set on data services and the app tier so Docker restarts them after failure or host reboot.
6. **Edge TLS**: Nginx in this file listens on **HTTP** (port 80 inside the container). Terminate TLS at **Cloudflare**, **Traefik**, or another reverse proxy in front of the published host port.
7. **Control plane**: Secure **`apps/api`** (dashboard provisioner) with auth, rate limits, and secrets management before exposing it publicly.

### Useful diagnostics

- Container names are **`stockix-<slug>-<service>-1`** (not literal `…`). List with `docker ps` or `docker ps -a --filter "name=stockix-<slug>"`.
- If `docker compose ... ps` looks empty, confirm you passed the same **`-p`** project name that you used for `up`, or use `docker ps` globally.

### Related docs

- Optional Traefik / host routing notes may live alongside tenant networking docs as you harden deployment.
