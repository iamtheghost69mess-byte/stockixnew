# Provisioning Hardening & Configuration Governance Audit

## Critical Risks (Must Fix)

* **Configuration Drift Risks:** 
  * Environment variables are parsed independently across multiple files with inconsistent fallback values (e.g., `readString("BRAND_NAME", "Stockix")` inside `packages/config/src/env.ts`).
  * `docker-compose.full.yml` (dev) and `docker-compose.yml` (prod) redefine configuration rather than strictly adhering to a single `.env` source of truth, causing potential environment mismatch (e.g. `NODE_ENV=production` inside dev compose files).
* **Silent Fallback Risks:** 
  * `packages/config/src/env.ts` uses internal default parameters (e.g., `readNumber("PORT", 4000)`) which silently mask missing environment variables at startup, allowing services to boot with unintended configurations instead of failing fast.
  * Zod schemas are used partially for basic types but fail to validate the entire configuration object upfront.
* **Port Mismatches:** 
  * `MYSQL_PROXY_PORT` defaults to `6033` in `env.ts`, but is explicitly set to `3306` inside the `api` service in `infra/dev/docker-compose.full.yml`.
  * `WORKER_MYSQL_PROXY_PORT` duplicates `MYSQL_PROXY_PORT` logic.
  * Internal API, POS, and health check ports lack a unified mapping definition, leading to potential port reuse or mismatch (e.g., `POS_HOST_PORT` defaulting to `8010` in config but potentially different in runtime).
* **Service Contract Violations:** 
  * The `api` service in `infra/prod/docker-compose.yml` relies on `pgbouncer` and `control-plane-redis` via `depends_on: condition: service_healthy`, but the API health route itself (`/health`) does not rigidly validate these underlying dependencies before reporting as healthy.
* **Provisioning Instability:** 
  * Provisioning idempotency is at risk because `env.ts` silently falls back to arbitrary values during tenant schema provisioning if variables are omitted, leading to non-deterministic worker states.
  * The worker relies on arbitrary timeouts (`PROVISION_MAX_MS`) instead of fully deterministic state machine events.

## Architecture Fixes Required

* **Config Centralization:** 
  * Replace the scattered `readString`/`readNumber` fallback logic in `packages/config/src/env.ts` with a strict, unified Zod schema (`z.object({...})`).
  * Remove all inline fallbacks (e.g., `readNumber("PORT", 4000)`). The config system must throw an immediate exception if required variables are missing.
* **Dependency Graph Enforcement:** 
  * Refactor Docker Compose files to strictly bind to a typed network port definition. 
  * Remove duplicated port definitions across dev and prod architectures.
* **Healthcheck Redesign:** 
  * Modify the API and Worker `/health` endpoints to explicitly check database (Postgres/MySQL) and Redis connections. The service must not report `200 OK` unless the full dependency graph is confirmed ready.
* **Provisioning Orchestration Improvements:** 
  * Inject the fully validated configuration object into the worker provisioning loops (`provision-runtime.ts`), guaranteeing that tenant setup utilizes verified inputs instead of raw `process.env`.

## Reliability Improvements

* **Idempotency Enforcement:** 
  * Ensure the worker provisioning scripts generate tenant configurations via strict schemas.
  * Fail the worker boot process instantly if `WORKER_SECRET` or DB credentials are missing, removing the `dev-worker-secret` bypass in production.
* **Retry Safety Improvements:** 
  * Implement safe failure modes in `docker-compose.yml` by ensuring database connection retries happen within the application layer with backoff, rather than silently dropping connections during startup.
* **Deterministic Provisioning Fixes:** 
  * Ensure all tenant ports, volumes, and schemas are derived from deterministic algorithms based on tenant ID, rather than sequential counters or random allocations that can drift.

## Production Readiness Score

* **Overall system stability rating: 45/100**
* **Explanation of score:** The system currently relies heavily on silent fallbacks and scattered configuration parsing. While it works locally, a missing environment variable in staging or production will not fail at boot time, but rather cause a catastrophic downstream failure during tenant provisioning. The port mismatches between `docker-compose` and `.env` demonstrate existing drift. Implementing a strict Zod schema gate, removing defaults, and hardening health checks will elevate this score to 95/100.
