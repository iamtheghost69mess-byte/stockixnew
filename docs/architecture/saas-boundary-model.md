# SaaS Boundary Model (Locked)

This document is the governance lock for runtime boundaries and environment ownership.

## Architecture Diagram

```text
                +--------------------+
                |      scripts/*     |  (tooling)
                +----------+---------+
                           |
OS ENV  ------------------>|
                           v
                +--------------------+
                |   packages/config  |
                |  env + publicConfig|
                +----+-----------+---+
                     |           |
                     |           |
                     v           v
              +-----------+   +-----------+
              | apps/api  |   | apps/dashboard |
              +-----+-----+   +------+----+
                    |                |
                    | HTTP           | HTTP
                    v                v
                 +----------------------+
                 | infra/worker-service |
                 +----------+-----------+
                            |
                            v
                      +-----------+
                      | packages/db |
                      +-----------+
```

## Allowed Dependency Graph

- `apps/* -> @repo/config`
- `apps/* -> @repo/ui`
- `apps/* -> @repo/shared`
- `apps/api -> @repo/db`
- `infra/* -> @repo/config`
- `infra/* -> @repo/db`
- `services/* runtime -> @repo/config` (no raw `process.env`)

## Forbidden Dependency Graph

- `apps/dashboard -> @repo/db`
- `apps/* -> infra/*`
- `infra/* -> apps/*`
- `packages/* -> infra/*`
- `packages/config -> apps/* | infra/* | services/* | @repo/db`
- runtime code in `apps/*`, `packages/*`, `services/*` using raw `process.env` (except `packages/config`)

## Env Flow Model

```text
OS ENV
  -> packages/config (validation + typed access)
     -> env (server/private)
     -> publicConfig (client/public-safe)
        -> runtime consumers
```

## Worker / API / DB Separation Rules

- **API** owns lifecycle decisions and control-plane policy.
- **Worker** executes jobs and persists outcomes, no policy brain.
- **DB package** owns schema and data access helpers only.

## Config System Rules

- Single runtime source of truth: `@repo/config`.
- `publicConfig` is the only frontend-safe env surface.
- Tooling-only env usage is allowed in:
  - `scripts/*`
  - `infra/*`
  - explicit build/test tooling files.

## Enforcement

- `pnpm lint:boundaries` performs:
  - runtime `process.env` leak detection
  - cross-layer import checks
  - `@repo/config` leaf-safety checks
  - dashboard-to-db ban checks
- CI job `Architecture Governance` must pass before merge.
