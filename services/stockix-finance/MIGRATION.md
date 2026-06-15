# Stockix Finance — Migration & Rollback Runbook

Per-tenant Finance runs two Docker images:

| Image | Target | Purpose |
|-------|--------|---------|
| `stockix-server:local` | `runtime` | NestJS API (`node packages/server/build/index.js`) |
| `stockix-database-migration:local` | `migration-runtime` | System DB Knex migrations (`run-system-migrate.mjs`) |

Tenant stacks start `database_migration` first (`depends_on: service_completed_successfully`), then the server.

---

## Standard migration (tenant stack)

1. **Build migration image** (on deploy host or CI):
   ```bash
   pnpm docker:prebuild
   ```

2. **Enable write protection** on the running Finance server before schema changes that overlap with live traffic:
   ```bash
   # In tenant .env or docker compose override
   MIGRATION_MODE=true
   docker compose --env-file .env up -d server
   ```
   While `MIGRATION_MODE=true`, the API returns `503` for tenant write methods (`POST`, `PUT`, `PATCH`, `DELETE`). `GET`/`HEAD`/`OPTIONS` and `/api/internal/*` continue to work.

3. **Run migrations** (compose runs this automatically on `up`):
   ```bash
   docker compose --env-file .env up database_migration
   ```
   Or manually:
   ```bash
   docker run --rm --env-file .env stockix-database-migration:local
   ```

4. **Deploy new server image** and **disable migration mode**:
   ```bash
   MIGRATION_MODE=false
   docker compose --env-file .env up -d server
   ```

5. **Verify**:
   - `GET /api/ping` returns 200
   - A write operation (e.g. create draft invoice) succeeds
   - Logs show expected `tenantId` on requests

---

## Platform deploy (`deploy.yml`)

During production deploy, platform Postgres migrations run before image pull:

```bash
pnpm --filter @repo/db db:migrate
```

Finance tenant images are rebuilt after core services are healthy (`pnpm docker:prebuild`). For rolling tenant schema updates across many stacks:

1. Set `MIGRATION_MODE=true` on each affected tenant server **before** recreating `database_migration`.
2. Run migration container to completion.
3. Roll server to new image with `MIGRATION_MODE=false`.

`skip_quality_gate` cannot bypass checks on `main` — see `.github/workflows/deploy.yml`.

---

## Rollback procedures

### A) Application rollback (no schema change)

1. Retag previous image:
   ```bash
   docker tag <previous-image-id> stockix-server:local
   ```
2. Restart server:
   ```bash
   docker compose --env-file .env up -d server
   ```

### B) Migration rollback (schema changed)

Knex migrations are **forward-only** in production. To roll back schema:

1. Set `MIGRATION_MODE=true` on the server.
2. Restore MySQL from snapshot taken **before** the migration batch.
3. Deploy the **previous** `stockix-database-migration:local` image tag that matches the restored schema.
4. Deploy matching `stockix-server:local` image.
5. Clear `MIGRATION_MODE` after verification.

**Snapshot before migrate:**
```bash
# Example — adjust for your backup tooling
mysqldump -h stockix-mysql-proxy -u ... SYSTEM_DB_NAME > pre-migrate-$(date +%Y%m%d).sql
```

### C) Failed migration mid-batch

1. Check `knex_migrations` / `knex_migrations_lock` in the system database.
2. If lock stuck:
   ```sql
   UPDATE knex_migrations_lock SET is_locked = 0 WHERE `index` = 1;
   ```
   (`run-system-migrate.mjs` attempts this automatically.)
3. Fix forward migration or restore snapshot (procedure B).
4. Do **not** leave `MIGRATION_MODE=true` after recovery — writes stay blocked.

### D) Full tenant stack rollback

1. `docker compose down server`
2. Restore DB snapshot
3. Retag previous `stockix-server:local` and `stockix-database-migration:local`
4. `docker compose up -d`

---

## Environment reference

| Variable | Purpose |
|----------|---------|
| `MIGRATION_MODE` | `true` / `1` blocks tenant writes during migration |
| `SYSTEM_DB_*` | System MySQL connection for migration container |
| `REDIS_KEY_PREFIX` | Isolates throttle/queue keys per tenant on shared Redis |

---

## Related files

- `packages/server/src/common/middleware/migration-mode.middleware.ts`
- `packages/server/scripts/run-system-migrate.mjs`
- `infra/tenant-stack/docker-compose.yml` (`database_migration` service)
- `scripts/prebuild-tenant-images.mjs`
