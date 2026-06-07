# Stockix — Grafana + Prometheus Readiness Audit

**Audit date:** 2026-06-07  
**Auditor role:** DevOps / Infrastructure Architect  
**Scope:** Local development (Windows primary) and production deployment (Linux VPS)  
**Mode:** Audit only — no configuration, containers, or environment changes were made.

---

# Current Environment Audit

## Host summary (Windows — primary developer machine)

| Attribute | Finding |
|-----------|---------|
| OS | Windows 10.0.26200 |
| Shell / tooling | PowerShell, Docker Desktop, WSL2, nvm4w (Node.js) |
| Native PostgreSQL | `postgresql-x64-18` Windows service **Running** on **5432** |
| WSL | WSL Service **Running** (Docker/WSL relay ports present) |
| Remote access | AnyDesk listening on **7070** / **50001** (UDP) |

## Host summary (Linux — secondary developer / deployment)

**Needs manual confirmation.** This audit was executed on the Windows workstation. Production and staging are designed for Linux (`infra/prod/docker-compose.yml`, `infra/prod/OPERATIONS.md`). Run the Linux audit commands in [Appendix A](#appendix-a-linux-audit-commands) on each target host before implementation.

## Repository monitoring baseline (already present)

Stockix already includes partial observability **without** a running local Grafana/Prometheus stack:

| Component | Location | Status on Windows dev host |
|-----------|----------|----------------------------|
| Prometheus config | `infra/prod/prometheus.yml` | File exists; **Prometheus container not running** |
| Grafana dashboard seed | `infra/prod/grafana/dashboards/stockix-overview.json` | File exists; **Grafana container not running** |
| Prod compose services | `infra/prod/docker-compose.yml` (`prometheus`, `grafana`) | **Not deployed locally** |
| API Prometheus metrics | `apps/api/src/lib/prometheus.ts`, `GET /metrics` in `apps/api/src/routes/public.ts` | **Active** when API runs |
| Worker Prometheus metrics | `infra/worker-service/src/worker-prometheus.ts`, `GET /metrics` on worker health server | **Active** when worker runs |
| Optional metrics push | `METRICS_ENDPOINT`, `METRICS_AUTH_TOKEN` in `.env.example` / `infra/prod/.env.example` | Not configured (empty) |
| Error tracking | Sentry integration in API/worker | Optional via `SENTRY_DSN` |
| Ops runbook | `infra/prod/OPERATIONS.md` § Monitoring | Documents prod URLs and alert suggestions |

## Active Docker Compose projects (Windows)

| Project | Config | State | Services |
|---------|--------|-------|----------|
| `dev` | `infra/dev/docker-compose.yml` | Running (2) | `dev-postgres-1`, `dev-redis-1` |
| `stockix-shared` | `infra/shared/docker-compose.yml` + `docker-compose.dev-ports.yml` | Running (5), 1 exited init | MySQL, ProxySQL, Mongo, tenant Redis, rs-init |
| `stockix-pos-e2e-*` (×3) | `infra/pos-tenant-stack/docker-compose.yml` | Mixed (stale E2E stacks) | POS frontends/backends/workers — several **unhealthy/restarting** |

**Total containers:** 19 (13 running, 6 created/exited).

---

# Running Ports Analysis

## Windows TCP listeners (application-relevant)

Captured via `Get-NetTCPConnection -State Listen` on 2026-06-07.

| Port | Bind address | Process | Service / role |
|------|--------------|---------|----------------|
| **3000** | 127.0.0.1 | node | Dashboard (Next.js) — `pnpm dev` |
| **3001** | 0.0.0.0 / :: | node | POS restaurant UI |
| **3003** | 0.0.0.0 / :: | node | PMS API |
| **3004** | 127.0.0.1 | node | PMS tenant frontend |
| **3306** | 127.0.0.1 | com.docker.backend | Shared MySQL (`stockix-shared`) |
| **4000** | 0.0.0.0 / :: | node | Control-plane API (Hono) |
| **5432** | 0.0.0.0 / :: | postgres | **Native PostgreSQL 18** (non-Docker) |
| **54330** | 0.0.0.0 / :: | com.docker.backend | Control-plane Postgres (`dev-postgres-1`) |
| **6032–6033** | 127.0.0.1 | com.docker.backend | ProxySQL admin + tenant port |
| **6379** | 0.0.0.0 / :: / ::1 | wslrelay / docker | Control-plane Redis (`dev-redis-1`) |
| **6380** | 127.0.0.1 | com.docker.backend | Tenant Redis (`stockix-shared`) |
| **8080** | 0.0.0.0 | httpd | **Apache httpd** (host-level; not Stockix Traefik) |
| **9090** | 0.0.0.0 | node | **Infra worker** health + `/metrics` (`WORKER_HEALTH_PORT`) |
| **27017** | 127.0.0.1 | com.docker.backend | Shared MongoDB |
| **4129, 4136–4137, 4144** | 127.0.0.1 | com.docker.backend | E2E POS stack ephemeral host ports |
| **80 / 443** | — | — | **Not bound** on Windows host (prod Traefik only) |

## Windows UDP (notable)

| Port | Process | Notes |
|------|---------|-------|
| 53 | svchost | DNS |
| 123 | svchost | NTP |
| 5353 | chrome | mDNS |
| 50001 | AnyDesk | Remote desktop |
| 1900 / 51069+ | svchost | SSDP / discovery |

## Declared application port map (from repo)

| Service | Default port | Auto-shift | Source |
|---------|--------------|------------|--------|
| Dashboard | 3000 | Yes (`findFreePort`) | `scripts/dev-stockix.mjs`, `DASHBOARD_PORT` |
| API | 4000 | Yes | `PORT`, `scripts/dev-stockix.mjs` |
| PMS API | 3003 | Yes | `PMS_PORT` |
| PMS tenant UI | 3004 | Yes | `PMS_FRONTEND_PORT` |
| Worker health/metrics | **9090** | Yes (if busy) | `WORKER_HEALTH_PORT` — **keep 9090**; do not relocate for monitoring |
| POS backend | 8010 | Yes (POS scripts) | `POS_HOST_PORT` |
| POS frontend | 3001 | Yes | `POS_FRONTEND_HOST_PORT` |
| Control-plane Postgres (Docker) | **54330** | Configurable | `POSTGRES_HOST_PORT` — avoids native 5432 |
| Control-plane Redis (Docker) | **6379** | Fixed in `infra/dev` | Conflicts possible with other Redis installs |
| Shared MySQL | 3306 (dev-ports) | Fixed | `infra/shared/docker-compose.dev-ports.yml` |
| Shared Mongo | 27017 | Fixed | dev-ports overlay |
| Tenant Redis | 6380 | Fixed | dev-ports overlay |
| ProxySQL | 6032, 6033 | Fixed | dev-ports overlay |
| Tenant dynamic range | up to **4999** | Per tenant | `MAX_TENANT_PORT` |
| Prod Traefik dashboard API | **8080** | 127.0.0.1 only | `infra/prod/docker-compose.yml` |
| Prod Grafana (public) | 443 via Traefik | Host rule | `grafana.${ROOT_DOMAIN}` |
| Prod Prometheus | **none published** | Internal Docker only | `stockix_internal` network |

## Host vs container port model (recommended)

Monitoring containers should keep **internal defaults** (Grafana **3000**, Prometheus **9090**) and resolve host conflicts via **published port remapping** — the same pattern as `POSTGRES_HOST_PORT=54330` → container `5432`.

| Service | Container port (keep default) | Host bind (when published) | Notes |
|---------|------------------------------|----------------------------|-------|
| Infra worker | **9090** | **9090** (unchanged) | Do **not** change `WORKER_HEALTH_PORT` for monitoring |
| Grafana | **3000** | **127.0.0.1:3100→3000** | Browser opens `:3100`; Grafana still listens on `:3000` inside |
| Prometheus | **9090** | **127.0.0.1:9092→9090** | Browser/scrape UI on `:9092`; Prometheus still listens on `:9090` inside |
| Alertmanager | **9093** | **127.0.0.1:9093→9093** | No conflict; 1:1 map acceptable |

Inside Docker networks, scrape targets remain canonical: `prometheus:9090`, `grafana:3000`, `infra-worker:9090` (prod) or `host.docker.internal:9090` (dev worker on host).

## Safe host port ranges for monitoring (Windows dev)

| Range | Recommendation |
|-------|----------------|
| **3000–3004, 4000, 8010** | Reserved for Stockix apps — do not bind Grafana **host** port here |
| **9090 (host)** | Reserved for infra worker — do not publish Prometheus as `9090:9090` on host |
| **8080 (host)** | Occupied by Apache on this host — avoid for cadvisor/Traefik-style host binds |
| **9100–9199** | **Preferred** for exporter host ports (currently free) |
| **9092, 9093** | **Preferred** for Prometheus / Alertmanager **host** UI (container stays 9090/9093) |
| **3100** | **Preferred** for Grafana **host** UI (container stays 3000) |
| **5000–4999** | Partially reserved by tenant provisioning — use cautiously above app defaults |

## Linux port expectations (from compose — not live-verified)

On production Linux hosts running `infra/prod/docker-compose.yml`:

- **80, 443** — Traefik (public)
- **127.0.0.1:8080** — Traefik dashboard API (localhost only)
- **127.0.0.1:54330** — Platform Postgres (admin access)
- Prometheus/Grafana — **no host ports**; reachable only inside Docker networks or via Traefik (Grafana)

**Needs manual confirmation** on the actual VPS: native services (nginx, postgres, fail2ban, etc.) may also bind ports.

---

# Docker Environment Review

## Running containers (summary)

| Container group | Network(s) | Published ports |
|-----------------|------------|-----------------|
| `dev-postgres-1`, `dev-redis-1` | `dev_default` | 54330→5432, 6379→6379 |
| `stockix-shared-*` | `stockix-shared`, `stockix_internal` (proxy) | 3306, 6032–6033, 27017, 6380 (127.0.0.1) |
| `stockix-shared-nginx-1` | `stockix-shared`, `stockix_public` | None on host |
| E2E POS stacks (×3) | `stockix_public`, project networks | 4129, 4136–4137, 4144 → app ports |

## Docker networks

| Network | Driver | Purpose | Members (sample) |
|---------|--------|---------|------------------|
| `dev_default` | bridge | Local control-plane DB/Redis | dev-postgres, dev-redis |
| `stockix-shared` | bridge (172.30.0.0/24) | Shared tenant MySQL/Mongo/Redis | mysql, mongo, redis, proxysql, nginx |
| `stockix_internal` | bridge, **internal** | Control-plane private traffic | mysql-proxy; prod api/worker/postgres |
| `stockix_public` | bridge | Traefik-routed tenant/public services | POS frontends, nginx |
| `bridge`, `host`, `none` | default | Docker defaults | — |

## Volumes (named, relevant)

| Volume | Purpose |
|--------|---------|
| `dev_stockix_pg_data` | Control-plane Postgres (dev) |
| `stockix_shared_mysql`, `stockix_shared_mongo`, `stockix_shared_tenant_redis`, `stockix_shared_proxysql` | Shared tenant infra |
| `stockix_postgres_data`, `stockix_prometheus_data`, `stockix_grafana_data` | **Prod compose** (may not exist until prod deploy) |

## Compose file inventory

| File | Environment |
|------|-------------|
| `infra/dev/docker-compose.yml` | Local control-plane Postgres + Redis |
| `infra/shared/docker-compose.yml` | Shared MySQL/Mongo/Redis (all envs) |
| `infra/shared/docker-compose.dev-ports.yml` | **Dev-only** host port publishing |
| `infra/prod/docker-compose.yml` | Production stack incl. **prometheus**, **grafana**, Traefik, API, worker |
| `infra/staging/docker-compose.yml` | Includes prod compose |
| `infra/tenant-stack/docker-compose.yml` | Per-tenant Finance server |
| `infra/pos-tenant-stack/docker-compose.yml` | Per-tenant POS |
| `infra/pms-tenant-stack/docker-compose.yml` | Per-tenant PMS |
| `services/chatlive/docker-compose*.yaml` | Chatwoot (optional) |
| `services/stockix-finance/docker-compose*.yml` | Finance standalone |
| `services/posnew/docker-compose.production.yml` | POS production |

## Monitoring network placement (recommendation preview)

| Approach | When | Rationale |
|----------|------|-----------|
| **Isolated `stockix_monitoring` network** | Local dev overlay | Avoids accidental exposure; explicit scrape targets |
| **Join `stockix_internal` + read-only scrape** | Production | Matches existing prod compose; Prometheus already on `stockix_internal` |
| **Join `stockix-shared` for DB metrics** | Both (via exporters) | MySQL/Mongo/Redis live here; use exporter sidecars, not raw DB ports |
| **Do not join `stockix_public`** | Default | Public network carries tenant-facing traffic |

## Service discovery (future)

| Target | Discovery method |
|--------|------------------|
| `api`, `infra-worker` | Static config (already in `prometheus.yml`) |
| Traefik | Traefik metrics endpoint or Docker SD via socket-proxy |
| Tenant stacks | Docker SD (prod has `socket-proxy`) or label-based relabeling |
| Host metrics | `node_exporter` on Linux prod; optional on Windows dev |
| Postgres / MySQL / Mongo / Redis | Dedicated exporters (`postgres_exporter`, `mysqld_exporter`, etc.) |

---

# Existing Services Worth Monitoring

## Control plane

| Service | Metrics today | Priority | Notes |
|---------|---------------|----------|-------|
| **API** (`apps/api`) | `stockix_api_request_total`, latency histogram, Node defaults via `/metrics` | P0 | Unauthenticated public route — see Security |
| **Infra worker** | Job counters, Node defaults on `:9090/metrics` | P0 | Keep **9090**; Prometheus container also uses **9090 internally** — separate via Docker network / host remap |
| **api-bullmq** | No dedicated `/metrics` in compose | P1 | Healthcheck only; Redis connectivity |
| **Platform Postgres** | None | P1 | `postgres_exporter` → `dev-postgres` / prod `postgres` |
| **Control-plane Redis** | None | P1 | `redis_exporter` on `control-plane-redis` |
| **Traefik** | Not scraped yet | P1 | Entrypoint errors, cert expiry, backend health |
| **socket-proxy** | None | P2 | Docker API gateway — audit access logs |

## Shared tenant infrastructure

| Service | Priority | Key signals |
|---------|----------|-------------|
| **MySQL 8** (`stockix-mysql`) | P0 | `Threads_connected`, slow queries, InnoDB, replication (future) |
| **ProxySQL** | P1 | Connection pool, query rules, backend status |
| **MongoDB 6** (`stockix-mongo`, rs0) | P1 | Replication lag, opcounters, wiredTiger cache |
| **Tenant Redis** | P0 | Memory, evictions (**must stay 0** — `noeviction`), persistence |
| **db-backup** cron | P0 | Cron health, backup success/failure (OPERATIONS.md) |

## Per-tenant runtime

| Service | Priority | Key signals |
|---------|----------|-------------|
| Finance server containers | P1 | HTTP latency, JVM/Node heap, queue depth |
| POS backend / workers | P1 | BullMQ queues, provision health, restart loops |
| PMS service | P2 | Request rate, errors |
| Nginx (shared) | P2 | Upstream failures |

## Platform / host

| Signal | Priority |
|--------|----------|
| CPU, RAM, disk, inode usage | P0 |
| Docker daemon health, container OOM kills | P0 |
| TLS certificate expiry (Traefik ACME) | P0 |
| Provision job failures (`worker_job_failure_total`) | P0 |
| Sentry error rate (complement to Prometheus) | P1 |

## External / optional

| Service | Notes |
|---------|-------|
| Chatwoot (`docker-compose.chat.yml`) | Optional; port 3200 in chat overlay |
| Gotenberg (Finance PDF) | Port 9000/9001 in Finance `.env.example` |
| Mail / webhooks | Synthetic checks, not Prometheus-native |

---

# Port Conflict Assessment

## Default monitoring ports vs current Windows host

Conflicts below apply to **host port binding** when publishing containers to the developer machine. They do **not** require changing container internal ports or moving the worker off **9090**.

| Service | Container default | Host bind conflict | Evidence | Host remap |
|---------|-------------------|--------------------|----------|------------|
| **Grafana UI** | 3000 | **Yes** | node (Dashboard) on 127.0.0.1:3000 | `127.0.0.1:3100→3000` |
| **Prometheus UI** | 9090 | **Yes** | node (infra worker) on 0.0.0.0:9090 | `127.0.0.1:9092→9090` |
| **Traefik dashboard** | 8080 | **Yes** (host) | httpd (Apache) on 0.0.0.0:8080 | N/A locally (prod uses 127.0.0.1:8080) |
| **node_exporter** | 9100 | No | Verified free | `127.0.0.1:9100→9100` |
| **cadvisor** | 8080 | **Yes** (host) | Same Apache conflict | `127.0.0.1:8081→8080` or skip |
| **Alertmanager** | 9093 | No | Verified free | `127.0.0.1:9093→9093` |
| **Pushgateway** | 9091 | No | Verified free | `127.0.0.1:9091→9091` |
| **postgres_exporter** | 9187 | No | Verified free | `127.0.0.1:9187→9187` |
| **redis_exporter** | 9121 | No | Verified free | `127.0.0.1:9121→9121` |
| **Docker metrics** | 9323 | No | Verified free | `127.0.0.1:9323→9323` |

## Semantic / configuration conflicts (not just TCP)

| Conflict | Impact | Resolution |
|----------|--------|------------|
| Worker **host** `:9090` vs Prometheus **host** `:9090` | Both cannot bind the same host port | **Do not move the worker.** Publish Prometheus as `9092:9090` (or similar) on the host only |
| Dashboard **host** `:3000` vs Grafana **host** `:3000` | Both cannot bind the same host port | **Do not change Grafana's internal 3000.** Publish Grafana as `3100:3000` on the host |
| Worker `:9090` vs Prometheus `:9090` **inside Docker** | Not a conflict — different containers on `stockix_internal` | Use service DNS (`prometheus:9090`, `infra-worker:9090`) in scrape configs |
| Prod `prometheus.yml` target `localhost:9090` for self-scrape | Correct **inside** Prometheus container | Prefer `prometheus:9090` in docs for clarity; `localhost:9090` is valid in-container |
| Prod Prometheus has **no** published port | Correct for security | Local dev: publish `127.0.0.1:9092→9090` for UI access |
| `/metrics` on API is public | Scraping from host works without auth | Security risk — restrict before any public exposure |

---

# Recommended Port Allocation

## Local development (Windows + Linux developers)

Use a dedicated **`infra/dev/monitoring` port profile** (future implementation) with env-driven **host** overrides. **Container ports stay at upstream defaults.**

| Service | Container port (fixed) | Host conflict | Host publish map | Reason |
|---------|------------------------|---------------|------------------|--------|
| **Infra worker** | **9090** | — | **9090** (no remap) | Canonical worker health/metrics; **never relocate for monitoring** |
| Grafana UI | **3000** | Yes (Dashboard) | **`127.0.0.1:3100→3000`** | Internal default preserved; host avoids Dashboard |
| Prometheus UI | **9090** | Yes (worker) | **`127.0.0.1:9092→9090`** | Internal default preserved; host avoids worker |
| Alertmanager | **9093** | No | **`127.0.0.1:9093→9093`** | Standard 1:1 map |
| Pushgateway (optional) | **9091** | No | **`127.0.0.1:9091→9091`** | Optional dev push testing |
| node_exporter | **9100** | No | **`127.0.0.1:9100→9100`** | Standard |
| postgres_exporter (platform DB) | **9187** | No | **`127.0.0.1:9187→9187`** | Standard |
| redis_exporter (control-plane) | **9121** | No | **`127.0.0.1:9121→9121`** | Standard |
| mysqld_exporter (shared MySQL) | **9104** | No | **`127.0.0.1:9104→9104`** | Standard MySQL exporter port |
| mongodb_exporter | **9216** | No | **`127.0.0.1:9216→9216`** | Standard Mongo exporter port |
| cadvisor | **8080** | Yes (Apache) | **`127.0.0.1:8081→8080`** or skip | Host remap only; prefer node_exporter on dev |
| Docker daemon metrics | **9323** | No | **`127.0.0.1:9323→9323`** | Only if Docker Desktop exposes metrics |

**Example compose publish syntax (future):**

```yaml
ports:
  - "127.0.0.1:${GRAFANA_HOST_PORT:-3100}:3000"   # Grafana container stays on 3000
  - "127.0.0.1:${PROMETHEUS_HOST_PORT:-9092}:9090"  # Prometheus container stays on 9090
```

**Worker:** leave `WORKER_HEALTH_PORT=9090` unchanged. Prometheus scrapes the worker at `host.docker.internal:9090` from inside the monitoring network — not via the Prometheus host UI port.

## Production (Linux VPS)

| Service | Default Port | Conflict (expected) | Suggested approach | Reason |
|---------|--------------|----------------------|-------------------|--------|
| Grafana | 3000 | No (not published) | **Traefik HTTPS** `grafana.${ROOT_DOMAIN}` only | Already defined in compose |
| Prometheus | 9090 | No (not published) | **Internal only** on `stockix_internal` | No public UI; VPN/SSH tunnel for admin |
| Traefik dashboard | 8080 | Low | **127.0.0.1:8080** only | Already in prod compose |
| Exporters | various | Unlikely | Docker internal DNS names | Scrape over bridge networks |
| Alertmanager | 9093 | Unlikely | Internal + optional Traefik with auth | Not in compose yet |

---

# Proposed Monitoring Architecture

## Local Development

```text
┌─────────────────────────────────────────────────────────────────┐
│  Developer host (Windows / Linux)                               │
│                                                                 │
│  pnpm dev apps ──► API :4000/metrics                            │
│                 └──► Worker :9090/metrics  (fixed — no remap)   │
│                                                                 │
│  Docker: infra/dev          → Postgres :54330→5432, Redis :6379 │
│  Docker: stockix-shared     → MySQL, Mongo, tenant Redis        │
│                                                                 │
│  Docker: monitoring overlay (proposed, not implemented)         │
│    grafana    host :3100 ──► container :3000 (internal default) │
│    prometheus host :9092 ──► container :9090 (internal default) │
│         │                                                       │
│         └── scrapes ──► host.docker.internal:4000  (API)        │
│                      host.docker.internal:9090  (worker)        │
│                      exporters on :9100, :9187, :9121, ...      │
└─────────────────────────────────────────────────────────────────┘
```

### Local strategy principles

1. **Separate compose project** (e.g. `stockix-monitoring` or `infra/dev/docker-compose.monitoring.yml`) — do not merge into `stockix-shared` or `dev` stacks initially.
2. **127.0.0.1 binding only** on Windows to reduce accidental LAN exposure (match `docker-compose.dev-ports.yml` pattern).
3. **Scrape host-run services** via `host.docker.internal` (API on `:4000`, worker on `:9090`) — already used elsewhere in repo for POS/PMS.
4. **Keep container defaults; remap host ports only** — Grafana `3100→3000`, Prometheus `9092→9090`. Do **not** change `WORKER_HEALTH_PORT` or Grafana/Prometheus internal listen ports.
5. **Reuse prod `prometheus.yml` as a template** — scrape targets use canonical ports (`:9090` worker, `:4000` api); only the **browser UI** uses host `:9092`.
6. **Cross-platform parity:** env vars for **host** publish (`GRAFANA_HOST_PORT=3100`, `PROMETHEUS_HOST_PORT=9092`) on Windows and Linux; document in `.env.example` when implemented.
7. **Onboarding:** optional `pnpm monitoring:up` script (future) — not required for core `pnpm dev`.
8. **E2E / stale stacks:** clean orphaned `stockix-pos-e2e-*` compose projects before enabling monitoring to reduce noise and port churn.

## Production

```text
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │ Traefik :443   │
              │ (TLS, CF ACME) │
              └───────┬────────┘
                      │ Host(`grafana.${ROOT_DOMAIN}`)
                      ▼
              ┌────────────────┐       stockix_internal (internal bridge)
              │ Grafana        │◄──────┐
              └───────┬────────┘       │
                      │ queries        │
                      ▼                │
              ┌────────────────┐       │
              │ Prometheus     │──scrapes──► api:4000/metrics
              │ (no public port)│       infra-worker:9090/metrics
              └───────┬────────┘       postgres/redis/mysql/mongo exporters
                      │                (future)
                      ▼
              ┌────────────────┐
              │ Alertmanager   │  (recommended addition)
              └────────────────┘

 stockix_public ─ tenant POS/Finance via Traefik
 stockix-shared ─ shared DB layer
 stockix_socket_proxy_network ─ Docker API (worker only)
```

### Production strategy principles

1. **Keep existing prod compose services** (`prometheus`, `grafana`) as the baseline — extend, do not duplicate.
2. **Grafana:** public via Traefik subdomain **with strong auth** (admin password + OAuth/SSO recommended).
3. **Prometheus:** remain **internal-only**; admin access via SSH tunnel or VPN, not public routing.
4. **Alertmanager + rules:** add for OPERATIONS.md thresholds (MySQL connections, Redis memory, worker job failures, backup health).
5. **Persistent volumes:** already defined (`stockix_prometheus_data`, `stockix_grafana_data`) — plan backup alongside DB backups.
6. **Retention:** current `--storage.tsdb.retention.time=15d` — validate disk budget on VPS.
7. **Tenant scale:** complement static scrape with Docker SD through existing `socket-proxy` for dynamic tenant containers.
8. **Staging:** inherits prod compose via `infra/staging/docker-compose.yml` — deploy monitoring there first.

---

# Security Recommendations

| Area | Current state | Recommendation |
|------|---------------|----------------|
| **Grafana exposure** | Prod: Traefik public route | Keep HTTPS; add OAuth (GitHub/Google) or IP allowlist; rotate `GRAFANA_ADMIN_PASSWORD` |
| **Prometheus exposure** | Not published (good) | Never route Prometheus UI through Traefik without mTLS + auth |
| **API `/metrics`** | Public, no auth | Restrict to internal network or protect with bearer token / network policy before prod scrape from outside container network |
| **Worker `/metrics`** | Binds `0.0.0.0` on dev | Bind `127.0.0.1` in dev or firewall; in prod container, internal network only |
| **Traefik dashboard** | `--api.insecure=true` on localhost:8080 | Acceptable on 127.0.0.1; never expose 8080 publicly (Windows Apache conflict is a separate local issue) |
| **Secrets** | `GRAFANA_ADMIN_PASSWORD` in `infra/prod/.env` | Use Docker secrets or env injection; never commit; align with `docs/SECRET_ROTATION_RUNBOOK.md` |
| **Docker socket** | `db-backup` and `socket-proxy` mount socket | Minimize to read-only; monitoring should not need socket unless using SD |
| **Multi-tenant isolation** | Metrics may include path labels | Scrub high-cardinality labels; avoid per-tenant series explosion without recording rules |
| **HTTPS** | Traefik + Cloudflare DNS challenge | Extend same pattern for Grafana; HSTS at edge |

---

# Risks & Concerns

| Risk | Severity | Detail |
|------|----------|--------|
| **Port 9090 host collision** | High | Worker occupies host `:9090` — resolved by publishing Prometheus as `9092→9090`, **not** by moving the worker |
| **Port 3000 host collision** | High | Dashboard occupies host `:3000` — resolved by publishing Grafana as `3100→3000`, **not** by changing Grafana's internal port |
| **Port 8080 collision (Windows)** | Medium | Apache httpd blocks cadvisor/Traefik-style 8080 on host; prod uses 127.0.0.1 only |
| **Unauthenticated `/metrics`** | High | API metrics publicly readable — information disclosure |
| **Stale E2E Docker stacks** | Medium | 3 POS E2E projects unhealthy/restarting — adds noise and ephemeral ports |
| **Dual Postgres** | Medium | Native PG on 5432 + Docker on 54330 — easy to misconfigure exporters |
| **Dual Redis** | Medium | 6379 (dev) vs 6380 (tenant) — scrape wrong instance without explicit targets |
| **Prometheus config gap** | Medium | No postgres/mysql/mongo/redis jobs yet; self-scrape only + api + worker |
| **No Alertmanager in compose** | Medium | OPERATIONS.md suggests alerts but no routing config exists |
| **Grafana provisioning incomplete** | Low | Dashboard JSON exists; datasource provisioning path **Needs manual confirmation** |
| **Windows vs Linux drift** | Medium | Docker Desktop networking differs from Linux VPS — test on both before prod |
| **Resource pressure** | Medium | 19 containers on dev machine; adding monitoring increases RAM/CPU |
| **Tenant port range 3000–4999** | Low | Dynamic tenant bindings could collide with poorly chosen monitoring ports |

---

# Recommended Next Steps

**Phase 0 — Manual confirmation (before any implementation)**

1. Run [Appendix A](#appendix-a-linux-audit-commands) on production and staging Linux hosts; record listening ports and running compose projects.
2. Confirm whether prod `prometheus` and `grafana` containers are deployed and healthy in production (**Needs manual confirmation** from this Windows audit).
3. Clean stale local E2E compose projects: `stockix-pos-e2e-*` (optional but reduces port noise).
4. Decide Grafana auth model (OAuth vs admin-only + IP restriction).

**Phase 1 — Design (still no prod changes)**

1. Add dev monitoring **host** port variables to `.env.example` (`GRAFANA_HOST_PORT=3100`, `PROMETHEUS_HOST_PORT=9092`; container ports remain 3000/9090).
2. Draft `infra/dev/docker-compose.monitoring.yml` (or `infra/monitoring/`) — **separate PR, not done in this audit**.
3. Extend `infra/prod/prometheus.yml` with exporter jobs and fix/document self-scrape target (`prometheus:9090` vs `localhost:9090`).
4. Add Grafana datasource provisioning YAML (Prometheus URL on internal network).
5. Protect `/metrics` with network restriction or bearer token aligned with `METRICS_AUTH_TOKEN`.

**Phase 2 — Staging validation**

1. Deploy monitoring stack on staging (`infra/staging`).
2. Import `stockix-overview.json`; validate API and worker panels populate.
3. Load-test scrape paths; verify cardinality of `path` label on API metrics.

**Phase 3 — Production rollout**

1. Enable Alertmanager + recording/alert rules from OPERATIONS.md table.
2. Backup Grafana dashboards and Prometheus TSDB volumes.
3. Document SSH tunnel procedure for Prometheus admin UI.
4. Add monitoring to `docs/PRODUCTION_CHECKLIST.md` and CI smoke checks.

---

# Appendix A — Linux audit commands

Run on Ubuntu/Debian VPS or Linux developer machine and attach output to the implementation ticket.

```bash
# Listening TCP/UDP with process names
sudo ss -tulpn
# or: sudo lsof -i -P -n | grep LISTEN

# Systemd services (common data plane)
systemctl list-units --type=service --state=running | grep -Ei 'docker|nginx|postgres|redis|mysql|mongo|traefik'

# Docker state
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker network ls
docker volume ls
docker compose ls -a

# Compose projects (from repo root on server)
cd /opt/stockix/stockixnew   # or actual STOCKIX_REPO
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env ps

# Check default monitoring ports
for p in 3000 9090 9091 9092 9093 9100 9121 9187 9323 8080 8081; do
  ss -tln | awk -v p=":$p" '$4 ~ p {print "OCCUPIED", p, $0}' || echo "FREE $p"
done

# Prod Traefik / Grafana / Prometheus reachability (internal)
docker exec stockix-prometheus-1 wget -qO- http://api:4000/metrics | head
docker exec stockix-prometheus-1 wget -qO- http://infra-worker:9090/metrics | head
curl -sI "https://grafana.${ROOT_DOMAIN}"   # replace ROOT_DOMAIN
```

---

# Appendix B — Audit methodology (Windows)

Commands executed during this audit:

```powershell
Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess, ProcessName
Get-NetUDPEndpoint | Select-Object LocalAddress, LocalPort, OwningProcess, ProcessName
Get-Process -Id <pid> | Select-Object Id, ProcessName, Path
docker ps -a
docker network ls
docker volume ls
docker compose ls -a
Get-Service | Where-Object { $_.Status -eq 'Running' }
```

---

*End of audit document. No infrastructure was modified during this assessment.*
