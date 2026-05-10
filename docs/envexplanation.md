# Environment variables — what they mean

This document explains variables in **`.env.example`** (full schema). Runtime loads **repo root** `.env` then `.env.local` via `@repo/config`. Production Docker uses **`infra/prod/.env`** (see **`infra/prod/.env.example`**).

| Context | File | Purpose |
|--------|------|--------|
| **Local development** | `<repo>/.env` and optional `.env.local` | API, dashboard, workers, Drizzle CLI, scripts |
| **Production (Docker)** | `infra/prod/.env` | `docker compose --env-file .env` for Traefik, Postgres, API, dashboard, worker |

**Never commit** real `.env` files. Commit only `*.env.example` templates.

---

## Local vs production — what you must set

### Local development (minimum)

- **`DATABASE_URL`** — Postgres URL (e.g. `infra/dev` compose on `127.0.0.1:54330`).
- **`PLATFORM_API_SECRET`** — Long random string; sent as `x-platform-api-key` / used by dashboard server proxy.
- **`WORKER_SECRET`** — Shared with `infra-worker` for `/internal/jobs/*` (if you run the worker locally or in compose).
- **`SESSION_SECRET`** — Cookie / session signing (≥32 random bytes recommended).
- **`AUTH_TOKEN_SECRET`** — JWT signing for owner sessions (can match `SESSION_SECRET` in dev only if you accept coupling).
- **`DASHBOARD_URL`** — e.g. `http://localhost:3000`; used for redirects and CSRF `Origin` checks.
- **`DEPLOYMENT_SECRET_KEY`** — ≥32 chars; derived material for tenant provisioning crypto.
- **`LICENSE_SIGNING_SECRET`** — ≥32 chars; HS256 key for POS offline license JWTs (dev can rely on config fallback if unset, but set it to match prod behavior).
- **`PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`** — Dashboard login (server-side).
- **`NEXT_PUBLIC_*`** — Browser-visible API URL, scheme, root domain, tenant host hints.
- **`CORS_ORIGINS`** — Comma-separated origins allowed for API CORS (e.g. `http://localhost:3000`).
- **`REPO_ROOT`** — Absolute path to monorepo for provisioning scripts (your machine).

Optional locally: `BOOTSTRAP_*`, `TENANT_ENV_ROOT`, `STOCKIX_TENANT_APP_ROOT`, Traefik paths, mail, metrics.

### Production (Docker stack)

Set everything in **`infra/prod/.env.example`**, with **strong unique** values for every secret:

- **Routing:** `ROOT_DOMAIN`, `DASHBOARD_URL`, `CORS_ORIGINS`, `NEXT_PUBLIC_STOCKIX_API_URL` (HTTPS, real domain).
- **Postgres:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST_PORT`.
- **Secrets:** `PLATFORM_API_SECRET`, `WORKER_SECRET`, `SESSION_SECRET`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY`, `LICENSE_SIGNING_SECRET`.
- **Dashboard admin:** `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`.
- **TLS:** `ACME_EMAIL`, **`CF_DNS_API_TOKEN`** (real Cloudflare token for DNS-01).
- **Host:** `STOCKIX_REPO` path on the server.

`DATABASE_URL` inside containers is usually **built by compose** from Postgres settings, not copied from your laptop’s `.env`.

---

## Section-by-section (`.env.example`)

### NODE

| Variable | Meaning |
|----------|---------|
| **`NODE_ENV`** | `development` locally; `production` in deploy. Affects cookies, validation, defaults. |
| **`HOSTNAME`** | Label for logs / metrics (not DNS). |

### DATABASE

| Variable | Meaning |
|----------|---------|
| **`DATABASE_URL`** | Control-plane Postgres (tenants, owners, licenses, jobs). **Required** for API, dashboard server, migrations. |
| **`DB_WAIT_TIMEOUT_MS`** | How long `db:wait` polls Postgres before failing. |
| **`DB_*` / `SYSTEM_DB_*` / `TENANT_DB_*`** | Legacy Stockix multi-DB layout; leave empty unless you run that stack. |
| **`TENANT_DB_NAME_PREFIX`** | Prefix for per-tenant DB names (typo alias `TENANT_DB_NAME_PERFIX` kept for compatibility). |

### API

