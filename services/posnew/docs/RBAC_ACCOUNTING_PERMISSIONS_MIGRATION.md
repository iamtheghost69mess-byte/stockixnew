# RBAC migration: new accounting permission IDs

After shipping expense reports, approvals inbox, and consolidated reporting, some tenants may still see **403** on new APIs or missing sidebar links. That happens when `RbacConfig` stores **explicit** `can` arrays (via `builtinOverrides` or `customRoles`) that were saved **before** the new catalog ids existed. Wildcards such as `backoffice.accounting.*` do not need this migration.

## Script

From `apps/pos-backend`:

```bash
# Preview changes (default)
node scripts/migrate-rbac-accounting-catalog-permissions.js

# Persist
node scripts/migrate-rbac-accounting-catalog-permissions.js --apply

# Also add expenses.write + approvals.write when the role already has gl.write
node scripts/migrate-rbac-accounting-catalog-permissions.js --apply --include-writes

# Limit to one organization
node scripts/migrate-rbac-accounting-catalog-permissions.js --apply --org=<MongoObjectId>
```

NPM shortcut (from `apps/pos-backend`):

```bash
npm run migrate:rbac-accounting-permissions
```

With flags:

```bash
npm run migrate:rbac-accounting-permissions -- --apply --include-writes
```

## Rules (conservative)

- **Skipped** if `can` contains `*`, `backoffice.*`, or `backoffice.accounting.*`.
- **Read bundle** added when the role has both `backoffice.accounting.read` and `backoffice.accounting.gl.read` and is missing any of:
  - `backoffice.accounting.expenses.read`
  - `backoffice.accounting.approvals.read`
  - `backoffice.accounting.consolidated.read`
- **Write bundle** (only with `--include-writes`): if the role has `backoffice.accounting.gl.write`, add `expenses.write` and `approvals.write` when missing. `expenses.approve` is **not** auto-granted.

## After apply

The script calls `invalidateRbacCache` per updated org. Users may need to **refresh** or **re-login** so `GET /api/user` returns the updated `permissions` array.

## Rollback

Restore `RbacConfig` from a database backup, or manually `$pull` / edit the `can` arrays listed in the dry-run output.

## Verification

1. Dry-run in staging; review lines starting with `+`.
2. Apply in staging; log in as an affected user; confirm `GET /api/user` includes the new strings and e.g. `GET /api/accounting/expense-reports` returns **200**.

Unit tests for merge logic: `apps/pos-backend/tests/unit/rbac-accounting-catalog-migration.test.js`.
