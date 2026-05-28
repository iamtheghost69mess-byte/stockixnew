# Stockix — Test & Quality Gate Audit

**Date:** 2026-05-28  
**Trigger:** CI quality gate fails on `check:api-structure` (reported as `ELIFECYCLE exit 1`)  
**Commit audited locally:** `f13fafbb` (same as failed CI run [#69](https://github.com/iamtheghost69mess-byte/stockixnew/actions/runs/26594961222))  
**Environment:** Windows 11, Node via nvm, local Postgres on `127.0.0.1:5432/stockix_test`

---

## SECTION 1 — OVERALL STATUS DASHBOARD

| Check | Status | Details |
|-------|--------|---------|
| TypeScript (CI packages) | ✅ | 0 errors in api, dashboard, worker, config, auth, db, shared, pms |
| TypeScript (platform-worker-shared) | ❌ | **26 errors** (TS6059 rootDir — not in CI quality gate) |
| API tests | ⚠️ | 240/240 pass locally **except 1 intermittent failure** (see FAIL-1) |
| Email tests (7 files / 17 tests) | ✅ | 17/17 passed |
| `tokens.test.ts` isolated (5 runs) | ✅ | 5/5 passed |
| `tokens.test.ts` in full suite | ❌ | **Flaky** — failed 1/3 runs early, then 13/13 subsequent full-suite runs passed |
| `license-single-active.test.ts` (5 runs) | ✅ | 5/5 passed |
| Dashboard tests | ✅ | 5/5 passed |
| PMS tests | ✅ | 51/51 passed |
| Finance tests (direct path) | ✅ | 38/38 passed (`services/stockix-finance/packages/server`) |
| Finance tests (CI command from root) | ⚠️ | **Silently skipped** — `pnpm --filter @stockix/server` not in workspace |
| POS tests | ✅ | 5/5 passed |
| `lint:boundaries` | ✅ | Exit 0 |
| `architecture:validate` | ✅ | Exit 0, PRODUCTION READY: YES |
| `check:tenant-scope` | ✅ | 19 passed, 0 failed |
| `check:routes` | ✅ | OK — no inline handlers |
| `check:known-paths` | ✅ | 60 paths covered |
| `check:api-structure` (local, with CI env) | ✅ | Exit 0 — 240 tests + all audits |
| `check:api-structure` (CI run #69) | ❌ | **Failed** — `tokens.test.ts` assertion (see FAIL-1) |
| `pnpm audit --prod` | ✅ | No known vulnerabilities |
| API build | ✅ | tsup success |
| Worker build | ✅ | `infra/worker-service/.runtime/worker.js` produced |
| Dashboard build | ✅ | Next.js standalone output present |
| Repository hygiene (.env / artifacts) | ✅ | No tracked `.env` or build artifacts |
| CI deploy job (run #68) | ❌ | Quality gate passed; **Deploy over SSH failed** (separate from this audit) |

---

## SECTION 2 — EVERY FAILURE (detailed)

### FAIL-1: Flaky `tokens.test.ts` — tampered MFA token still verifies (PRIMARY CI BLOCKER)

**Command:** `pnpm run check:api-structure` (inside CI step “API route registry checks”)  
**Also reproduces via:** `pnpm --filter api test` (full suite, non-deterministic)  
**Exit code:** 1  
**CI run:** [Deploy Stockix #69](https://github.com/iamtheghost69mess-byte/stockixnew/actions/runs/26594961222) — step **“API route registry checks”** failed  
**GitHub annotation:**

```
tests/tokens.test.ts > signMfaToken + verifyMfaToken > tampered MFA token signature returns null
AssertionError: expected 'owner-xyz' to be null

- Expected: null
+ Received: "owner-xyz"

 ❯ tests/tokens.test.ts:268:44
```

**Local reproduction:**

| Run | Command | Result |
|-----|---------|--------|
| Full suite run 1/3 | `pnpm --filter api test` | ✅ 240/240 |
| Full suite run 2/3 | `pnpm --filter api test` | ✅ 240/240 |
| Full suite run 3/3 | `pnpm --filter api test` | ❌ **1 failed** — same test as CI |
| Full suite runs 4–13 | `pnpm --filter api test` | ✅ 240/240 each |
| Isolated 5× | `vitest run tests/tokens.test.ts` | ✅ 14/14 each time |

**Root cause (analysis, not fixed):**

- Test at `apps/api/tests/tokens.test.ts:257–268` tampers the MFA token by flipping **only the last character** of the base64url signature.
- Under full-suite execution (Vitest parallel + `vi.resetModules()` + cached `@repo/config` / `apiConfig.authTokenSecret`), verification occasionally **still returns `owner-xyz`** instead of `null`.
- The tamper strategy is brittle: a single trailing-character flip does not guarantee an invalid HMAC in all orderings / module-load states.
- CI runs the full test suite **inside** `check:api-structure` **before** the dedicated “Run API tests” step, so this flake blocks the workflow early.

**Full error output (local run 3/3, abbreviated):**

```
FAIL  tests/tokens.test.ts > signMfaToken + verifyMfaToken > tampered MFA token signature returns null
AssertionError: expected 'owner-xyz' to be null
 Test Files  1 failed | 49 passed (50)
      Tests  1 failed | 239 passed (240)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  api@0.1.0 test: `vitest run`
```

---

### FAIL-2: `packages/platform-worker-shared` TypeScript (26 errors)

**Command:** `cd packages/platform-worker-shared && npx tsc --noEmit`  
**Exit code:** 1 (26 `error TS` lines)  
**Not in CI quality gate** — `deploy.yml` type-checks auth, config, db, shared, api, dashboard, worker, pms only.

**Sample errors:**

```
../../apps/api/src/finance-license.client.ts(2,28): error TS6059: File '.../apps/api/src/lib/require-env.ts'
  is not under 'rootDir' '.../packages/platform-worker-shared/src'.
../../apps/api/src/license-expire-followup.ts(5,25): error TS6059: ...
... (24 more TS6059 — API source files imported across package rootDir boundary)
```

**Impact:** Local `tsc` on this package fails; worker bundle builds via tsup (passes). CI does not gate on this package today.

---

### FAIL-3: Finance tests — CI command is a no-op from monorepo root

**Command (CI):** `pnpm --filter @stockix/server test`  
**Exit code:** 0 (misleading — nothing ran)  
**Output:**

```
No projects matched the filters in "C:\Users\Jad\Desktop\stokcix\stockixnew"
```

**Reason:** `services/stockix-finance` is **not** listed in `pnpm-workspace.yaml`. Finance tests only run when invoked directly:

```bash
cd services/stockix-finance/packages/server && pnpm test  # 38 passed
```

**Impact:** CI “Run Finance tests” step reports success but **does not execute** Finance tests. Not the cause of run #69 failure (step was skipped after earlier failure), but a quality-gate gap.

---

### WARN-1: CI runs API tests twice with different env coverage

**Workflow:** `.github/workflows/deploy.yml`

| Step | Command | Test env vars |
|------|---------|---------------|
| API route registry checks | `check:api-structure` → includes `pnpm test` | **None** |
| Run API tests | `pnpm --filter api test` | `DATABASE_URL`, secrets, POS/PMS URLs |

`check:api-structure` runs the **full 240-test suite** without the explicit `env:` block used later. Tests passed on CI run #68 anyway; run #69 failed on tokens flake, not missing env.

**Recommendation (for future fix):** Either remove `pnpm test` from `check:api-structure`, or add the same `env:` to “API route registry checks”, or run `check:api-structure` after tests with `--if-present` audit-only script.

---

### WARN-2: Node.js 20 deprecation on GitHub Actions

**CI annotation (run #69):** Actions forced to Node 24; Node 20 deprecation warning for checkout, setup-node, gitleaks, pnpm-setup. Non-blocking.

---

## SECTION 3 — PHASE-BY-PHASE LOCAL RESULTS

### Phase 1 — TypeScript

| Package | Errors |
|---------|--------|
| packages/config | 0 |
| packages/auth | 0 |
| packages/db | 0 |
| packages/shared | 0 |
| packages/platform-worker-shared | **26** |
| apps/api | 0 |
| apps/dashboard | 0 |
| infra/worker-service | 0 |
| services/pms | 0 |
| **Total (all packages in audit script)** | **26** |

### Phase 2 — API tests (3 runs, then 10-run flake hunt)

- Runs 1–2: 240/240 ✅  
- Run 3: 239/240 ❌ (`tokens.test.ts` tampered MFA)  
- Runs 4–13 (full suite): 240/240 ✅ each  

### Phase 3 — Email tests

```
Test Files  7 passed (7)
     Tests  17 passed (17)
```

Files: `password-reset-email`, `email-logs`, `license-expiry-email`, `finance-credentials-email`, `pos-credentials-email`, `resend-webhook`, `webhook-auth-gate`.

### Phase 4 — Tokens test (isolated)

5/5 runs: 14/14 passed each.

### Phase 5 — Other suites

| Suite | Result |
|-------|--------|
| Dashboard | 5/5 ✅ |
| PMS | 51/51 ✅ |
| Finance (direct) | 38/38 ✅ |
| POS backend | 5/5 ✅ |

### Phase 6 — Architecture

- `pnpm lint:boundaries` → Boundary checks passed  
- `pnpm architecture:validate` → Phase 1–4 PASS, PRODUCTION READY: YES  

### Phase 7 — Tenant scope

```
Tenant scope audit: 19 passed, 0 failed
```

### Phase 8 — Routes & known paths & api-structure

| Step | Local exit |
|------|------------|
| `check:routes` | 0 |
| `check:known-paths` | 0 |
| `check:api-structure` (with CI env) | 0 |
| `check:api-structure` (without test env) | 0 |

### Phase 9 — Security audit

```
pnpm audit --prod --audit-level=high
No known vulnerabilities found
```

### Phase 10 — Builds & artifacts

| Artifact | Present |
|----------|---------|
| `apps/api/dist/index.js` | ✅ |
| `infra/worker-service/.runtime/worker.js` | ✅ |
| `apps/dashboard/.next/standalone` | ✅ |

### Phase 11 — CI vs local mapping

**`apps/api/package.json` check/test scripts:**

```
check-types:       tsc --noEmit
test:              vitest run
check:tenant-scope: node scripts/audit-tenant-scope.mjs
check:routes:      node scripts/audit-no-inline-routes.mjs
check:known-paths: node scripts/audit-known-paths.mjs
check:api-structure: check-types && test && tenant-scope && routes && known-paths
```

**Quality gate steps (`.github/workflows/deploy.yml`):**

1. Install dependencies  
2. Security — dependency audit  
3. Security — secret scan (gitleaks)  
4. Build workspace runtime packages (@repo/auth build; config/db/shared have no build script — no-op)  
5. Repository hygiene — tracked `.env`  
6. Repository hygiene — tracked artifacts  
7. Type check — API, Worker, Dashboard, Packages, PMS  
8. Tenant scope audit  
9. **API route registry checks** → routes + known-paths + **check:api-structure (includes full test run)** ← **failed run #69**  
10. License test stability (5× `license-single-active.test.ts`) — skipped on #69  
11. Run API tests — skipped on #69  
12. Dashboard / PMS / POS / Finance tests — skipped on #69  
13. Build API / worker / dashboard — skipped on #69  
14. Bundle size / boundaries / architecture — skipped on #69  

**Checks in CI not fully exercised locally the same way:**

- Gitleaks (not re-run locally; passed on CI #69)  
- Finance filter from root (noop — see FAIL-3)  
- Postgres: CI uses `TEST_DATABASE_URL` only on steps 10–11; no `services: postgres` container in workflow — tests appear to use mocks / optional DB for most cases  

---

## SECTION 4 — REPRODUCE EXACT CI FAILURE (step-by-step)

**Failed CI step:** “API route registry checks” (not a single sub-step log; entire block exit 1)

| Step | Command | Local exit | CI run #69 |
|------|---------|------------|------------|
| 1 check-types | `pnpm run check-types` | 0 | ✅ (implied — reached tests) |
| 2 test | `pnpm test` | 0* / 1† | ❌ `tokens.test.ts:268` |
| 3 check:tenant-scope | `pnpm run check:tenant-scope` | 0 | ⏭ skipped (test failed first) |
| 4 check:routes | `pnpm run check:routes` | 0 | ⏭ |
| 5 check:known-paths | `pnpm run check:known-paths` | 0 | ⏭ |

\* With CI env vars set  
† Without flake on run 3/3 only  

**Confirmed CI annotation path:** `apps/api/tests/tokens.test.ts:268`

---

## SECTION 5 — PRIORITIZED FIX LIST (audit only — not applied)

| Priority | Issue | Suggested direction |
|----------|-------|---------------------|
| P0 | FAIL-1 tokens MFA tamper flake | Stronger tamper (truncate sig, wrong body); isolate `@repo/config` in test; or run tokens tests in serial/file-isolated pool |
| P1 | FAIL-3 Finance CI noop | Add `services/stockix-finance/packages/server` to workspace or change CI to `cd` + `pnpm test` |
| P2 | WARN-1 duplicate test + env mismatch | Remove `pnpm test` from `check:api-structure` OR unify env on registry step |
| P3 | FAIL-2 platform-worker-shared tsc | Fix tsconfig rootDir / project references for cross-package API imports |
| P4 | Deploy SSH failure (run #68) | Separate deploy audit — quality gate was green |

---

## SECTION 6 — CONCLUSION

**The reported CI `check:api-structure` failure is confirmed:** GitHub Actions run **#69** failed in step **“API route registry checks”** because **`tests/tokens.test.ts`** — test **“tampered MFA token signature returns null”** — intermittently receives `'owner-xyz'` instead of `null` when run as part of the full Vitest suite.

Locally, **most quality checks pass**, including a successful full `check:api-structure` run with CI-equivalent env vars. The **only reproducible defect** aligned with CI is the **flaky MFA token test** (observed 1/3 locally, confirmed 1/1 on CI run #69). Additional findings (**platform-worker-shared** TypeScript errors, **Finance CI noop**) are real gaps but did not cause run #69.

**No code was modified in this audit.**
