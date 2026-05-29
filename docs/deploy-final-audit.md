# Stockix — Final Deploy Audit

**Date:** 2026-05-28  
**Git commit audited:** `0c87be16` (`main`)  
**Context:** Production server manually fixed and running. This audit compares **codebase** vs **known-good server state** and flags anything that would break the **next** automated deploy (`git reset --hard` + SSH script + `docker compose up --wait`).

**Verdict:** **NOT SAFE TO DEPLOY** until **Traefik ping/entrypoint** fixes are committed. Five of eight manual server fixes are already in code; **two Traefik flags are missing** and will recreate the unhealthy-Traefik failure on deploy.

---

## SECTION 1 — WHAT WAS FIXED ON SERVER (must be in code)

| Fix | Status in code (`main`) | Status on server (reported) |
|-----|---------------------------|-----------------------------|
| socket-proxy `tecnativa/docker-socket-proxy:latest` | ✅ | ✅ |
| socket-proxy no `read_only` | ✅ | ✅ |
| socket-proxy tmpfs `/run` + `/tmp` only (no haproxy tmpfs) | ✅ | ✅ |
| `api` healthcheck `http://127.0.0.1:4000/health` | ✅ | ✅ |
| `api-bullmq` healthcheck `http://127.0.0.1:4000/health` | ✅ | ✅ |
| traefik `--entrypoints.traefik.address=:8080` | ❌ **MISSING** | ✅ (manual) |
| traefik `--ping.entrypoint=traefik` | ❌ **MISSING** (still `web`) | ✅ (manual) |
| `SECURITY_HSTS` / `SECURITY_CSP_BASE` quoted in `.env` | ⚠️ **Partial** | ✅ (manual) |

**Notes**

- `.env.example` has correct quoting (lines 201, 205). Local `infra/prod/.env` (gitignored) still has **unquoted** semicolons — same risk if server `.env` is ever regenerated from an old copy without quotes.
- `scripts/load-env-file.sh` safely loads semicolons for the **deploy bash** step; **Docker Compose** still reads `infra/prod/.env` directly via `--env-file` for container substitution — quoting matters for dashboard `SECURITY_*` vars.

---

## SECTION 2 — EVERY REMAINING CODE BUG

### BUG-1: Traefik healthcheck ping uses `web` entrypoint (HTTPS redirect)

**File:** `infra/prod/docker-compose.yml:153-154`  
**Current:**

```yaml
      - --ping=true
      - --ping.entrypoint=web
```

**Should be (server):**

```yaml
      - --ping=true
      - --ping.entrypoint=traefik
```

**Why it breaks deploy:** Port 80 redirects to HTTPS. `traefik healthcheck --ping` against the `web` entrypoint fails → `traefik` stays **unhealthy** → `dashboard` `depends_on: traefik: condition: service_healthy` blocks → `docker compose up --wait` times out or fails.

**Fix:** Change `--ping.entrypoint=web` → `--ping.entrypoint=traefik`.

---

### BUG-2: Traefik internal `:8080` entrypoint not defined

**File:** `infra/prod/docker-compose.yml` (traefik `command:` block, after `websecure`)  
**Current:** No `--entrypoints.traefik.address=:8080`  
**Should be (server):**

```yaml
      - --entrypoints.traefik.address=:8080
```

(Place before or after `--ping=true`; typically before `--ping.entrypoint=traefik`.)

**Why it breaks deploy:** Ping on entrypoint `traefik` requires that entrypoint to exist. Without `:8080`, ping target is invalid → same cascade as BUG-1.

**Fix:** Add `--entrypoints.traefik.address=:8080`.

---

### BUG-3: Staging inherits prod Traefik misconfiguration

**File:** `infra/staging/docker-compose.yml:10-11`  

```yaml
include:
  - path: ../prod/docker-compose.yml
```

**Impact:** Any staging deploy gets the same broken Traefik ping until BUG-1/BUG-2 are fixed in `infra/prod/docker-compose.yml`.

**Fix:** Fix prod compose (staging needs no separate change).

---

### BUG-4: `infra/prod/.env` quoting not enforced in repo (ops)

**File:** `infra/prod/.env` (gitignored, present locally)  
**Current (local copy):**

```
SECURITY_HSTS=max-age=31536000; includeSubDomains
SECURITY_CSP_BASE=default-src 'self'; script-src ...
```

**Should be (matches `.env.example`):**

```
SECURITY_HSTS="max-age=31536000; includeSubDomains"
SECURITY_CSP_BASE="default-src 'self'; ..."
```

**Why it can break deploy:** Compose substitutes `${SECURITY_HSTS}` into the dashboard container. Unquoted semicolons can truncate values depending on parser behavior → wrong CSP/HSTS headers (subtle) or failed substitution.

