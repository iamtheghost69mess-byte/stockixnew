# ADR-002: PMS Database Isolation

**Status:** Accepted  
**Date:** 2026-06-20  
**Deciders:** Platform team  

---

## Context

The Property Management System (PMS) service (`services/pms`) currently connects to the same
Postgres database as the control-plane API (`DATABASE_URL`). PMS schema migrations run via the
shared `@repo/db` package and touch `pms_*` prefixed tables inside the monolith database.

**Problems with the current setup:**
- A PMS schema migration can lock the control-plane database and disrupt API/dashboard traffic.
- PMS can be independently scaled only by spinning up more processes, but all share the same
  connection pool target.
- The PMS data footprint (booking history, iCal sync logs, guest records) grows unbounded
  inside the operator's primary database.
- Long-running iCal sync jobs compete with OLTP queries on the same connection pool.

## Decision

Introduce a dedicated `PMS_DATABASE_URL` environment variable and update `services/pms/src/db.ts`
to connect to it instead of the shared `DATABASE_URL`. In production, this points to a separate
Postgres instance (or database cluster node). In development and staging where a separate instance
is impractical, `PMS_DATABASE_URL` may be the same connection string (targeting a separate
logical database on the same host) or omitted to fall back to `DATABASE_URL`.

### Code changes (already applied)

| File | Change |
|------|--------|
| `packages/config/src/pms.ts` | Added `databaseUrl` getter reading `PMS_DATABASE_URL` with `DATABASE_URL` fallback |
| `services/pms/src/db.ts` | Now reads `pmsConfig.databaseUrl` instead of `dbConfig.databaseUrl` |

### Schema strategy

PMS tables stay in `@repo/db/schema` with their `pms_*` prefix for now. After the physical
migration (ADR-002-Phase-2), a future ADR will move schema ownership to
`services/pms/src/schema.ts` and sever the dependency on `@repo/db`.

## Migration plan (execute in staging first)

### Phase 1 — Provision the PMS database

```sql
-- Run on the Postgres server as superuser
CREATE DATABASE pms_platform
  ENCODING 'UTF8'
  LOCALE_PROVIDER libc
  LC_COLLATE 'C'
  LC_CTYPE 'C'
  TEMPLATE template0;

CREATE USER pms_platform WITH PASSWORD '<strong-password>';
GRANT ALL PRIVILEGES ON DATABASE pms_platform TO pms_platform;
```

### Phase 2 — Copy PMS tables

```bash
# 1. Identify PMS tables from the control-plane database:
psql "$DATABASE_URL" -c "\dt pms_*"

# 2. Dump only PMS tables (pg_dump --table flag, one per table):
pg_dump "$DATABASE_URL" \
  --table="pms_bookings" \
  --table="pms_guests" \
  --table="pms_ical_channels" \
  --table="pms_sync_logs" \
  --table="pms_payments" \
  --table="pms_properties" \
  --table="pms_message_templates" \
  --table="pms_guest_forms" \
  --table="pms_staff" \
  --format=custom \
  --file=/tmp/pms-tables.dump

# 3. Restore into the new database:
pg_restore --dbname="$PMS_DATABASE_URL" --no-owner --no-acl /tmp/pms-tables.dump
```

### Phase 3 — Validate and cut over

```bash
# Count rows in both DBs for each table:
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM pms_bookings;"
psql "$PMS_DATABASE_URL" -c "SELECT COUNT(*) FROM pms_bookings;"
```

1. Set `PMS_DATABASE_URL` in infra env (staging first, then production).
2. Restart PMS service — it connects to the new database.
3. Run smoke tests: verify iCal sync, booking creation, guest APIs.
4. Keep the PMS tables in the control-plane DB for 2 weeks as a safety net.
5. After validation, drop PMS tables from control-plane DB (script at
   `scripts/pms-drop-from-control-plane.sql`).

### Rollback

Set `PMS_DATABASE_URL=""` (empty string forces fallback to `DATABASE_URL`). The PMS tables in
the original database are untouched until Phase 3 drop is executed.

## Consequences

**Positive:**
- PMS schema migrations no longer impact control-plane availability.
- PMS connection pool is independent; connection pressure is isolated.
- Operational path to deploying PMS on a separate host or RDS instance.

**Negative:**
- One more connection string to manage per environment.
- `@repo/db` still owns PMS schema types until a follow-up ADR breaks that coupling.
- Cross-database queries (control-plane querying PMS data) require an API call — no SQL joins.
