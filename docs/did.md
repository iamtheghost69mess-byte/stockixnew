# Stockix Finance — Implementation Audit (`did.md`)

**Audit date:** 2026-06-10  
**Scope:** Architecture stabilization + Phase 6–9 production hardening (Stockix Finance backend)  
**Evidence basis:** Working tree vs `git HEAD` (uncommitted changes present), plus live validation commands run on 2026-06-10.

---

## Executive Summary

Stockix Finance was migrated from a **dual Express + NestJS** layout to a **single NestJS HTTP runtime** (`src/main.ts` → `build/index.js`). Legacy Express routes (`src/api`), legacy services (`src/services`), typedi bootstrap, and duplicate shared-package copies were removed. TypeScript correctness, CI gates, Docker runtime integrity, Bill PDF parity, critical FinancialStatements stubs, tenant isolation, and security baselines were hardened.

| Metric | Count (vs `git HEAD`) |
|--------|------------------------|
| **Files deleted** | **978** |
| **Files modified** | **200** |
| **Files added (untracked, excl. temp logs)** | **45** |
| **Net diff stat** | ~1,178 paths changed (978 deleted + 200 modified + 45 added, excl. temp logs) |

### Validation snapshot (2026-06-10)

| Check | Result |
|-------|--------|
| `pnpm --filter @stockix/server typecheck` | **Exit 0** |
| `pnpm --filter @stockix/webapp typecheck` | **Exit 0** |
| `pnpm test` (server, 8 suites) | **48/48 passed** |
| `node scripts/finance-architecture-guard.mjs` | **PASS** |
| `node scripts/finance-phase-safety.mjs` | **PASS** |
| Legacy trees `src/api`, `src/services`, `src/loaders`, `src/server.ts` | **Absent on disk** |

---

## 1. Architecture Migration

### 1.1 Single NestJS HTTP runtime

| Field | Detail |
|-------|--------|
| **What changed** | Production HTTP entry locked to NestJS bootstrap only |
| **Why** | Eliminate dual Express/Nest bootstrap; one runtime path for tenant containers |
| **Before** | Legacy `src/server.ts` + `src/loaders/express.ts` + `src/api/**` coexisted with Nest modules |
| **After** | `services/stockix-finance/packages/server/src/main.ts` → webpack → `build/index.js`; `package.json` `"main": "build/index.js"` |
| **Files modified** | `services/stockix-finance/packages/server/src/main.ts`, `packages/server/package.json` |
| **Production impact** | Tenant containers run `node ./packages/server/build/index.js` only |
| **Evidence** | `finance-phase-safety.mjs` PASS “Nest entry only”; `src/server.ts` deleted; glob confirms no `src/api/` |

### 1.2 Architecture firewall scripts (new)

| Field | Detail |
|-------|--------|
| **What changed** | CI scripts block reintroduction of legacy paths |
| **Why** | Prevent regression to Express/typedi hybrid |
| **Files created** | `scripts/finance-architecture-guard.mjs`, `scripts/finance-phase-safety.mjs`, `scripts/finance-dependency-audit.mjs`, `scripts/finance-performance-baseline.mjs` |
| **Files modified** | `.github/workflows/deploy.yml`, `scripts/quality-gate-local.mjs`, root `package.json` (script aliases) |
| **Evidence** | Guards executed PASS on 2026-06-10 |

### 1.3 Constants compatibility layer

| Field | Detail |
|-------|--------|
| **What changed** | Canonical `DEFAULT_VIEWS` / `ERRORS` moved under `src/constants/**`; module `constants.ts` files re-export |
| **Why** | Remove duplication between deleted `src/services` and Nest modules; fix drift (e.g. warehouse transfer typo) |
| **Before** | Constants lived in deleted `src/services/**` and duplicated module files |
| **After** | 22 files under `services/stockix-finance/packages/server/src/constants/**` (untracked/new) |
| **Files modified** | Multiple `modules/*/constants.ts` bridges; model imports (e.g. `Bill.ts`, `Expense.model.ts`, `Account.model.ts`) |
| **Evidence** | Architecture guard “Constants compatibility layer present”; `WAREHOUSE_TRANSFER_ALREADY_TRANSFERRED` fixed in `src/constants/Warehouses/WarehousesTransfers/constants.ts` |

