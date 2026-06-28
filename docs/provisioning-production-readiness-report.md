# Full Provisioning System Production Readiness Audit
## End-to-End Architecture & Reliability Gate Report

---

## 1. END-TO-END PROVISIONING FLOW AUDIT 
**Status: ❌ CRITICAL FAILURES DETECTED**

The provisioning lifecycle was audited to ensure no missing steps, duplicate executions, or partial provisioning states. While some guardrails exist, there are critical gaps:

* **Partial Provisioning State Risks**: The system lacks a robust "Distributed Saga" or state-machine pattern for the provisioning flow. While the codebase uses `Idempotency-Key: stockix-provision-${tenantId}` in `bootstrap-pos-org.ts` and `Idempotency-Key: stockix-org-provision-${controlPlaneOrganizationId}` to prevent blind duplication, it does not safely rollback partial state. 
* **Database Idempotency vs Side-Effect Idempotency**: `provision-runtime.ts` states that `CREATE DATABASE IF NOT EXISTS` is relied upon for idempotency. However, if the worker crashes *after* creating the organization but *before* triggering external emails or sync logic, the next retry might skip the DB but also skip the unsent emails if the checkpoints are not strictly separated. 
* **Dead-Letter Queue Lockouts**: The BullMQ job execution timeout is configured to an extreme 45 minutes (`WORKER_JOB_EXECUTION_TIMEOUT_MS: 2700000`). If a worker crashes mid-provisioning, the job remains "locked" in an active state for 45 minutes before it is pushed back to the queue for a retry, leaving the tenant in a stuck, corrupted partial state.

---

## 2. ARCHITECTURE VALIDATION & SWARM/COMPOSE CONTRADICTIONS
**Status: ❌ CRITICAL FAILURES DETECTED**

The system's orchestration architecture exhibits severe contradictions, mixing Docker Compose and Docker Swarm paradigms improperly.

* **Mixed Orchestration**: The `infra/prod/docker-compose.yml` uses Docker Swarm specifics, such as `deploy.placement.constraints: - node.role == manager` and configuring Traefik with `--providers.swarm=true`. 
* **Host-Bound Port Leakage**: Despite being a Swarm configuration, the compose file exposes raw host-bound ports (e.g., `ports: - "127.0.0.1:54330:5432"` for Postgres and `127.0.0.1:8080:8080` for Traefik API). In a Swarm environment, services should not bind directly to localhost of the manager node; they must use overlay networks and ingress routing. 
* **Statelessness Violations**: Workers are heavily dependent on host-level mounts (like `/var/run/docker.sock` and `/opt/stockix/tenants`), which forces them onto specific manager nodes and breaks true stateless Swarm distribution.

---

## 3. NETWORKING & HARD-CODING ELIMINATION 
**Status: ❌ CRITICAL FAILURES DETECTED**

A massive violation of container networking principles was detected across the provisioning worker codebase. 

* **Container Localhost Loopback Leaks**: The system is riddled with hardcoded `127.0.0.1` and `localhost` mappings inside the code intended to run within Docker containers. 
  * In `worker-service/domain/provisioning/adapters/verify-pos-integration.ts`, it returns: `return 'http://127.0.0.1:${posHostPort}';`.
  * In `worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts`, it returns: `return 'http://127.0.0.1:${port}';`.
  * In `worker-service/domain/provisioning/build-finance-internal-url.ts`, it states: `Worker on the host uses 127.0.0.1; POS containers must use host gateway.`
  * In `worker-service/src/module-stacks.ts`, it explicitly checks `if (rootDomain === "localhost")` and falls back to `127.0.0.1`.
