# PLAN.md — Production SaaS Architecture Standard (v2)

## 1) Purpose

This document is the enforceable architecture contract for production readiness in this monorepo.
It defines strict ownership, isolation, security, operability, and scalability requirements.

This standard is valid only when all phase gates pass.

## 2) Scope and System Model

### 2.1 Layer Responsibilities (non-negotiable)

- `apps/dashboard`: UI rendering and HTTP client/proxy only.
- `apps/api`: only authority for auth, identity, business policy, job policy, and DB orchestration.
- `infra/worker-service`: execution agent only (runs assigned work, reports outcomes).
- `packages/db`: schema and generic query primitives only.
- `packages/config`: only runtime env parsing/validation authority.
- `infra/*`: platform adapters (compose, traefik, runtime wiring), no domain policy.

### 2.2 Core Flow

- Browser -> Dashboard -> API -> DB
- API -> Worker (work assignment and policy-governed transitions)
- Worker -> external systems (docker/http/scripts) -> API result reporting

## 3) Global Constraints

### 3.1 Hard Forbidden (all phases)

- No cross-layer imports:
  - `apps/* -> infra/*` forbidden
  - `infra/* -> apps/*` forbidden
  - `packages/* -> infra/*` forbidden
- No auth/session/MFA/token logic outside `apps/api`.
- No runtime `process.env` outside `packages/config` (except explicit tooling paths).
- No queue lifecycle policy in worker or db package.
- No DB access in dashboard.

### 3.2 Enforcement

- CI must run boundary checks and architecture validation on PRs.
- Any failed gate marks system not production-ready.
- Fixes must be made in violating layer only (no compensating violations elsewhere).

## 4) Phase 1 — Dashboard Isolation

### Objective

Dashboard is a presentation/proxy layer only, never an authority layer.

### Allowed

- UI components, route rendering, client state.
- Calls to dashboard API routes and/or API endpoints.
- Non-authoritative UX checks (formatting, empty fields).

### Forbidden

- DB imports/usages (`@repo/db`, `createDb`, `drizzle-orm`).
- Session/JWT/MFA signing or verification.
- Role/permission/business-policy decisions.
- Persistent backend orchestration decisions in UI pages.

### PASS Criteria

- No DB imports in `apps/dashboard/**`.
- Auth decisions come from API responses, not UI policy branching.
- Dashboard acts as API consumer/proxy only.

## 5) Phase 2 — API Ownership

### Objective

API is single authority for identity, auth, policy, and business logic.

### API Must Own

- Login/logout/session validation.
- MFA setup/enable/disable/verify flows.
- Invite issuance/validation/acceptance.
- Token signing/verification.
- Password verification and account lockout policy.
- RBAC/permission decisions.
- Job lifecycle policy (claim/retry/dead/requeue rules).

### Forbidden Outside API

- Session/token creation and verification logic.
- Password hash compare logic.
- MFA verification logic.
- Role/policy evaluation logic.
- Job retry/backoff/dead-letter policy decisions.

### PASS Criteria

- Auth/business policy code exists only under `apps/api/src/**`.
- Dashboard and worker consume API decisions instead of encoding policy.

## 6) Phase 3 — Execution Isolation (Worker/Infra/DB Purity)

### Objective

Worker and infra execute; API decides policy.

### Worker Contract

- Claim work from API.
- Execute assigned handler.
- Report raw outcome (success/failure + execution metadata).

### Worker Forbidden

- Retry policy/backoff decisions.
- Lifecycle state transition policy.
- Business-rule branching.
- Multi-step workflow policy ownership.

### DB Package Contract

- Schema definitions.
- Generic query helpers.
- No orchestration/state-machine/workflow semantics.

### Infra Contract

- Runtime adapters and command execution.
- No domain ownership or policy decisions.

### PASS Criteria

- Worker has no lifecycle policy logic.
- API owns claim/retry/dead/requeue semantics.
- DB package contains no orchestration behavior.

## 7) Phase 4 — Config and Environment Governance

### Objective

Single runtime source of truth for environment parsing and validation.

### Rule

- Only `packages/config` may read `process.env` in runtime code.
- All runtime layers consume typed config objects.

### Allowed Exceptions

- Scripts/build/test/CI tooling explicitly allowlisted.

### Security Policy

- Root and production env templates must use `__MUST_OVERRIDE__` for sensitive values.
- Startup must fail fast when required secrets are missing for target profile.

### PASS Criteria

- No runtime env access outside config package.
- No duplicate runtime env parsing systems.
- Config package remains dependency leaf node.

## 8) Phase 5 — Production Hardening and Operability

### 8.1 Reliability and Compensation

- Provision/deprovision must define compensating actions for side effects.
- Compensation state must be persisted and resumable.
- All failure paths must be idempotent across retries/restarts.

### 8.2 Dead-letter and Replay

- Dead jobs must be queryable by operators.
- Replay/requeue actions must be explicit and audited.
- Retry policy must be deterministic and documented.

### 8.3 Least Privilege Runtime

- Production compose services enforce `no-new-privileges`.
- App-facing services prefer `read_only` rootfs and explicit writable mounts.
- Exceptions must be documented inline with rationale.

### 8.4 Observability Requirements

- Structured logs with stable event schema.
- Required metrics:
  - API latency and status distribution
  - worker success/failure
  - retry/dead-letter transition counts
- Correlation IDs propagate end-to-end:
  - dashboard -> API -> worker -> outbound callbacks

### 8.5 Security and Secret Handling

- Secrets never logged in cleartext.
- Secret material persisted only when required and encrypted at rest where applicable.
- Rotation capability must exist for high-impact secrets.

### PASS Criteria

- Replay/dead-letter operational path verified.
- Correlation and metrics coverage verified.
- Least-privilege baseline verified in production compose.

## 9) Scalability and Multi-Tenant Isolation Requirements

### 9.1 Tenant Isolation Model

- Control-plane and tenant runtime boundaries must be explicit.
- Tenant identity and tenancy scoping must be enforced at API boundary.
- Cross-tenant data access is forbidden by default.

### 9.2 Throughput and Backpressure

- Queue consumers must enforce bounded concurrency.
- System must define overload behavior (reject, defer, or throttle).
- Idempotency required for externally retried writes.

### 9.3 Horizontal Scalability

- API and worker must be stateless or externally state-backed.
- Job leasing/claiming must be safe under multiple workers.
- No singleton assumptions in runtime paths.

### PASS Criteria

- Multi-worker execution validated without duplicate side effects.
- Backpressure behavior documented and tested.

## 10) Production Readiness Gates

A release is production-ready only if all gates pass:

- G1: Phase 1 pass
- G2: Phase 2 pass
- G3: Phase 3 pass
- G4: Phase 4 pass
- G5: Phase 5 pass

If any gate fails:

- System is not production-ready.
- Progress to next phase is blocked.
- Violations must be fixed in owning layer.

## 11) CI Verification Matrix (minimum)

- Boundary lint (`scripts/lint-boundaries.mjs`)
- Architecture phase validator (`scripts/architecture-validation.mjs`)
- Unit/integration tests for auth/job policy paths
- Compose security baseline check for production manifests
- Env template and required-secret validation

## 12) Change Management Rules

- Architecture policy changes require explicit update to this document.
- New runtime capability must declare owning layer and gate impact.
- Temporary exceptions require expiry date and removal ticket.