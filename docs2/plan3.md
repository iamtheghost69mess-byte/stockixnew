# Phase 3 Audit & Repair (`plan.md` aligned)

## Rule Matrix (Phase 3)

### Worker purity
- Allowed:
  - fetch assigned job
  - execute handler
  - report success/failure
- Forbidden:
  - claim policy decisions in worker loop
  - embedded retry/state-machine policy
  - lifecycle decision logic

### Infra purity
- Allowed:
  - execution adapters (docker/edge/bootstrap calls)
- Forbidden:
  - hidden policy orchestration in execution engine layer

### DB purity
- Allowed:
  - schema
  - raw query helpers
- Forbidden:
  - orchestration/state-machine policy helpers

## Baseline Findings (before repair)

- `infra/worker-service/src/worker.ts` contained job claim and direct state transitions (`pending -> running -> completed/failed`) in worker loop.
- This was a Phase 3 boundary risk for worker purity.
- `packages/db/src/*` reviewed as schema/query utility oriented; no explicit state-machine workflow helper identified.
- Infra provisioning domain remains execution-heavy but is now treated as execution boundary with strengthened regression checks.

## Repairs Applied

1. API-owned internal job claim/state endpoints added:
   - `POST /internal/jobs/claim`
   - `POST /internal/jobs/:jobId/complete`
   - `POST /internal/jobs/:jobId/fail`
   - File: `apps/api/src/index.ts`

2. Worker refactored to use API internal endpoints for claim/status:
   - Removed direct worker ownership of job-table claim/state transitions
   - File: `infra/worker-service/src/worker.ts`

3. Guardrails strengthened:
   - Added Phase 3 detection for worker-owned job claim/state policy patterns
   - File: `scripts/architecture-validation.mjs`

4. Regression checks added:
   - `apps/api/tests/phase3-purity.test.ts`

## Verification Evidence

- `pnpm architecture:validate` → PASS (Phase 3 PASS)
- `pnpm lint:boundaries` → PASS
- `pnpm --filter api check-types` → PASS
- `pnpm --filter dashboard check-types` → PASS
- `pnpm --filter api test` includes Phase 3 regression checks → PASS

## Final Phase 3 Verdict

**YES**

Phase 3 is implemented to the target boundary with worker claim/state policy moved behind API authority, strengthened static checks, and regression coverage.