---

## 2. Legacy Code Removal

### 2.1 Deleted trees (summary)

| Path | Files deleted | Why removed | Replaced by |
|------|---------------|-------------|-------------|
| `packages/server/src/api/**` | **109** | Legacy Express HTTP controllers | Nest `@Controller` under `src/modules/**` |
| `packages/server/src/services/**` | **672** | Legacy service layer + typedi DI | Nest `@Injectable()` services in modules |
| `packages/server/src/subscribers/**` | **29** | Legacy event subscribers tied to typedi | Nest module subscribers / EventEmitter2 patterns |
| `packages/server/src/loaders/**` | **19** | Express bootstrap loaders (express, DI, mail, agenda) | Nest `App.module.ts`, feature modules, CLS |
| `packages/server/src/server.ts` | **1** | Legacy Express entry | `src/main.ts` |
| `packages/server/src/lib/deployment-secrets.ts` | **1** | Vendored duplicate | `@repo/shared/deployment-secrets` |
| `packages/server/src/models/*.ts` (entities) | **~69** | Duplicate entity models parallel to `modules/*/models/` | Module models + `TenantBaseModel` |
| `services/stockix-finance/packages/shared/**` | **13** | Duplicate copy of monorepo `@repo/shared` | Root `packages/shared/` via workspace |
| `services/stockix-finance/docker/migration/Dockerfile` | **1** | Orphan; referenced `bigcapitalhq/server:latest` | `packages/server/Dockerfile` target `migration-runtime` |
| `services/stockix-finance/docker-compose.prod.yml` | **1** | Superseded tenant-stack provisioning | `infra/tenant-stack/docker-compose.dev.yml` + prebuild images |
| `packages/webapp/Dockerfile` | **1** | Webapp baked into server runtime image | `webapp-dist/` in server runtime stage |
| `packages/webapp/src/hooks/query/financialReports.tsx` | **1** | Case conflict + split into `FinancialReports/` | `packages/webapp/src/hooks/query/FinancialReports/` |
| Webpack FS stubs | **3** | Empty classes shipped in prod bundle | Factory pattern (`build-profit-loss-sheet.ts`, `build-balance-sheet-table.ts`) |

**Total deleted (git): 978 files**

### 2.2 Loader deletion detail

Removed loaders include: `express.ts`, `dependencyInjector.ts`, `index.ts`, `database.ts`, `logger.ts`, `mail.ts`, `tenantModels.ts`, `tenantRepositories.ts`, and others under `src/loaders/`.  
**Replacement:** Nest module graph in `src/modules/App/App.module.ts`, `TenancyDB`, `MailModule`, etc.

---

## 3. NestJS Migration

### 3.1 Module models as canonical entities

| Field | Detail |
|-------|--------|
| **What changed** | Bill, Expense, Account module models migrated from `mixin(TenantModel, …)` to `extends TenantBaseModel` with `@InjectModelMeta`, `@InjectModelDefaultViews`, `@ExportableModel` |
| **Why** | Align with SaleInvoice pattern; remove typedi-backed model base |
| **Files modified** | `modules/Bills/models/Bill.ts`, `modules/Expenses/models/Expense.model.ts`, `modules/Accounts/models/Account.model.ts` |
| **Before** | `import TenantModel from '@/models/TenantModel'` + mixin stack |
| **After** | `extends TenantBaseModel` + Nest decorators; relation mappings use module imports |
| **Evidence** | Typecheck pass; no `Container.get` in module models |

### 3.2 Bill PDF (Nest feature parity)

