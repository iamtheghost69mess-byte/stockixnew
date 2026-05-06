# FINAL.md — Production Readiness Forensic Report

Generated: 2026-05-06

---

## OVERALL VERDICT
PRODUCTION-READY: NO
Total gaps found: 58
Critical (must fix before deploy): 16
Partial (functional but incomplete): 33
Missing (not implemented at all): 9

---

## FOLDER-BY-FOLDER FINDINGS

### apps/api/src/
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Reliability | apps/api/src/index.ts | CRITICAL | Global `onError` returns raw internal error message to clients, risking stack/context leakage. |
| 2 | Reliability | apps/api/src/index.ts | CRITICAL | `/internal/jobs/claim` uses non-atomic claim transition and can double-claim jobs under concurrency. |
| 3 | Security | apps/api/src/routes/auth/index.ts | CRITICAL | Session/MFA cookies are `HttpOnly` and `SameSite`, but not marked `Secure`. |
| 4 | Security | apps/api/src/services/auth/login.ts | CRITICAL | Bootstrap admin fallback login path can be abused if bootstrap creds remain in production. |
| 5 | Reliability | apps/api/src/index.ts | MISSING | No rate limiting on login/MFA/invite acceptance routes. |
| 6 | Observability | apps/api/src/index.ts | PARTIAL | Correlation IDs exist in provisioning flows but not as a universal request-wide contract. |
| 7 | Security | apps/api/src/routes/auth/index.ts | PARTIAL | Cookie-based auth flow lacks explicit CSRF protection checks/tokens. |
| 8 | Security | apps/api/src/services/auth/tokens.ts | PARTIAL | Auth tokens share `PLATFORM_API_SECRET`; no dedicated signing key rotation strategy. |
| 9 | Observability | apps/api/src/audit.ts | PARTIAL | Audit writes exist but logging backend is unstructured `console.error` fallback. |
| 10 | Reliability | apps/api/src/provision-bus.ts | PARTIAL | In-memory event emitter is not cross-instance durable for distributed production. |
| 11 | Contracts | apps/api/src/routes/auth/index.ts | COMPLETE | Login/MFA/invite/session routes are implemented with validation and service wiring. |
| 12 | Contracts | apps/api/src/services/mfa/mfa.ts | COMPLETE | MFA begin/verify/enable/disable lifecycle is implemented end-to-end. |
| 13 | Contracts | apps/api/src/services/invites/invites.ts | COMPLETE | Invite token lookup, expiry enforcement, and acceptance update path are implemented. |
| 14 | Consistency | apps/api/src/services/auth/session-validation.ts | COMPLETE | Session validity checks enforce role/sessionVersion freshness for stale-token invalidation. |