| Variable | Meaning |
|----------|---------|
| **`PORT`** | API listen port (default `4000`). |
| **`PLATFORM_API_SECRET`** | Privileged API key for platform routes; must match what the dashboard sends server-side. |
| **`WORKER_SECRET`** | Bearer for worker → `/internal/jobs/*`. |
| **`DASHBOARD_URL`** | Public dashboard base URL (redirects, invite links, CSRF origin check). |
| **`ROOT_DOMAIN`** | Wildcard / tenant subdomain parent (e.g. `localhost` vs `example.com`). |
| **`PUBLIC_BASE_URL_SCHEME`** | `http` vs `https` for generated URLs. |
| **`MAX_TENANT_PORT`** | Upper bound for local tenant port allocation. |
| **`STOCKIX_TENANT_APP_ROOT`** | Path to tenant app image/source on provision host. |
| **`REPO_ROOT`** | Monorepo root for scripts and provisioning. |
| **`TENANT_ENV_ROOT`** | Where per-tenant env files are written. |
| **`TRAEFIK_DYNAMIC_DIR`** | Traefik file provider directory for tenant routers. |
| **`TRAEFIK_TENANT_UPSTREAM_HOST`** | Where Traefik sends tenant traffic (e.g. Docker gateway). |
| **`TENANT_INTERNAL_HOST`** | Host for health checks against tenant services. |
| **`CORS_ORIGINS`** | Comma-separated list of allowed browser origins. |
| **`STOCKIX_API_URL`** | Base URL for smoke/helper scripts hitting the API. |
| **`PROVISION_POLL_MS` / `PROVISION_MAX_MS`** | Client polling tuning for long-running provision. |
| **`OWNER_ID`** | Optional default owner UUID for scripts. |
| **`PROVISION_ADMIN_EMAIL`** | Default admin email in provision helpers. |
| **`WORKER_JOB_ID`** | Ad-hoc worker correlation (rare). |
| **`METRICS_ENDPOINT` / `METRICS_AUTH_TOKEN`** | Optional push metrics sink + auth. |

### AUTH

| Variable | Meaning |
|----------|---------|
| **`SESSION_SECRET`** | Signs session cookies / server sessions. |
| **`AUTH_TOKEN_SECRET`** | Signs JWTs (e.g. owner session token). |
| **`LICENSE_SIGNING_SECRET`** | Signs POS **offline** license JWTs (≥32 chars in staging/prod). |
| **`ALLOW_BOOTSTRAP_LOGIN`** | If true/`1`, allows bootstrap login path when configured. |
| **`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`** | Break-glass first admin (when no owner exists). |
| **`PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`** | Credentials for dashboard **server** auth routes. |
| **`DEPLOYMENT_SECRET_KEY`** | ≥32 chars; input to KDF for tenant deployment secrets. |
| **`JWT_SECRET`** | Legacy Stockix JWT (if that code path runs). |
| **`SIGNUP_DISABLED`** | Disables public signup when true. |
| **`SIGNUP_ALLOWED_DOMAINS` / `SIGNUP_ALLOWED_EMAILS`** | Allowlists for signup. |

### DASHBOARD PUBLIC (`NEXT_PUBLIC_*`)

Exposed to the **browser** at build time (Docker build args in prod). Must match your real API and domain.

| Variable | Meaning |
|----------|---------|
| **`NEXT_PUBLIC_STOCKIX_API_URL`** | Browser/API URL (e.g. `https://api.example.com`). |
| **`NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME`** | `http` or `https` for tenant URL building. |
| **`NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN`** | Same idea as `ROOT_DOMAIN`, for client-side links. |
| **`NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST`** | Dev override for tenant hostname resolution. |

### SECURITY HEADERS

Used by the dashboard app for response security headers (`SECURITY_*`). Adjust only if you know the impact on CSP / framing.

### INFRA / DEPLOY

Used by **`infra/prod/docker-compose.yml`** and deploy scripts (and mirrored in root `.env` for tooling).

| Variable | Meaning |
|----------|---------|
| **`POSTGRES_*`** | Compose Postgres credentials and host port mapping. |
| **`ACME_EMAIL`** | Let’s Encrypt / ACME registration email. |
| **`CF_DNS_API_TOKEN`** | Cloudflare API token with DNS edit for certificate DNS challenge. |
| **`STOCKIX_REPO`** | Git checkout path on the **server** (bind-mount for worker). |

### TENANT STACK

| Variable | Meaning |
|----------|---------|
| **`BASE_URL`** | Template for tenant public URL (`{slug}` placeholder). |
| **`PUBLIC_PROXY_PORT` / `PUBLIC_PROXY_SSL_PORT`** | Published ports for tenant edge. |
| **`MONGODB_DATABASE_URL`** | Tenant app MongoDB (Stockix finance stack), not control-plane Postgres. |

### MAIL

SMTP settings for **tenant** / legacy apps that send mail. Empty until you configure a provider.

### WORKER / JOBS

Agenda / Agendash / EasySMS legacy integration. **`AGENDASH_AUTH_*`** protect optional queue UI.

### TEST / TOOLING

Playwright, smoke scripts, optional metadata. Safe to leave empty for normal dev.

---

## Quick reference

- **Full variable list + comments:** [`.env.example`](../.env.example) at repo root.
- **Production-only template:** [`infra/prod/.env.example`](../infra/prod/.env.example).
- **How config loads files:** [`docs/env-guide.md`](env-guide.md).