| Field | Detail |
|-------|--------|
| **What changed** | Full Bill PDF stack mirroring Credit Notes / Sale Invoices |
| **Why** | Webapp called deleted legacy route `/api/purchases/bills/:id` |
| **Files created** | `modules/Bills/queries/BillPdf.service.ts`, `BillPdfTemplate.service.ts`, `modules/Bills/utils.ts`, `shared/pdf-templates/src/components/BillPaperTemplate.tsx`, `shared/pdf-templates/src/renders/render-bill-paper-template.tsx`, tenant migration `20260610000001_seed_bill_pdf_template.ts` |
| **Files modified** | `Bills.controller.ts`, `Bills.application.ts`, `Bills.module.ts`, `shared/pdf-templates/src/index.ts`, `webapp/src/hooks/query/bills.tsx` |
| **Before** | `usePdfBill` → `purchases/bills/${id}`; no server PDF handler |
| **After** | `usePdfBill` → `{ url: \`bills/${billId}\` }`; `GET /api/bills/:id` with `Accept: application/pdf` |
| **Evidence** | Files exist on disk; webapp hook at `bills.tsx:252-253` |

### 3.3 Observability (Nest interceptors/filters)

| Field | Detail |
|-------|--------|
| **What changed** | Structured request logging + global exception handling wired in App module |
| **Files created** | `src/common/interceptors/request-context.interceptor.ts`, `src/common/middleware/migration-mode.middleware.ts` |
| **Files modified** | `src/common/filters/global-exception.filter.ts`, `src/modules/App/App.module.ts` |
| **Production impact** | JSON logs include `requestId`, `organizationId`, `userId`, `tenantId` |

---

## 4. typedi Removal / Migration

| Field | Detail |
|-------|--------|
| **What changed** | typedi runtime usage removed from active model/query paths |
| **Why** | `Container.get('logger')` had no `Container.set` — runtime throw risk on Bill/Expense/Account queries |
| **Files modified** | `src/models/TenantModel.ts`, `src/system/models/SystemModel.ts`, `src/lib/Mail/index.ts`, `src/lib/EventPublisher/EventPublisher.ts`, `src/decorators/eventDispatcher.ts` |
| **Files modified** | `packages/server/package.json` — **`typedi` dependency removed** |
| **Before** | `TenantModel.query()` called `Container.get('logger')`; Bill/Expense/Account used typedi mixin base |
| **After** | `TenantModel`/`SystemModel` extend `BaseModel` only; module models use `TenantBaseModel`; EventPublisher uses `new Subscriber()` |
| **Files modified** | `scripts/finance-dependency-audit.mjs` — typedi allowlist emptied |
| **Evidence** | `grep typedi package.json` — not present; architecture guard PASS |

**Not removed (still in dependencies):** `express` (Nest platform + bull-board), `event-dispatch` decorator package — not typedi.

---

## 5. Docker Refactoring

| Field | Detail |
|-------|--------|
| **What changed** | Multi-stage Dockerfile; monorepo-root build context; strict build; runtime stage last |
| **Why** | No `src/` in runtime image; typecheck before webpack; single `@repo/shared` source |
| **Files modified** | `services/stockix-finance/packages/server/Dockerfile`, `.dockerignore`, `scripts/prebuild-tenant-images.mjs` |
| **Before** | Finance workspace context; `cpSync` shared copy; `build:server` without typecheck; default final stage was `migration-runtime` |
| **After** | Monorepo root context; `COPY packages/shared`; `pnpm --filter @stockix/server run build:app:strict`; **`runtime` is final stage** |
| **Runtime CMD** | `node ./packages/server/build/index.js` |
| **Migration CMD** | `node ./scripts/run-system-migrate.mjs` (target `migration-runtime`) |
| **Files modified** | `scripts/prebuild-tenant-images.mjs` — expanded `verifyRuntimeImageTruth` (`! test -d .../src`, no gulp/babel-loader in prod `node_modules`) |
| **Evidence** | Dockerfile lines 1–4, 33; prebuild script verification checks |

---

## 6. CI/CD Changes

