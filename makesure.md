# Stockix Finance — Production Readiness Gaps

## ❌ Missing Components

- Finance server typecheck passes: **692 errors in 276 files** (`pnpm --filter @stockix/server typecheck` exits non-zero)
- Finance webapp typecheck passes: **238 errors** (`pnpm --filter @stockix/webapp typecheck` exits non-zero)
- Typecheck in Docker build stage (`packages/server/Dockerfile` runs `build:server` / webpack only — no `tsc --noEmit`)
- Finance typecheck in local CI mirror (`scripts/quality-gate-local.mjs` — no Finance server/webapp typecheck steps)
- Bill PDF backend endpoint: webapp calls `GET /api/purchases/bills/:id` (`usePdfBill` in `packages/webapp/src/hooks/query/bills.tsx`); `Bills.controller.ts` is `@Controller('bills')` with no PDF content negotiation; no `BillPdf` / `GetBillPdf` service exists
- `bin/stockix.js` referenced in `packages/server/package.json` `"bin"` but `packages/server/bin/` does not exist
- `tenantId` in observability traces: `RequestContextInterceptor` and `GlobalExceptionFilter` log `requestId`, `organizationId`, `userId` only — `tenantId` never included despite CLS usage elsewhere
- `@repo/shared/structured-logger` wired into server logging (Nest `Logger` + ad-hoc `JSON.stringify` used instead)
- Cross-tenant API/integration isolation tests (only 2 unit tests on `TenancyContext` in `tests/unit/tenancy/tenant-isolation.guard.test.ts`; no `TenantKnexFactory` / `TenantModel` scoping tests; no Finance equivalent of API `check:tenant-scope` in CI)
- Finance webapp unit tests in CI (`deploy.yml` runs server tests only)
- `@stockix/sdk-ts` typecheck in root CI (`deploy.yml`, `finance-typecheck.yml`)
- Performance regression gate in CI (`finance:perf-baseline --check` exists in `scripts/finance-performance-baseline.mjs` but not in `deploy.yml`, `finance-typecheck.yml`, or `quality-gate-local.mjs`)
- `docker:check` / runtime image verification in CI quality-gate (only runs on deploy host via `pnpm docker:prebuild`; not in PR quality-gate job)
- Finance Docker image build in CI quality-gate (images built only in deploy `build-images` job after gate)
- HTTP CORS policy (`main.ts` has no `enableCors`; only WebSocket CORS in `Socket.gateway.ts`)
- Redis-backed distributed rate limiting (`AppThrottle.module.ts` — Redis storage commented out; in-memory only)
- Database migration rollback runbook (image/git rollback in `auditlegacy.md` only; no Knex migration rollback procedure documented)
- `MIGRATION_MODE` orchestration in deploy pipeline (middleware exists; not set/referenced in `deploy.yml`)
- `@repo/shared` drift CI check between monorepo root (`packages/shared/`) and finance copy (`services/stockix-finance/packages/shared/`)
- Removal of `cpSync` for shared package (`scripts/prebuild-tenant-images.mjs` still `cpSync`s root → finance before Docker build)
- `docker:check` verification that entire `src/` tree is absent from runtime image (only checks `src/api` and `src/services`, not `src/` root or other subtrees)
- FinancialStatements real implementations (webpack aliases replace `AgingSummaryTable`, `ProfitLossSheet`, `BalanceSheetTable` with stubs in `scripts/webpack.common.js`; module excluded from `tsconfig.typecheck.json`)
- Legacy migration Dockerfile removed or aligned (`services/stockix-finance/docker/migration/Dockerfile` still references `bigcapitalhq/server:latest` and `dist/cli.js` — diverges from `migration-runtime` target)
- `Container.set('logger')` / `Container.set('mail')` registration anywhere in codebase (zero matches — typedi services unregistered)
- DEFAULT_VIEWS fully consolidated under `src/constants/**` (module models still import `@/modules/*/constants` bridges, e.g. `modules/Bills/models/Bill.ts` → `@/modules/Bills/constants`)
- Orphan legacy entity models removed (`src/models/*.ts` — ~91 duplicate entity files parallel to `modules/*/models/`; `src/models/index.ts` barrel unused)
- Hybrid model base unified (`Bill`, `Expense`, `Account` module models extend typedi `TenantModel` from `@/models/TenantModel`; other modules use `TenantBaseModel` from `@/modules/System/models/TenantBaseModel`)
- typedi fully removed from runtime model paths (`typedi` still in `package.json` dependencies; active in `src/models/TenantModel.ts`, `src/system/models/SystemModel.ts`, `src/lib/EventPublisher/EventPublisher.ts`, `src/lib/Mail/index.ts`, `src/decorators/eventDispatcher.ts`)
- Build tooling moved out of production dependencies (`babel-loader`, `gulp`, `gulp-sass` in `dependencies` — survive `pnpm prune --prod` in runtime image)
- Nested Finance workflow Node version aligned (`services/stockix-finance/.github/workflows/typecheck.yml` uses Node 18; monorepo requires Node ≥ 22)