* **The ECONNREFUSED Failure Mode**: Because these workers execute *inside* Docker (`stockix-infra-worker`), making a request to `127.0.0.1` does not route to the host machine or other containers. It routes to the worker container's own internal loopback interface, resulting in immediate `ECONNREFUSED` errors during provisioning steps. All services **MUST** communicate using Docker DNS (e.g., `http://pos-backend:8010`).
* **Silent Fallbacks**: Files like `combined-org-pos-provision.ts` do `http://${process.env.API_HOST ?? "localhost"}:${apiConfig.port}`. This lazy fallback behavior masks missing environment variables, pushing the crash to runtime rather than failing fast at container boot.

---

## 4. PROXYSQL / DATABASE PROVISIONING VALIDATION
**Status: ❌ CRITICAL FAILURES DETECTED**

* **Worker to Shared DB Leakage**: The `provisioner.ts` handles logic for connecting to the shared MySQL and Mongo instances: `if (process.env.WORKER_SHARED_MYSQL_HOST?.trim() === "127.0.0.1")`. 
* **Direct DB Bypass**: There is evidence of direct DB connections circumventing ProxySQL when host variables drop to `127.0.0.1` in development setups, bleeding into production checks. 
* Tenant DB isolation during provisioning is jeopardized because the worker expects ProxySQL to be available on `localhost` (port 6033) when running locally, but in Swarm, it must route to `stockix-mysql-proxy:6033`. The current fallback logic confuses the two modes.

---

## 5. DOCKER IMAGE & BUILD VALIDATION 
**Status: ❌ CRITICAL FAILURES DETECTED**

The Docker environments are dangerously fragmented, leading to "works on my machine" bugs and unpredictable production crashes.

* **Node Version Fragmentation**:
  * `infra/worker-service/Dockerfile`: `node:22-alpine`
  * `apps/pos-backend/Dockerfile`: `node:22-alpine`
  * `services/chatlive/docker/Dockerfile`: `node:24-alpine`
  * `services/posnew/apps/pos-backend/Dockerfile`: `node:20`
* **OS Distribution Mixing**: `services/stockix-finance/packages/webapp/Dockerfile` uses `node:20-bookworm-slim` (Debian/glibc), while everything else uses Alpine (musl). This inconsistency will lead to obscure runtime failures for any native C++ Node addons (like `bcrypt` or `sharp`).

---

## 6. ENVIRONMENT & CONFIG DEPENDENCY VALIDATION
**Status: ❌ CRITICAL FAILURES DETECTED**

* **Direct Env Reads vs Validation**: The system directly reads `process.env.*` in deep logic functions instead of using a centralized schema validation library (like Zod) at boot. This allows a container with a misconfigured `.env` to start properly, only to crash halfway through a tenant's provisioning flow because a specific variable (like `STOCKIX_FINANCE_INTERNAL_HOST`) is missing. 

---

## REQUIRED FIX PLAN 

To pass the production readiness gate, the following actions MUST be completed:

1. **Purge All Localhost Code**:
   * Scrub `infra/worker-service/domain/provisioning/*.ts` of ALL `127.0.0.1` and `localhost` strings.
   * Replace all manual host construction with strict Docker DNS configurations (e.g. `http://api:4000`).
2. **Standardize Docker Architecture**:
   * Align all Dockerfiles to exactly `node:22-alpine`.
   * Eliminate `node:24-alpine`, `node:20`, and `node:20-bookworm-slim`.
3. **Correct Swarm Configs**:
   * If Swarm is used, remove ALL host-port mappings (`127.0.0.1:XXXX:YYYY`) from `infra/prod/docker-compose.yml`.
   * Route external traffic purely through Traefik ingress routing on overlay networks.
4. **Harden the Provisioning Job Queue**:
   * Reduce the `WORKER_JOB_EXECUTION_TIMEOUT_MS` from 45 minutes to a reasonable upper bound (e.g., 5 minutes) to ensure stuck jobs fail and retry swiftly.
   * Centralize environment variable validation at container boot (fail-fast) so missing variables crash the worker *before* it accepts a BullMQ job.

---

## SYSTEM STABILITY SCORE: 42/100

## PRODUCTION VERDICT: 🔴 NOT APPROVED