| Change | File(s) | Before → After |
|--------|---------|----------------|
| Finance server + webapp typecheck in deploy gate | `.github/workflows/deploy.yml` | Present; now passes (0 errors) |
| Finance tenant scope audit | `deploy.yml`, `packages/server/scripts/audit-tenant-scope.mjs`, `check:tenant-scope` script | **Added** |
| Finance Docker prebuild in quality gate | `deploy.yml` — `pnpm docker:prebuild:force`, `pnpm docker:check`, `pnpm finance:perf-baseline --check` | **Added** |
| `skip_quality_gate` restricted on `main` | `deploy.yml` comment + condition | Emergency bypass cannot skip gate on production branch |
| Local CI mirror | `scripts/quality-gate-local.mjs` | **Added** Finance typecheck steps; optional docker/perf checks |
| Nested Finance typecheck workflow | `services/stockix-finance/.github/workflows/typecheck.yml` | Node **18 → 22**, pnpm **9.15.9** |
| Root finance-typecheck workflow | `.github/workflows/finance-typecheck.yml` | **Created** (untracked) |
| `@stockix/sdk-ts` typecheck | `deploy.yml` | Conditional step when package exists |
| Architecture guards in CI | `deploy.yml`, `quality-gate-local.mjs` | `finance:architecture-guard`, `finance:phase-safety`, `finance:dependency-audit` |

**Evidence:** Workflow files on disk; guards PASS when executed locally.

---

## 7. Type Safety Changes

| Field | Detail |
|-------|--------|
| **What changed** | Scoped typecheck config + error burn-down |
| **Files created** | `packages/server/tsconfig.typecheck.json`, `packages/server/src/stubs/typecheck/**` (FS module stubs for typecheck only), `packages/server/src/types/is-my-json-valid.d.ts` |
| **Files modified** | `src/interfaces/index.ts`, `ILedgerEntry` interfaces, `src/lib/DynamicFilter/**`, `src/utils/index.ts`, widespread module typing fixes |
| **Before** | **692** server errors / **238** webapp errors; webpack `transpileOnly: true` only |
| **After** | **0** server + **0** webapp errors (scoped configs); `build:app` runs typecheck first |
| **Still excluded** | `src/modules/FinancialStatements/**/*` (full module — Phase 10+); uses typecheck path stubs |
| **Evidence** | `pnpm --filter @stockix/server typecheck` exit 0; `pnpm --filter @stockix/webapp typecheck` exit 0 (2026-06-10) |

### Webapp type fixes

| Change | Files |
|--------|-------|
| React/`@types/react` dedupe | `services/stockix-finance/package.json` peer rules, `.npmrc`, `webapp/tsconfig.base.json`, `webapp/src/types/blueprint-jsx.d.ts` |
| Deleted duplicate hook file | `financialReports.tsx` → `FinancialReports/` |
| Misc TS fixes | `paymentReceives.tsx`, `ElementCustomizeTabs.tsx`, `vite-env.d.ts` |

---

## 8. Shared Package Changes

| Field | Detail |
|-------|--------|
| **What changed** | Single-source `@repo/shared` from monorepo root |
| **Why** | Eliminate drift between root and finance-local copy; remove prebuild `cpSync` |
| **Files deleted** | Entire `services/stockix-finance/packages/shared/` (**13** tracked files) |
| **Files modified** | `pnpm-workspace.yaml` (added finance workspace entries), `scripts/prebuild-tenant-images.mjs` (removed `ensureFinanceSharedWorkspaceLink` / `cpSync`), `webpack.common.js` (removed `@repo/shared/deployment-secrets` alias), `Dockerfile` (COPY root `packages/shared`) |
| **Before** | Finance-local copy synced via `cpSync` before Docker build |
| **After** | `"@repo/shared": "workspace:*"` resolves to root `packages/shared/` |
| **Guard** | `finance-architecture-guard.mjs` fails if `services/stockix-finance/packages/shared/` reappears |
| **Evidence** | Glob: 0 files under finance `packages/shared/`; grep: no `cpSync` in prebuild script |

---

## 9. Security Changes