**Fix:** On the **server**, ensure `infra/prod/.env` uses quotes (you reported this is done). Optionally run `node scripts/fill-prod-env-gaps.mjs` / align from `.env.example` — **do not commit** `.env`.

**Code gap:** No automated check in deploy workflow that `SECURITY_HSTS` values are quoted.

---

## SECTION 3 — COMPLETE KNOWN FAILURE CHECKLIST

| Check | Expected | Code status |
|-------|----------|-------------|
| socket-proxy `docker-socket-proxy:latest` | present | ✅ |
| socket-proxy no `read_only` | absent | ✅ |
| No `haproxy` in socket-proxy tmpfs | absent | ✅ |
| socket-proxy tmpfs `/run` + `/tmp` | present | ✅ |
| API healthcheck `/health` | present | ✅ |
| api-bullmq healthcheck `/health` | present | ✅ |
| Traefik `ping.entrypoint=traefik` | present | ❌ |
| Traefik `entrypoints.traefik.address=:8080` | present | ❌ |
| No `source .env` in deploy.yml | absent | ✅ (`load-env-file.sh`) |
| `CI=true` / non-interactive pnpm | present | ✅ |
| `docker image inspect` before `up --no-build` | present | ✅ |
| No `--no-cache` in deploy build | absent | ✅ |
| `NODE_ENV=development pnpm install` on VPS | present | ✅ |
| `SECURITY_HSTS="..."` in `.env.example` | quoted | ✅ |
| pgcrypto in `0053_owner_invite_token_hash.sql` | present | ✅ |
| `DB_CONNECT_TIMEOUT_SECONDS` in platform env anchor | present | ✅ |
| `DB_MAX_LIFETIME_SECONDS` in platform env anchor | present | ✅ |
| db-backup not `amazon/aws-cli` + cron | alpine loop | ✅ |
| Dashboard `output: standalone` | present | ✅ |

**Score:** 16/18 pass — **2 critical failures** (Traefik).

---

## SECTION 4 — ENV VARS STATUS

### Production required by `@repo/config` (`validateRequiredEnvForProfile('production')`)

| Variable | In `infra/prod/.env` | In compose (`x-stockix-platform-env` or service env) |
|----------|----------------------|------------------------------------------------------|
| `DATABASE_URL` | ✅ set | ✅ per-service override |
| `DB_POOL_MAX` | ✅ | ✅ anchor |
| `DB_IDLE_TIMEOUT_SECONDS` | ✅ | ✅ anchor |
| `DB_CONNECT_TIMEOUT_SECONDS` | ✅ | ✅ anchor |
| `DB_MAX_LIFETIME_SECONDS` | ✅ | ✅ anchor |
| `PLATFORM_API_SECRET` | ✅ | ✅ anchor |
| `WORKER_SECRET` | ✅ | ✅ anchor |
| `SESSION_SECRET` | ✅ | ✅ anchor |
| `DASHBOARD_URL` | ✅ | ✅ anchor |
| `AUTH_TOKEN_SECRET` | ✅ | ✅ anchor |
| `DEPLOYMENT_SECRET_KEY` | ✅ | ✅ anchor |
| `LICENSE_SIGNING_SECRET` | ✅ | ✅ anchor |
| `CONTROL_PLANE_REDIS_URL` | ✅ | ✅ anchor |

All 13 required vars: **present in local `infra/prod/.env` and referenced in compose.**

### Dashboard security headers (semicolon values)

| Variable | `.env.example` | Local `infra/prod/.env` | Server (reported) |
|----------|----------------|-------------------------|-------------------|
| `SECURITY_HSTS` | ✅ quoted | ❌ unquoted | ✅ quoted (manual) |
| `SECURITY_CSP_BASE` | ✅ quoted | ❌ unquoted | ✅ quoted (manual) |

---

## SECTION 5 — FIX PLAN (ordered)

| Priority | Fix | File | One-line change |
|----------|-----|------|-----------------|
| **P0** | Traefik ping entrypoint | `infra/prod/docker-compose.yml` | `--ping.entrypoint=web` → `traefik` |
| **P0** | Traefik internal entrypoint | `infra/prod/docker-compose.yml` | Add `--entrypoints.traefik.address=:8080` |
| **P1** | Quote security headers on server | `infra/prod/.env` (VPS only) | Wrap `SECURITY_HSTS` and `SECURITY_CSP_BASE` in double quotes |
| **P2** | Optional: deploy guard for quotes | `.github/workflows/deploy.yml` | After `load-env-file.sh`, grep/warn if `SECURITY_HSTS=` unquoted |
| **P3** | Pin socket-proxy digest | `infra/prod/docker-compose.yml` | Replace `:latest` with immutable digest when stable |

**Already done (no action):** socket-proxy image/tmpfs, api/api-bullmq `/health`, db-backup alpine loop, platform DB pool env, migrate pgcrypto, deploy workflow guards.

---

