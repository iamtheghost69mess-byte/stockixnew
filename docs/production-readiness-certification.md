# Production Readiness & Docker Architecture Certification Review

## Critical Blockers (Must Fix Before Production)

* **Docker Architecture Issue (`apps/pos-backend/Dockerfile`) - Production use of TSX**: 
  The runner stage installs `tsx` globally and executes the backend via `CMD ["tsx", "app.js"]`. The Dockerfile comments explicitly mention this is to execute `.ts` files on the fly. `tsx` is a development tool meant for local execution. Using it in production causes significant CPU and memory overhead, bypasses build-time type/syntax validation, and introduces unnecessary development tools (like `npm` momentarily) into the runtime layer. 
  **Fix:** Pre-compile all TypeScript files to JavaScript in the `build` stage and execute using pure `node` in the runner stage.
* **Docker Architecture Issue (`services/pms/Dockerfile`) - Unpruned Development Dependencies**:
  The `runner` stage copies `node_modules` directly from the `build` stage (`COPY --from=build /app/node_modules ./node_modules`), where `pnpm install` was run to install all dependencies. This bundles all `devDependencies` (linters, testing frameworks, compilers) into the final production image. This vastly inflates the image size and drastically increases the container's security attack surface.
  **Fix:** Introduce a `deps` stage that prunes dev dependencies (e.g., `pnpm prune --prod`) before copying to the runner, or use `pnpm deploy --prod`.

## High Risk Issues

* **Security Misconfigurations - Root User Execution (`apps/api`, `apps/dashboard`, `services/pms`)**:
  While `pos-backend` and `stockix-finance` implement the best practice of switching to a non-root user (`USER nodejs` and `USER stockix`), the `api`, `dashboard`, and `pms` services do not. These containers run as `root` by default, violating the principle of least privilege. If a remote code execution vulnerability is exploited in these Node.js services, the attacker gains root access within the container namespace.
  **Fix:** Add `USER nodejs` (or similar unprivileged user) to the `runner` stages of these Dockerfiles.

## Medium Risk Issues

* **Optimization Opportunity (`services/pms/frontend/Dockerfile`) - Next.js Standalone Image Size**:
  The Dockerfile correctly uses the Next.js standalone output but still creates a `deps` stage running `npm install --omit=dev`. Next.js standalone mode bundles its own scoped `node_modules` inside `.next/standalone`. While harmless, the extra `deps` installation in the runner is often redundant and adds unnecessary layers and size to the image.
* **Architectural Fragility - MongoDB Replica Set Initialization**:
  The `stockix-mongo-rs-init` service in `infra/shared/docker-compose.yml` depends on a bash script execution to initialize the replica set. While generally idempotent, relying on a one-shot container in Swarm for database initialization can lead to race conditions if the container is preempted or fails silently before `rs.initiate()` completes. 

## Architecture Score

* **Production Readiness Score**: **90/100**
* **Explanation**: The overall infrastructure design is outstanding and exceptionally mature. The use of ProxySQL for MySQL connection pooling, PgBouncer for PostgreSQL, Docker Socket Proxy to secure the Docker daemon from Traefik and workers, strict overlay network segmentation (`stockix_internal`, `stockix_public`, `stockix-shared`), and explicit resource limits (`mem_limit`, `cpus`) demonstrates a highly scalable, enterprise-grade architecture. The compose configurations handle complex multi-tenant routing flawlessly. The score deduction is solely due to the Dockerfile execution risks (development tooling leaking into production execution via `tsx` and unpruned `node_modules`), and inconsistent user privileges across services.

## Deployment Recommendation

* **NOT APPROVED FOR PRODUCTION** (pending resolution of Critical Blockers).