| Change | File(s) | Production impact |
|--------|---------|-------------------|
| HTTP CORS | `src/main.ts`, `src/common/http/http-allowed-origins.ts` | `enableCors()` with configurable allowed origins |
| Redis-backed rate limiting | `src/modules/App/AppThrottle.module.ts`, deps `ioredis`, `@nest-lab/throttler-storage-redis` | Shared throttler state across replicas |
| Helmet | `src/main.ts` | Still applied (CSP/COEP disabled — unchanged) |
| Migration write blocking | `src/common/middleware/migration-mode.middleware.ts` | Blocks mutating HTTP when `MIGRATION_MODE=true` |
| Deploy hardening | `deploy.yml` | Documents `MIGRATION_MODE=true` during tenant migrations; `skip_quality_gate` ignored on `main` |

---

## 10. Tenant Isolation Changes

| Change | File(s) | Before → After |
|--------|---------|----------------|
| `tenantId` in CLS after auth | `TenancyGlobal.guard.ts`, `AuthSignin.service.ts`, `SwitchTenant.service.ts` | Tenant resolved from `organizationId`, not stale `user.tenantId` |
| Observability traces | `request-context.interceptor.ts`, `global-exception.filter.ts` | **`tenantId` included** in JSON logs/errors |
| Unit tests | `tests/unit/tenancy/tenant-isolation.guard.test.ts` | 2 tests (TenancyContext) |
| Integration-style tests | `tests/integration/tenancy/cross-tenant-isolation.test.ts` | **5 tests** (mocked guard/auth paths) |
| Tenant scope audit script | `scripts/audit-tenant-scope.mjs`, `check:tenant-scope` | CI wired in `deploy.yml` |
| **Evidence** | `pnpm test` — 48/48 passed including tenancy suites |

**Not implemented:** Live multi-tenant API tests against real DB (tests use mocks).

---

## 11. Performance Changes

| Change | File(s) | Detail |
|--------|---------|--------|
| Performance baseline script | `scripts/finance-performance-baseline.mjs` | Records bundle size + Docker cold start |
| Baseline file | `.finance-perf-baseline.json` (untracked) | Initial committed baseline for CI `--check` |
| CI gate | `deploy.yml` | `pnpm finance:perf-baseline --check` after image build |
| Local gate | `quality-gate-local.mjs` | Optional when `stockix-server:local` exists |

---

## 12. Database / Migration Changes

| Change | File(s) | Detail |
|--------|---------|--------|
| Bill PDF template seed | `src/database/tenant/migrations/20260610000001_seed_bill_pdf_template.ts` | Seeds default Bill row in `pdf_templates` |
| Migration runbook | `services/stockix-finance/MIGRATION.md` (untracked) | Forward migration + rollback guidance |
| Docker migration image | `Dockerfile` target `migration-runtime` | Knex scripts only; separate from HTTP runtime |
| Legacy migration Dockerfile | **Deleted** `docker/migration/Dockerfile` | Was orphaned |

---

## 13. Documentation Changes

| File | Status | Purpose |
|------|--------|---------|
| `auditlegacy.md` | Modified | Post-stabilization architecture audit |
| `makesure.md` | Created (untracked, repo root) | Production readiness gap list (pre-hardening) |
| `services/stockix-finance/MIGRATION.md` | Created (untracked) | Knex migration + rollback runbook |
| `docs/did.md` | **This file** | Implementation audit trail |

---

## 14. FinancialStatements (Critical Stubs Only)

| Field | Detail |
|-------|--------|
| **What changed** | Removed webpack production stubs for P&L and Balance Sheet; factory lazy-load pattern |
| **Why** | Stubs shipped empty classes — reports returned no data in production |
| **Files created** | `modules/FinancialStatements/modules/ProfitLossSheet/build-profit-loss-sheet.ts`, `modules/FinancialStatements/modules/BalanceSheet/build-balance-sheet-table.ts` |
| **Files modified** | `ProfitLossSheet.ts`, `BalanceSheetTable.ts` (re-export factories), `ProfitLossSheetTable.ts` (lazy `tableColumns`), `scripts/webpack.common.js` |
| **Files deleted** | `src/stubs/ProfitLossSheetStub.ts`, `BalanceSheetTableStub.ts`, `AgingSummaryTableStub.ts` |
| **Not implemented** | Full `FinancialStatements/**` typecheck inclusion (~371 files, Phase 10+) |