## ⚠️ Partial Implementations

- Sole HTTP runtime entry: production HTTP is `main.ts` → `build/index.js`, but CLI (`build/commands.js`), migration image (`run-system-migrate.mjs`), and OpenAPI export bootstrap separately
- NestJS-only runtime: no legacy Express HTTP bootstrap, but Express still embedded (`express` imports in `main.ts`, `@bull-board/express`, body parsers); CLI boots Knex directly without Nest
- Type safety enforcement: CI scripts exist (`deploy.yml` L115–125) but **currently fail** with 692+238 errors; webpack `transpileOnly: true` allows builds to succeed regardless
- Docker `--target runtime` enforcement: prebuild script uses `--target runtime`, but Dockerfile default final stage is `migration-runtime` (unsafe if built without explicit target)
- `@repo/shared` usage: vendored `lib/deployment-secrets.ts` removed; webpack aliases to finance-local copy (`packages/shared/src/deployment-secrets.ts`), synced via `cpSync` — not direct monorepo workspace at build time
- Duplicate `deployment-secrets.ts`: root and finance copies exist (`packages/shared/src/` vs `services/stockix-finance/packages/shared/src/`) with no automated sync verification beyond prebuild overwrite
- Observability: `RequestContextInterceptor`, `GlobalExceptionFilter`, CLS `requestId` exist; `tenantId` missing from traces; not using shared structured logger
- Migration safety: `MIGRATION_MODE` middleware + unit test exist; `finance:phase-safety.mjs` checks filesystem legacy removal only — not phased Knex migration execution or partial-deploy prevention
- Tenant isolation: `TenancyGlobalGuard` uses Nest DI + CLS (not `Container.get`); enforcement is organization-scoped, not tenantId-scoped in guard; limited test coverage
- Security baseline: `helmet` applied but CSP and COEP disabled; `ThrottlerGuard` global but in-memory storage unsuitable for multi-replica deployments
- DEFAULT_VIEWS migration: canonical constants in `src/constants/**` exist, but duplicate + drifted copy remains in `modules/WarehousesTransfers/constants.ts` (`WAREHOUSE_TRANSFER_ALREADY_TRANSFERRED` vs typo `WAREHOUSE_TRANSFER_ALREAD_TRANSFERRED` in `src/constants/Warehouses/WarehousesTransfers/constants.ts`)
- Hybrid DI bridging: 50+ module files import from `@/models/` legacy infra (`CustomViewBaseModel`, `ModelSearchable`, `TenantModel`, etc.) while Nest modules use `@Injectable()` elsewhere
- Feature parity test: `feature-parity-routes.test.ts` checks file existence only — not route/API parity vs deleted legacy
- Architecture guard: passes for `src/modules/**` typedi, but explicitly allowlists typedi in `src/models/`, `src/lib/Mail/`, `src/lib/EventPublisher/` via `finance-dependency-audit.mjs`
- `DynamicListFilterRoles.service.ts`: uses `import validator from 'is-my-json-valid'` — ESM/CJS interop risk on `/api/items` when `stringified_filter_roles` present
- Emergency deploy bypass: `deploy.yml` `skip_quality_gate` input allows skipping entire quality gate including typecheck and architecture guards