### apps/dashboard/
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Contracts | apps/dashboard/lib/api-client.ts | CRITICAL | Relay does not send `Idempotency-Key`, but API requires it for privileged mutating endpoints. |
| 2 | Security | apps/dashboard/app/(dashboard)/layout.tsx | CRITICAL | No server-side route gate/redirect before rendering protected dashboard routes. |
| 3 | Security | apps/dashboard/proxy.ts | CRITICAL | CSP allows `'unsafe-inline'`/`'unsafe-eval'` and hardcodes localhost `connect-src`. |
| 4 | Observability | apps/dashboard/lib/api-client.ts | MISSING | No request/correlation ID propagation from dashboard boundary to API. |
| 5 | Security | apps/dashboard/app/(auth)/accept-invite/page.tsx | PARTIAL | `confirmPassword` is collected but not validated against `password` client-side. |
| 6 | Reliability | apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx | PARTIAL | Destructive actions navigate without robust `res.ok` failure handling checks. |
| 7 | Security | apps/dashboard/node_modules/@repo/config/src/index.ts | PARTIAL | Default localhost endpoints are safe only if overridden consistently in deploy envs. |
| 8 | Deployment | apps/dashboard/README.md | MISSING | No production hardening/deploy runbook for dashboard configuration. |
| 9 | Contracts | apps/dashboard/app/api/session/login/route.ts | COMPLETE | Session login relay maps to API auth route and keeps token in cookie channel. |
| 10 | Contracts | apps/dashboard/app/api/security/mfa/* | COMPLETE | MFA route relays are present and mapped to existing API MFA endpoints. |
| 11 | Contracts | apps/dashboard/app/api/auth/invite/* | COMPLETE | Invite lookup and acceptance relays map to implemented API endpoints. |

### infra/worker-service/src/
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Reliability | infra/worker-service/src/worker.ts + apps/api/src/index.ts | CRITICAL | Job claim path is race-prone and allows duplicate worker execution. |
| 2 | Reliability | infra/worker-service/src/worker.ts | CRITICAL | Failure reporter call is unguarded; if report fails, worker loop can terminate. |
| 3 | Reliability | infra/worker-service/src/worker.ts | CRITICAL | No graceful shutdown (`SIGTERM`/drain) handling; in-flight jobs can be stranded. |
| 4 | Reliability | apps/api/src/index.ts + packages/db/src/schema.ts | CRITICAL | `claimedAt`/`claimedBy` are not used for stale-running recovery; stuck jobs can persist. |
| 5 | Reliability | infra/worker-service/src/worker.ts | CRITICAL | Lifecycle handler references missing imports (`tenants`, `tenantDeployments`) causing compile/runtime defect. |
| 6 | Reliability | apps/api/src/index.ts + packages/db/src/schema.ts | MISSING | No retry scheduling logic using `attempts/maxAttempts/runAt`. |
| 7 | Reliability | apps/api/src/index.ts + packages/db/src/schema.ts | MISSING | No dead-letter/poison-job handling path for exhausted retries. |
| 8 | Reliability | infra/worker-service/src/worker.ts | MISSING | No persistent job ownership tracking despite generated worker ID. |
| 9 | Contracts | infra/worker-service/src/worker.ts | PARTIAL | Job shape compatibility exists, but no runtime payload validation before execution. |
| 10 | Reliability | infra/worker-service/src/provision-runtime.ts | PARTIAL | Partial post-commit side-effect failures are not fully compensated/reconciled. |
| 11 | Observability | infra/worker-service/src/worker.ts | PARTIAL | Correlation ID handling is strong for provision path but inconsistent across all paths/callbacks. |
| 12 | Contracts | infra/worker-service/src/worker.ts | COMPLETE | Worker supports expected job types (`tenant.provision`, `tenant.deprovision`, `tenant.lifecycle`). |

### packages/db/src/
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Security | packages/db/src/schema.ts | CRITICAL | Secret-at-rest TODO is unresolved for tenant DB/JWT secrets in schema comments. |
| 2 | Consistency | packages/db/src/schema.ts | PARTIAL | MFA state has no DB check constraint enforcing `mfaEnabled` with non-null secret. |
| 3 | Consistency | packages/db/src/schema.ts | PARTIAL | Invite token/expiry coupling has no DB-level invariant/uniqueness enforcement. |
| 4 | Consistency | packages/db/src/schema.ts | PARTIAL | Session lock/counter invariants rely on app logic, not DB check constraints. |
| 5 | Reliability | packages/db/src | MISSING | No transaction/query helper layer for multi-step atomic auth/identity workflows. |
| 6 | Contracts | packages/db/src/index.ts | COMPLETE | Exports (`createDb`, `schema`, allocator) are coherent for API/worker consumption. |
| 7 | Reliability | packages/db/src/allocate-tenant-port.ts | COMPLETE | Atomic sequence-based tenant port allocation reduces race conditions. |
| 8 | Consistency | packages/db/src/schema.ts | COMPLETE | Core relational model for owners/tenants/deployments/jobs/events is present with key indexes/FKs. |

### packages/config/
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Deployment | packages/config/src/index.ts | CRITICAL | Dotenv loading uses `override: true`, enabling local file values to override injected env unexpectedly. |
| 2 | Deployment | packages/config/src/index.ts | CRITICAL | Typoed env key (`TENANT_DB_NAME_PERFIX`) increases silent misconfiguration risk. |
| 3 | Security | packages/config/src/index.ts | MISSING | No first-class security-header configuration knobs (HSTS/CSP/XFO etc.). |
| 4 | Security | packages/config/src/index.ts | PARTIAL | CORS origin parsing exists but with limited format validation hardening. |
| 5 | Deployment | packages/config/src/index.ts | PARTIAL | No strict per-environment required variable matrix (dev/stage/prod parity policy). |
| 6 | Contracts | packages/config/index.d.ts | PARTIAL | Declaration drift with source config shape (missing newer exported fields). |
| 7 | Contracts | packages/config/src/public.ts | COMPLETE | Public/private config boundary is explicit and avoids direct secret exposure. |
| 8 | Architecture | packages/config/eslint.config.mjs | COMPLETE | Boundary lint rule prevents config package from importing app/service layers. |

### infra/ (docker + proxy)
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Deployment | infra/prod/docker-compose.yml | CRITICAL | Proxy image is `traefik:latest` (unpinned and non-deterministic). |
| 2 | Security | infra/prod/docker-compose.yml | CRITICAL | Worker gets RW Docker socket mount, enabling host-level container control if compromised. |
| 3 | Deployment | infra/prod/.env.example | MISSING | Stub-only file does not enumerate required prod env keys for operators. |
| 4 | Deployment | infra/prod/docker-compose.yml | PARTIAL | Startup determinism incomplete: limited healthchecks/readiness gating beyond DB service. |
| 5 | Deployment | infra/tenant-stack/docker-compose.yml | PARTIAL | Some service dependencies are `service_started` without healthy readiness checks. |
| 6 | Deployment | infra/prod/docker-compose.yml | PARTIAL | Image pinning is incomplete (tags used, no digest pinning; app built on target host). |
| 7 | Security | infra/prod/docker-compose.yml | PARTIAL | Baseline TLS redirect exists, but advanced proxy hardening headers/policies are limited. |
| 8 | Security | infra/prod/docker-compose.yml + infra/tenant-stack/docker-compose.yml | PARTIAL | Containers lack stronger runtime hardening defaults (`read_only`, `cap_drop`, etc.). |
| 9 | Deployment | infra/prod/docker-compose.yml | COMPLETE | Core services for production topology are present: api, worker, db, proxy, dashboard. |
| 10 | Deployment | infra/prod/docker-compose.yml | COMPLETE | API/worker depend on healthy Postgres for startup order determinism at DB boundary. |

### scripts/
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Security | scripts/debug-db.mjs | CRITICAL | Hardcoded plaintext DB credentials/host in source create severe misuse risk. |
| 2 | Security | scripts/setup-ec2.sh | CRITICAL | Uses remote bootstrap pipes/downloads without integrity verification hardening. |
| 3 | Security | scripts/setup-github-actions-ssh.sh | CRITICAL | Encourages broad SSH key handling patterns that are high risk without stricter controls. |
| 4 | Reliability | scripts/smoke-idempotency.mjs | CRITICAL | Hardcoded fallback identifiers and weak timeout/assertion behavior for CI-grade safety. |
| 5 | Reliability | scripts/verify-stockix-server.sh | PARTIAL | Health checks warn but do not fail hard enough for automated deployment gating. |
| 6 | Reliability | scripts/bootstrap-local-env.mjs | PARTIAL | Copies limited env templates and can overwrite values with `--force` without schema validation. |
| 7 | Architecture | scripts/architecture-validation.mjs | PARTIAL | Useful rule checks but regex-only scanning can miss dynamic import scenarios. |
| 8 | Architecture | scripts/lint-boundaries.mjs | PARTIAL | Boundary checks are useful but path allowlist drift can silently weaken enforcement. |

### Root config
| # | Area | File | Status | Finding |
|---|------|------|--------|---------|
| 1 | Deployment | .github/workflows/deploy.yml | CRITICAL | Deploy path relies on mutable host state and lacks explicit health-check/rollback gate. |
| 2 | Deployment | README.md + scripts/bootstrap-local-env.mjs | CRITICAL | Documented env bootstrap behavior does not match actual bootstrap script behavior. |
| 3 | Deployment | package-lock.json + package.json | CRITICAL | Mixed package-manager state and engine drift (`npm` lockfile vs pnpm canonical config). |
| 4 | Security | .gitignore | PARTIAL | Does not explicitly ignore `infra/prod/.env` though deploy path expects that file. |
| 5 | Deployment | .env.example | PARTIAL | Canonical env template exists but includes weak local defaults (`change-me`, localhost). |
| 6 | Deployment | pnpm-workspace.yaml | PARTIAL | Workspace excludes some operational directories, reducing tooling parity visibility. |
| 7 | Deployment | turbo.json | PARTIAL | Global env cache tracking is useful but incomplete for all security-critical vars. |
| 8 | Policy | .npmrc | MISSING | Root npm policy file is empty; no repository-level install policy hardening. |
| 9 | Governance | .github/workflows/architecture-governance.yml | COMPLETE | CI architecture guardrails and frozen-lock install checks are present. |
| 10 | Deployment | .dockerignore | COMPLETE | Env leak prevention is strong; `.env*` excluded except `.env.example`. |

---

## CRITICAL GAPS (must fix before production deploy)
1. Non-atomic job claiming can double-execute jobs — `apps/api/src/index.ts` — enables race-induced duplicate provisioning/deprovisioning.
2. Worker failure reporter can crash main loop — `infra/worker-service/src/worker.ts` — a transient API failure can stop job processing entirely.
3. No retry/DLQ execution strategy for worker jobs — `apps/api/src/index.ts`, `packages/db/src/schema.ts` — failed jobs become terminal without safe recovery path.
4. Cookie `Secure` flag missing on auth cookies — `apps/api/src/routes/auth/index.ts` — weakens session transport hardening in production.
5. API global error responses leak internal messages — `apps/api/src/index.ts` — exposes internals and sensitive debug context.
6. Bootstrap admin login fallback active in runtime auth service — `apps/api/src/services/auth/login.ts` — privileged backdoor risk if bootstrap secrets persist.
7. Dashboard relay misses required `Idempotency-Key` — `apps/dashboard/lib/api-client.ts` — privileged write flows fail/violate API contract.
8. Dashboard lacks server-side protected-route enforcement — `apps/dashboard/app/(dashboard)/layout.tsx` — UI renders without hard auth gate.
9. CSP in dashboard proxy is permissive and localhost-biased — `apps/dashboard/proxy.ts` — weak XSS posture and prod connectivity fragility.
10. Dotenv override precedence is unsafe — `packages/config/src/index.ts` — local files can override injected secure runtime env values.
11. Secret-at-rest handling unresolved in DB schema model — `packages/db/src/schema.ts` — tenant secret fields are flagged with unresolved production TODO.
12. Proxy image uses `latest` tag — `infra/prod/docker-compose.yml` — non-deterministic deployments.
13. Worker mounts Docker socket RW — `infra/prod/docker-compose.yml` — high privilege escalation blast radius.
14. Root deploy workflow lacks robust post-deploy health/rollback controls — `.github/workflows/deploy.yml` — unsafe promotion path.
15. Env bootstrap docs drift from script behavior — `README.md`, `scripts/bootstrap-local-env.mjs` — operational setup errors likely.
16. Hardcoded plaintext DB credentials in script — `scripts/debug-db.mjs` — immediate secret hygiene and misuse risk.

## PARTIAL IMPLEMENTATIONS (functional but incomplete)
1. Correlation ID propagation is limited to selected paths — `apps/api/src/index.ts`, `infra/worker-service/src/worker.ts` — not end-to-end standardized.
2. CSRF posture for cookie-based auth is incomplete — `apps/api/src/routes/auth/index.ts` — lacks explicit anti-CSRF strategy.
3. Worker payload shape validation is absent — `infra/worker-service/src/worker.ts` — malformed jobs can fail deep in execution.
4. Partial provisioning failure compensation is incomplete — `infra/worker-service/src/provision-runtime.ts` — side effects can remain half-applied.
5. CORS validation exists but is not deeply hardened — `packages/config/src/index.ts` — origin format trust still broad.
6. Root env template includes many local placeholders/defaults — `.env.example` — easy to misdeploy insecure values.
7. Startup readiness checks are incomplete beyond DB — `infra/prod/docker-compose.yml`, `infra/tenant-stack/docker-compose.yml` — service order still fragile.
8. Container hardening controls are limited — `infra/prod/docker-compose.yml` — lacks stricter runtime isolation defaults.
9. Several operational scripts are useful but non-robust for CI/prod automation — `scripts/*` — weak failure semantics and assumptions.
10. Workspace/tooling parity is incomplete across all operational folders — `pnpm-workspace.yaml`, `turbo.json` — consistency checks can miss components.

## MISSING ENTIRELY (not implemented at all)
1. API rate limiting on login/MFA/invite acceptance — `apps/api/src/index.ts` / auth routes — brute-force protection gap.
2. Worker dead-letter queue path — API/DB/worker job subsystem — no poison-job segregation.
3. Worker retry scheduler tied to `attempts/maxAttempts/runAt` — API/worker/job tables — no automatic retry lifecycle.
4. Stuck job watchdog/reclaimer process — worker/API coordination — no lease timeout recovery loop.
5. Universal request ID middleware across dashboard->API->worker — cross-service boundary — no full distributed request chain.
6. Dedicated security headers policy framework in shared config — `packages/config/src/index.ts` — no centralized hardened header controls.
7. Production-ready dashboard deployment/hardening runbook — `apps/dashboard/README.md` — absent operational guidance.
8. Full prod env template in `infra/prod/.env.example` — infra/prod — missing explicit var matrix for operators.
9. Root npm install policy hardening config — `.npmrc` — empty policy file.

## ALREADY COMPLETE (no action needed)
1. API auth/session/invite/MFA route surfaces are implemented and connected — `apps/api/src/routes/auth/index.ts` — flow endpoints exist and validate inputs.
2. Session freshness/role invalidation semantics are enforced — `apps/api/src/services/auth/session-validation.ts` — stale role/version tokens are rejected.
3. Tenant job type contract alignment exists between producer and consumer — `apps/api/src/services/tenant-jobs.ts`, `infra/worker-service/src/worker.ts` — matching job types.
4. DB schema foundation covers owners/tenants/deployments/events/jobs/idempotency — `packages/db/src/schema.ts` — core relational model present.
5. Atomic tenant port allocation exists — `packages/db/src/allocate-tenant-port.ts` — race-safe sequence allocator.
6. Dashboard relay routes for login/logout/me/invite/MFA map to existing API endpoints — `apps/dashboard/app/api/**` — contract names are present and wired.
7. Production compose includes core services (api, worker, db, proxy, dashboard) — `infra/prod/docker-compose.yml` — baseline topology exists.
8. CI architecture governance workflow is present — `.github/workflows/architecture-governance.yml` — boundary and lockfile checks run in CI.

---

## RECOMMENDED FIX ORDER
1. Fix worker/API job safety: atomic claim, retries, DLQ, stuck-job reclaim, graceful shutdown.
2. Close auth/security blockers: secure cookies, remove/bootstrap-gate fallback auth path, sanitize global error responses.
3. Repair dashboard contract/security gaps: idempotency key propagation, server-side auth gates, hardened CSP.
4. Harden config/env pipeline: remove dotenv override risk, fix env key typo, enforce production env matrix.
5. Resolve infrastructure determinism/security: pin images, reduce Docker socket exposure, expand healthchecks/readiness and rollback gates.
6. Eliminate secret hygiene and operational drift in scripts/docs (`debug-db`, bootstrap docs mismatch, insecure setup scripts).
7. Add end-to-end observability contract: universal request/correlation IDs and structured logs/metrics across API and worker.

---

## PHASE 5 PASS CRITERIA STATUS
- [ ] Full user flows succeed end-to-end
- [ ] Worker recovers from failures safely
- [ ] API is resilient under load
- [ ] No data inconsistency across services
- [ ] Observability is sufficient to debug issues
- [ ] Security boundaries hold under attack scenarios
- [ ] Deployment config is complete and environment-parity confirmed