---

## 15. CLI Alignment

| Field | Detail |
|-------|--------|
| **What changed** | Modern Nest CLI path; bin shim |
| **Files created** | `packages/server/bin/stockix.js`, `modules/CLI/commands/SystemMigrateUnlock.command.ts` |
| **Files modified** | `webpack.cli.js` (entry `./src/cli.ts` → `build/cli.js`), `package.json` (`nest-commander` added) |
| **Before** | `"bin": "./bin/stockix.js"` but `bin/` missing; webpack built legacy `commands/index.ts` only |
| **After** | Bin shim exists; CLI targets Nest `cli.ts` |
| **Production note** | Docker migrations still use `scripts/run-system-migrate.mjs`, not `stockix` CLI |
| **Open issue** | `pnpm run build:commands` may fail on full App module graph (OpenApiExport) — HTTP runtime unaffected |

---

## Summary Tables

### Files Deleted (978 total — top categories)

| Category | Count | Representative path |
|----------|-------|---------------------|
| Legacy services | 672 | `packages/server/src/services/**` |
| Legacy API controllers | 109 | `packages/server/src/api/**` |
| Legacy subscribers | 29 | `packages/server/src/subscribers/**` |
| Orphan entity models | ~69 | `packages/server/src/models/Bill.ts`, `Account.ts`, … |
| Express loaders | 19 | `packages/server/src/loaders/**` |
| Duplicate `@repo/shared` | 13 | `services/stockix-finance/packages/shared/**` |
| Other (docker, webapp, stubs, etc.) | ~67 | `docker/migration/Dockerfile`, `webapp/Dockerfile`, … |

### Files Added (~45 untracked, excluding temp logs)

| Category | Examples |
|----------|----------|
| CI / guard scripts | `scripts/finance-architecture-guard.mjs`, `finance-phase-safety.mjs`, `finance-dependency-audit.mjs`, `finance-performance-baseline.mjs` |
| Constants layer | `packages/server/src/constants/**` (22 files) |
| Bill PDF | `BillPdf.service.ts`, `BillPaperTemplate.tsx`, migration seed |
| FS factories | `build-profit-loss-sheet.ts`, `build-balance-sheet-table.ts` |
| Tests | `tests/unit/tenancy/`, `tests/integration/tenancy/`, `tests/unit/architecture/`, `tests/unit/middleware/` |
| Typecheck infra | `tsconfig.typecheck.json`, `src/stubs/typecheck/**`, `src/types/**` |
| CLI / ops | `bin/stockix.js`, `audit-tenant-scope.mjs`, `MIGRATION.md` |
| CI workflow | `.github/workflows/finance-typecheck.yml`, `.finance-perf-baseline.json` |
| Observability | `request-context.interceptor.ts`, `migration-mode.middleware.ts`, `common/http/` |

**Temp artifacts present (should not be committed):** `packages/server/tsc-*.txt`, `typecheck-out.txt`, `typecheck-errors.txt`

### Files Modified (200 total — key paths)