## 🚨 Critical Risks

- typedi `Container.get('logger')` in `TenantModel.query()` with **no `Container.set` anywhere** — runtime throw on tenant query logging path for Bill/Expense/Account models extending `TenantModel`
- FinancialStatements webpack stubs ship in production bundle — Balance Sheet, P&L, Aging Summary report logic is non-functional
- Bill PDF preview is a broken user-facing feature — frontend requests deleted legacy route `/api/purchases/bills/:id`; server has no handler (404)
- 692 server + 238 webapp TypeScript errors — CI quality gate cannot pass; production builds rely on `transpileOnly` webpack with no compile-time safety net
- No cross-tenant leakage integration tests — tenant isolation verified only by 2 mocked unit tests on `TenancyContext.getTenant()`
- In-memory rate limiter ineffective across multiple Finance container replicas — per-instance counters, not shared
- `skip_quality_gate` on deploy workflow allows shipping untyped, unguarded artifacts to production tenants

## 🔧 Required Fixes Before Production

1. Drive server typecheck to zero (692 errors — priority: `src/modules/Tenancy/**`, `src/utils/index.ts`, `src/system/models/**`, then remaining modules)
2. Drive webapp typecheck to zero (238 errors — primarily React/BlueprintJS JSX type mismatches)
3. Add `pnpm run typecheck` to Dockerfile `build-app` stage; switch Docker build to `build:app:strict`
4. Add Finance server + webapp typecheck steps to `scripts/quality-gate-local.mjs`
5. Remove typedi from `TenantModel` / migrate Bill, Expense, Account models to `TenantBaseModel`; or wire Nest logger into typedi via bootstrap bridge with tested `Container.set`
6. Implement Bill PDF endpoint (mirror `SaleInvoices.controller.ts` PDF content negotiation) **or** update webapp `usePdfBill` to correct Nest route
7. Replace FinancialStatements webpack stubs with real report implementations; remove `FinancialStatements/**` from `tsconfig.typecheck.json` exclude
8. Consolidate `DEFAULT_VIEWS` / `ERRORS` into `src/constants/**` only; delete module-level duplicates; fix warehouse transfer typo drift
9. Archive or remove orphan `src/models/*.ts` entity duplicates; unify all module models on `TenantBaseModel`
10. Add `tenantId` to `RequestContextInterceptor` and `GlobalExceptionFilter` trace context; populate in CLS after auth guard
11. Wire `pnpm finance:perf-baseline --check` into `deploy.yml` quality-gate
12. Add `pnpm docker:check` to CI quality-gate; expand checks to verify no `packages/server/src/` directory in runtime image
13. Enforce `--target runtime` in all Docker build paths; remove or align legacy `docker/migration/Dockerfile`
14. Replace `cpSync` prebuild with direct monorepo `@repo/shared` workspace dependency; add CI drift check on `deployment-secrets.ts`
15. Add HTTP CORS for known frontend origins in `main.ts`
16. Upgrade `@nestjs/throttler` Redis storage for multi-instance deployments
17. Document and automate Knex migration rollback; set `MIGRATION_MODE=true` during tenant schema migrations in deploy orchestration
18. Add cross-tenant API isolation integration tests (org A token cannot read/write org B data)
19. Move `babel-loader`, `gulp`, `gulp-sass` to `devDependencies`
20. Create `bin/stockix.js` or remove `"bin"` entry from `packages/server/package.json`
21. Verify/fix `DynamicListFilterRoles.service.ts` `is-my-json-valid` import in webpack production bundle
22. Remove or gate `skip_quality_gate` for production tenant deploys
