# Final Architecture Lock Report
## Zero Drift Production Enforcement

---

## Architecture Violations

* **Runtime Boundary Violations**: The system currently employs conditional logic based on environments to alter networking paths (e.g., `if (rootDomain === 'localhost')` falling back to `127.0.0.1`). This violates the hard runtime boundary model by allowing development networking assumptions to bleed into the unified worker codebase.
* **Orchestration Conflicts (Compose vs. Swarm)**: The `infra/prod/docker-compose.yml` mixes `deploy.placement.constraints` (Swarm) with explicit host-bound `ports: - "127.0.0.1:..."` directives (Compose). This creates a hybrid execution path that breaks true Swarm ingress and overlay networking.
* **Networking Issues (Localhost Leaks)**: Extensive usage of `127.0.0.1` and `localhost` in service-to-service communication inside `worker-service/domain/provisioning/*.ts`. In a Dockerized environment, this incorrectly routes traffic to the worker container's own loopback interface instead of the intended target service.
* **Provisioning Design Flaws**: The provisioning pipeline operates as a monolithic job with an excessive global timeout of 45 minutes (`WORKER_JOB_EXECUTION_TIMEOUT_MS: 2700000`). It lacks a granular, state-machine-based flow, making it vulnerable to partial state corruption and dead-letter queue lockouts.
* **Docker Image Version Drift**: The system lacks a locked image strategy. Images drift across `node:22-alpine`, `node:24-alpine`, `node:20`, and `node:20-bookworm-slim`, causing severe discrepancies in the underlying OS (musl vs glibc) and Node capabilities.

---

## Required Fixes

1. **Runtime Separation Fixes**:
   * Eliminate all environment-based conditional URL guessing.
   * Implement a centralized, fail-fast configuration bootloader. If a runtime mode or required service DNS name is missing, the container must crash instantly (`process.exit(1)`).
2. **Architectural Changes**:
   * Cleanse production orchestration files. Ensure `infra/prod/docker-compose.yml` contains zero host-bound port overrides and relies strictly on Swarm overlay networks for inter-service communication.
   * Restrict Docker Compose files exclusively to the `infra/dev/` boundary.
3. **Provisioning Redesign Steps**:
   * Refactor the monolithic BullMQ provisioning job into a distributed saga (State Machine).
   * Define discrete, independent stages (e.g., DB Initialization, Proxy Sync, Email Dispatch) with granular, isolated timeouts (e.g., 30 seconds for DB Init, 5 seconds for Email).
4. **Docker Standardization Plan**:
   * Enforce the two-tier image strategy:
     * **Tier A (Core Services)**: Lock API, Workers, and Provisioning to `node:22-alpine`.
     * **Tier B (Native Services)**: Lock Finance and heavy native-dependency apps to `node:22-bookworm-slim`.
   * Standardize all `Dockerfile` implementations to inherit from these approved base tiers.

---

## Enforced System Design

### Final Architecture Blueprint

* **Unified Configuration Layer**: All environment variables are parsed and validated via a strict schema (e.g., Zod) prior to application boot. Missing configurations trigger an immediate crash, eliminating silent runtime failures.
* **Deterministic Provisioning**: Provisioning is executed as an event-driven state machine. Every stage is strictly idempotent and safe to retry without side effects.
* **Strict Docker Networking**: All service-to-service communication utilizes explicit Docker Swarm DNS (e.g., `http://stockix-api:4000`). Host-based loopbacks are permanently banned in the containerized runtime.

### Runtime Mode Definitions

1. **MODE 1 — DEVELOPMENT**: Exclusively uses Docker Compose (`infra/dev/`). Permits relaxed networking rules for local debugging but shares no execution paths with production orchestrators.
2. **MODE 2 — STAGING**: A 1:1 structural mirror of production. Utilizes the identical Docker Swarm topology, networking models, and provisioning logic as Mode 3.
3. **MODE 3 — PRODUCTION**: A fully locked Swarm environment. No local overrides, hybrid configurations, or fallback logic are permitted. 

### CI Enforcement Rules

The Continuous Integration pipeline must enforce the following gates. The build will fail if:
* `grep` detects `127.0.0.1` or `localhost` usage within core `worker-service` or `api` logic.
* Swarm attributes (`deploy.*`) are detected within `infra/dev/` compose files.
* Host-bound ports (`127.0.0.1:XXXX:YYYY`) are detected within `infra/prod/` orchestration files.
* Unapproved Node.js versions or base OS images appear in any `Dockerfile`.

---

## System Stability Score

**35/100**

## FINAL PRODUCTION VERDICT

**NOT APPROVED**
