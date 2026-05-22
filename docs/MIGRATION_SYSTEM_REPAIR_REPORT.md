# MIGRATION SYSTEM REPAIR REPORT

**Date:** 2026-05-22  
**Scope:** `packages/db` (Drizzle ORM + PostgreSQL)

---

## Root cause found

**Primary: Cause B + custom baseline (destructive)**  
`scripts/ensure-migrations.ts` called `baselineMigrationJournal()` when `tenants` existed but `drizzle.__drizzle_migrations` was empty. That **INSERTed all journal hashes without running SQL**, so Drizzle believed migrations were applied while objects were missing (plans, `tenant_port_seq`, `tenants.modules`, etc.). Post-migrate hooks were added as band-aids.

**Secondary: Cause D (journal out of sync)**  
`0014_clumsy_dagger.sql` existed on disk but was **not listed** in `drizzle/meta/_journal.json` (idx jumped 13 → 15). Drizzle never tracked or applied it via the normal migrator.

**Tertiary: orphan hash after drift repair**  
After bootstrap added `licenses.max_organizations`, migration 0014 could not run (`column already exists`) and its hash was never inserted — leaving **permanent `pending=1`** on every `db:migrate` run.

**Not the cause:** Cause A (`drizzle-kit push` in `db:migrate`) — root `package.json` already uses `pnpm --filter @repo/db db:migrate` with `drizzle-orm` `migrate()`, not push.

---

## Files modified

| File | Change |
|------|--------|
| `packages/db/scripts/migrate.ts` | **New** — proper migrator, pending/applied logging, suppressed notices, orphan reconciliation |
| `packages/db/scripts/post-migrate-bootstrap.ts` | **New** — idempotent plans, `tenant_port_seq`, drift column fix |
| `packages/db/scripts/migration-repair-baseline.ts` | **New** — explicit `STOCKIX_MIGRATION_REPAIR=baseline` only (replaces silent auto-baseline) |
| `packages/db/scripts/ensure-migrations.ts` | Deprecated shim → imports `migrate.ts` |
| `packages/db/drizzle/meta/_journal.json` | Added journal entry **0014_clumsy_dagger** (idx 14) |
| `packages/db/drizzle.config.ts` | Documented `migrations.schema` / `table`; `strict` + `verbose` |
| `packages/db/package.json` | `db:migrate` → `migrate.ts`; added `db:repair:baseline` |
| `packages/db/scripts/ensure-default-plans.ts` | Only run `main()` when executed directly (not on import) |
| `packages/db/scripts/ensure-tenant-port-seq.ts` | Same direct-run guard |

---

## Stack audit (Step 1)

| Item | Value |
|------|--------|
| drizzle-orm | `^0.45.1` |
| drizzle-kit | `^0.31.8` |
| Driver | `postgres` (postgres.js) via `drizzle-orm/postgres-js` |
| Config | `packages/db/drizzle.config.ts` |
| Dialect | `postgresql` |
| Migrations folder | `packages/db/drizzle/` |
| Schema | `packages/db/src/schema.ts` |
| Tracking table | `drizzle.__drizzle_migrations` |

**Scripts (`@repo/db`):** `db:migrate`, `db:generate`, `db:studio`, `db:repair:baseline`, `db:seed:plans`, `db:ensure:sequences`, `verify-schema`  
**Root:** `db:migrate` → `pnpm --filter @repo/db db:migrate` (no `db:push`)

---

## Migration tracking table

| Check | Result |
|-------|--------|
| Table exists | **YES** — `drizzle.__drizzle_migrations` |
| Rows after repair | **31** (matches 31 `.sql` files) |
| Migrations folder | `packages/db/drizzle/` |
| `_journal.json` entries | **31** |

---

## Idempotency verification

Three consecutive `pnpm db:migrate` runs:

1. Reconciled 0014, `applied 1 migration(s). total=31`
2. `pending=0` — `no new migrations (total=31)`
3. `pending=0` — `no new migrations (total=31)`

**db:migrate runs idempotently:** **YES** (no Postgres NOTICE spam; clear pending/applied counts)

---

## Operational commands

```bash
# Normal (safe, repeatable)
pnpm db:migrate

# Generate new migration after schema change
pnpm --filter @repo/db db:generate

# ONE-TIME only: mark journal applied without SQL (existing schema)
STOCKIX_MIGRATION_REPAIR=baseline pnpm --filter @repo/db db:repair:baseline
pnpm db:migrate
```

---

## Verification matrix

| Check | Result |
|-------|--------|
| `tsc --noEmit` (`@repo/db`) | **PASS** |
| API tests | **130 passed** (one run had a 5s import timeout flake; rerun green) |

---

## Rules enforced going forward

- Never use `drizzle-kit push` for production schema apply — use `db:migrate`
- Never auto-baseline without `STOCKIX_MIGRATION_REPAIR=baseline`
- Never edit applied `.sql` files; add new migrations via `db:generate`
- Every `.sql` on disk must have a matching `_journal.json` entry
- Run `pnpm db:migrate` before API/worker in prod and local `pnpm dev`