## SECTION 6 — DEPLOY WORKFLOW STEP-BY-STEP (production)

**Job:** `deploy` → `Deploy over SSH` (`.github/workflows/deploy.yml`)

| Step | What runs on VPS | Failure modes |
|------|------------------|---------------|
| 1 | `git fetch` / `reset --hard origin/main` | SSH timeout, auth |
| 2 | Guards: API Dockerfile, no `api-bullmq` build | Stale tree |
| 3 | `. scripts/load-env-file.sh infra/prod/.env` | Missing `.env` file |
| 4 | `NODE_ENV=development pnpm install` | OOM, disk, lockfile |
| 5 | `db:migrate` + `verify-schema` | DB down, migration error |
| 6 | `BACKUP_B2_BUCKET` non-empty | Exits if empty |
| 7 | `docker compose build` api, dashboard, infra-worker | 15–30+ min, OOM |
| 8 | `docker image inspect` × 3 | Build failed silently |
| 9 | `docker compose up --wait` (traefik, postgres, redis, socket-proxy, api, api-bullmq, dashboard, infra-worker, db-backup) | **Traefik unhealthy (BUG-1/2)**, api unhealthy, timeout |
| 10 | `curl` `https://${API_DOMAIN}/ready` | DNS/TLS not ready (external readiness — OK to use `/ready`) |
| 11 | `curl` `https://${ROOT_DOMAIN}/` | Dashboard down |
| 12 | `pnpm docker:prebuild` | **Non-fatal** — tenant images may be missing |

**Rollback gap:** On failure, only `api`, `api-bullmq`, `dashboard`, `infra-worker` images are retagged. **Traefik / socket-proxy / postgres are not rolled back.**

**Staging:** `deploy-staging.yml` includes same prod compose via `infra/staging/docker-compose.yml` → same Traefik bugs.

---

## SECTION 7 — OTHER AUDIT FINDINGS (non-blocking)

| Area | Finding |
|------|---------|
| **Deploy external curl** | Uses `/ready` — correct for end-to-end readiness (returns 200/503, auth bypassed in `auth.ts`). Container healthchecks correctly use `/health`. |
| **Dockerfiles** | Self-contained multi-stage builds; no host `dist`/`.next` copies. API Node 20, worker Node 22. |
| **`.npmrc`** | `confirm-modules-purge=false` — aligns with deploy `PNPM_CONFIG_CONFIRM_MODULES_PURGE=false`. |
| **Migrations** | `0053` includes `CREATE EXTENSION IF NOT EXISTS pgcrypto`; `migrate.ts` also ensures extension. |
| **socket-proxy `:latest`** | Unpinned — can drift between deploys; server reportedly needs `:latest`. |
| **Quality gate** | Does not validate compose Traefik flags or prod `.env` quoting. |
| **Sentry release step** | `if: env.SENTRY_DSN != ''` — may not behave as intended if env not in job `env:` block (warning only). |

---

## SECTION 8 — DEPLOY WILL SUCCEED WHEN

- [ ] **BUG-1 & BUG-2** fixed in `infra/prod/docker-compose.yml` and pushed to `main`
- [ ] Server `infra/prod/.env` has quoted `SECURITY_HSTS` / `SECURITY_CSP_BASE` (verify on VPS after any `.env` edit)
- [ ] `docker compose -f infra/prod/docker-compose.yml config` exits 0
- [ ] `pnpm quality-gate:local` or CI quality-gate green on deploy commit
- [ ] SSH + firewall stable (`EC2_HOST` reachable from GitHub Actions)
- [ ] DNS/TLS for `API_DOMAIN` / `ROOT_DOMAIN` point to VPS
- [ ] Push to `main` → **Deploy production** job green end-to-end

---

## SECTION 9 — SIMULATED DEPLOY SEQUENCE (Phase 6)

| Check | Result |
|-------|--------|
| Git HEAD | `0c87be16` |
| `infra:worker:build` script in `package.json` | ✅ |
| `apps/api/Dockerfile` in-image build | ✅ |
| Migration count | 54 SQL files in `packages/db/drizzle/` |
| `0053` pgcrypto | ✅ |
| `.dockerignore` excludes `node_modules`, `.next`, `dist` | ✅ |
| `docker compose config` | **Not run** (audit instruction: no docker commands) |

---

## Summary

| Category | Count |
|----------|-------|
| Critical code bugs | **2** (Traefik ping + entrypoint) |
| Ops / server-only gaps | **1** (`.env` quoting — verify on VPS) |
| Manual fixes already in code | **5** |
| Known-failure checklist pass | **16/18** |

**Next action:** Apply **P0** Traefik compose changes, commit, push, then re-run **Deploy production**. Do not rely on manual `docker compose` edits on the server — the deploy script **overwrites** compose from git on every run.

---

*Audit only — no code or infrastructure changes were made except this document.*
