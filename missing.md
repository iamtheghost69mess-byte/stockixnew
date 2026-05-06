# Missing Work Plan — Phases 1–4

## Objective
Close all architecture contract gaps found in the Phase 1–4 audit, then re-verify full compliance with hard gates.

## Execution Order (Hard Sequence)
1. Phase 4 (Config governance)
2. Phase 2 (API authority)
3. Phase 3 (Execution purity)
4. Phase 1 (Dashboard purity)

Do not start the next phase until the current phase is implemented and verified.

---

## Phase 4 — Config + Environment Governance (Priority 1)

### Missing items
- Direct `process.env` usage outside `packages/config`:
  - `apps/api/scripts/provision-smoke.mjs`
  - `apps/api/scripts/provision-scenarios.mjs`
- Direct `dotenv` loading/parsing outside config:
  - `apps/api/src/index.ts`
  - `apps/api/src/scripts/bootstrap-admin.ts`
  - `packages/db/drizzle.config.ts`

### Repair plan
1. Extend `packages/config` exports to cover every env value needed by scripts and runtime.
2. Replace direct `process.env` reads in API scripts with typed config imports.
3. Remove app-level `dotenv` orchestration from API runtime and bootstrap script; centralize loading in config only.
4. Update DB drizzle config to consume centralized config instead of local env parsing.

### Verification gate
- `rg "process\.env" apps infra packages --glob "!**/node_modules/**"` shows only `packages/config/**` (and approved tooling exceptions if explicitly documented).
- `pnpm --filter api check-types` passes.
- `pnpm lint:boundaries` passes.

---

## Phase 2 — API Authority (Priority 2)

### Missing items
- Role evaluation logic outside API:
  - `apps/dashboard/lib/roles.ts` (`ROLE_RANK`)

### Repair plan
1. Remove authorization evaluation primitives (`ROLE_RANK` and equivalent decision helpers) from dashboard layer.
2. Ensure dashboard consumes capability booleans from API (`/auth/me`) for all access decisions.
3. Keep only display metadata in dashboard (labels/colors/order), not decision logic.

### Verification gate
- No role/permission decision logic in `apps/dashboard/**`.
- `pnpm architecture:validate` Phase 2 passes.
- `pnpm --filter dashboard check-types` passes.

---

## Phase 3 — Worker + DB + Infra Purity (Priority 3)

### Missing items
- Worker lifecycle transition logic:
  - `infra/worker-service/src/worker.ts` updates tenant/deployment status directly.
- Worker-service runtime orchestration concentration:
  - `infra/worker-service/src/provision-runtime.ts` performs multi-step orchestration flow.
- DB lifecycle queue orchestration helpers:
  - `packages/db/src/tenant-jobs.ts`
  - `packages/db/src/index.ts` exports job lifecycle helpers.

### Repair plan
1. Move lifecycle state transition decisions out of worker execution loop into API-owned orchestration endpoints/services.
2. Reduce worker runtime to execution adapter behavior: fetch assigned work, execute command, emit result.
3. Move queue/lifecycle orchestration helpers out of `packages/db` into API/domain layer; keep `packages/db` as schema + low-level query utility only.
4. Tighten Phase 3 checks in `scripts/architecture-validation.mjs` for worker/DB orchestration leakage.
5. Add regression tests that fail on:
   - worker-owned lifecycle/state policy
   - DB package lifecycle orchestration helpers

### Verification gate
- `pnpm architecture:validate` Phase 3 passes with strengthened rules.
- `pnpm --filter api test` passes with new regression coverage.
- `pnpm lint:boundaries` passes.

---

## Phase 1 — Dashboard UI Purity (Priority 4)

### Missing items
- Local token decision branch in UI:
  - `apps/dashboard/app/(auth)/accept-invite/page.tsx` (`if (!token) return;`)

### Repair plan
1. Remove local auth/token gate branching from page logic.
2. Always route validation/decision through API relay endpoint and render server-driven result.
3. Keep dashboard pages as input/render only; no local auth control flow.

### Verification gate
- `pnpm architecture:validate` Phase 1 passes.
- Dashboard auth UI tests pass.

---

## Final Hard-Gate Verification

Run all and require green:
- `pnpm architecture:validate`
- `pnpm lint:boundaries`
- `pnpm --filter api check-types`
- `pnpm --filter dashboard check-types`
- `pnpm --filter api test`
- `pnpm --filter dashboard test`

## Completion Criteria
- All four phases pass with zero violations.
- `PRODUCTION-READY: YES` in final forensic report.