| Area | Key files |
|------|-----------|
| Docker / infra | `packages/server/Dockerfile`, `.dockerignore`, `scripts/prebuild-tenant-images.mjs`, `infra/tenant-stack/docker-compose.dev.yml` |
| CI | `.github/workflows/deploy.yml`, `scripts/quality-gate-local.mjs` |
| Workspace | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json` |
| Server core | `main.ts`, `App.module.ts`, `AppThrottle.module.ts`, `TenancyGlobal.guard.ts`, `AuthSignin.service.ts` |
| Models | `Bill.ts`, `Expense.model.ts`, `Account.model.ts`, `TenantModel.ts`, `SystemModel.ts` |
| Webpack | `webpack.common.js`, `webpack.cli.js` |
| Webapp | `bills.tsx`, `tsconfig.base.json`, Blueprint type shims |
| Package manifests | `packages/server/package.json`, `packages/webapp/package.json`, `services/stockix-finance/package.json` |

### Remaining Open Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| `FinancialStatements/**` excluded from typecheck | Medium | ~371 files; stubs used in `tsconfig.typecheck.json`; Phase 10+ |
| CLI webpack build (`build:commands`) | Low | Full App graph may fail; production uses HTTP bundle + `run-system-migrate.mjs` |
| Cross-tenant tests are mocked | Medium | No live DB isolation integration tests |
| `@repo/shared/structured-logger` not wired | Low | Nest Logger + JSON.stringify still used |
| `pnpm.overrides` in finance `package.json` | Low | pnpm warns they must be at root to take effect |
| Legacy deps `csurf`, `agendash` | Low | `finance-dependency-audit.mjs` warns |
| Temp `tsc-*.txt` files untracked | Low | Should be gitignored / deleted before commit |
| Changes largely **uncommitted** | Process | This audit reflects working tree vs HEAD |

### Remaining TODOs (post-hardening)

| Item | Target phase |
|------|--------------|
| Drive `FinancialStatements/**` into typecheck (0 errors) | Phase 10+ |
| Real DB cross-tenant API integration tests | Future |
| Wire `@repo/shared/structured-logger` | Future |
| Remove `csurf` / `agendash` if confirmed unused | Future |
| Move `pnpm.overrides` to root `package.json` | Future |
| Record production perf baseline after deploy | Ops |
| Commit and push stabilization changes | Immediate |

### Production Risks (residual)

| Risk | Mitigation in place | Residual |
|------|---------------------|----------|
| Untyped FS code in prod bundle | P&L/BS factories restored | Other FS modules still excluded from tsc |
| typedi runtime throw | Removed from TenantModel | — |
| Bill PDF 404 | Full stack implemented | Requires tenant migration seed applied |
| Rate limit bypass multi-instance | Redis throttler | Requires Redis availability |
| Emergency deploy without gates | `skip_quality_gate` | Blocked on `main` branch |
| Uncommitted work lost | — | **Commit required before deploy** |

---

## Not Implemented (planned but not done)

| Planned item | Evidence |
|--------------|----------|
| Full FinancialStatements module typecheck (0 errors, no exclude) | `tsconfig.typecheck.json` still excludes `./src/modules/FinancialStatements/**/*` |
| `@repo/shared/structured-logger` in server logging | No imports under `packages/server/src` |
| Finance webapp unit tests in CI | `deploy.yml` runs server tests only |
| Live cross-tenant DB integration tests | Tests use mocks in `cross-tenant-isolation.test.ts` |
| Complete removal of `express` dependency | Still required for Nest platform + bull-board |
| Helmet CSP / COEP enabled | Still disabled in `main.ts` |
| Guaranteed CLI `build:commands` success | Not verified passing |

---

## Appendix: Key File Path Index

```
services/stockix-finance/packages/server/
├── src/main.ts                          # Nest HTTP entry
├── src/modules/App/App.module.ts        # Global guards, interceptors, filters
├── src/modules/Bills/queries/BillPdf.service.ts
├── src/constants/**                     # Canonical DEFAULT_VIEWS / ERRORS
├── Dockerfile                           # runtime | migration-runtime
├── tsconfig.typecheck.json              # Scoped typecheck (excludes FS)
├── bin/stockix.js                       # CLI shim
└── tests/integration/tenancy/cross-tenant-isolation.test.ts

scripts/
├── finance-architecture-guard.mjs
├── finance-phase-safety.mjs
├── finance-dependency-audit.mjs
├── finance-performance-baseline.mjs
└── prebuild-tenant-images.mjs

packages/shared/                         # Single @repo/shared source (monorepo root)
pnpm-workspace.yaml                      # Includes services/stockix-finance
```

---

*Generated from repository state and validation commands on 2026-06-10. Re-run typecheck/tests after commit to confirm CI parity.*
