# Phase 2 Evidence Pack

## Scope

Validation evidence for Phase 2 API auth ownership completion.

## Before/After Violation Matrix

| Area | Before | After |
|---|---|---|
| Relay policy ambiguity | Partial | Locked (`transport-only relays` documented) |
| Auth contract normalization | Partial | Complete (`/auth/login` with optional `code`, standardized outcomes) |
| Dashboard auth authority behavior | Partial | Cleared (UI uses relay endpoints; no token ownership logic) |
| Guardrail semantic coverage | Partial | Improved (`scripts/architecture-validation.mjs` tightened) |
| API integration tests | Missing | Added (`apps/api/tests/auth-routes.test.ts`) |
| API contract tests | Missing | Added (`apps/api/tests/auth-contracts.test.ts`) |
| Dashboard HTTP-only auth tests | Missing | Added (`apps/dashboard/tests/auth-ui-http-only.test.ts`) |
| Deterministic test commands | Missing | Added (`test` scripts + `pnpm test:phase2`) |

## Command Evidence

### Architecture + boundary gates

- `pnpm architecture:validate` → PASS
- `pnpm lint:boundaries` → PASS
- `pnpm --filter api check-types` → PASS
- `pnpm --filter dashboard check-types` → PASS

### Phase 2 test suite

- `pnpm --filter api test` → PASS (2 files, 7 tests)
- `pnpm --filter dashboard test` → PASS (1 file, 3 tests)
- `pnpm test:phase2` → PASS

## Files Added/Updated for Evidence

- `apps/api/tests/auth-routes.test.ts`
- `apps/api/tests/auth-contracts.test.ts`
- `apps/dashboard/tests/auth-ui-http-only.test.ts`
- `apps/api/vitest.config.ts`
- `apps/dashboard/vitest.config.ts`
- `apps/api/package.json` (`test` script)
- `apps/dashboard/package.json` (`test` script)
- `package.json` (`test:phase2` script)
- `docs/architecture/auth-ownership-contract.md`
- `docs/architecture/auth-api-contract.md`
- `docs/architecture/auth-audit-checklist.md`

## Final Forensic Verdict

- Phase 2 status: **PASS**
- Auth ownership: **API-authoritative**
- CI readiness: **PASS (with deterministic checks and tests)**
