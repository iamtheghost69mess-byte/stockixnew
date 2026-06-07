# Production operations — control plane

# SECRETS ROTATED: 2026-05-27 — credentials rotated on production host after git history exposure (see [docs/SECRET_ROTATION_RUNBOOK.md](../../docs/SECRET_ROTATION_RUNBOOK.md))

Reference for `infra/prod` deploys. Secrets live in `infra/prod/.env` (gitignored).

**Do not run `source infra/prod/.env` in bash** — values like `SECURITY_HSTS` contain semicolons and can cause exit 127. Use `scripts/load-env-file.sh infra/prod/.env` or let CI/deploy load env safely.

After editing, sync and redeploy:

```bash
pnpm env:sync-prod          # copies infra/prod/.env → repo root .env (worker fallback)
cd infra/prod
docker compose --env-file .env up -d --build api api-bullmq infra-worker control-plane-redis
```

## Secret rotation (required before first paying-customer traffic)

`.env` appeared in git history. Follow [docs/SECRET_ROTATION_RUNBOOK.md](../../docs/SECRET_ROTATION_RUNBOOK.md) on the **production host**:

1. Rotate every secret in the runbook table (Postgres password, session, API keys, signing secrets, mail, webhooks, Cloudflare, Chatwoot, per-tenant `INTERNAL_API_SECRET`).
2. `UPDATE owners SET session_version = session_version + 1;`
3. Update `infra/prod/.env` only on the server (never commit).
4. `pnpm env:sync-prod` then redeploy (command above).
5. Re-sync `LICENSE_SIGNING_SECRET` to all POS tenant env files.
6. Set `SECRETS ROTATED: YYYY-MM-DD` in this file header.

## API and BullMQ layout

| Service | Replicas | `RUN_BULLMQ_CONSUMERS` | Traefik |
|---------|----------|------------------------|---------|
| `api` | 1 (single Compose service; use `--scale api=N` only after Redis provision bus) | `false` | yes — `api.${ROOT_DOMAIN}` |
| `api-bullmq` | 1 | `true` | no — internal only |

Post-deploy smoke (from repo root on server):

```bash
bash scripts/prod-scale-smoke.sh
```

## Scaling

The control-plane API runs as a **single** Compose service (`api`). Plain Docker Compose ignores Swarm-only `deploy.replicas`.

To run multiple API instances:

1. Deploy **P1-7 Redis provision pub/sub** (`CONTROL_PLANE_REDIS_URL` + `provision-pubsub.ts`) so provision SSE survives API restarts and cross-instance fan-out.
2. Scale explicitly: `docker compose --env-file .env up -d --scale api=2 api`
3. Confirm Traefik load-balances health-checked backends.

Do **not** scale the API before the Redis provision bus is live — in-memory provision events will not propagate across instances.

## Security boundaries

PMS tables live in the **same control-plane Postgres** database as tenants, licenses, and audit data. Isolation is enforced at the **application layer** (`tenantId` on every query via `x-stockix-tenant-id` / proxy headers). There is no per-tenant Postgres database for PMS today.

**Risk:** a control-plane SQL injection or service bug that bypasses tenant scoping could expose cross-tenant PMS data.

**Mitigation today:** mandatory `tenantId` filters in `services/pms/` route handlers; periodic grep audit; proxy injects tenant header.

**Before public multi-tenant scale:** migrate PMS to per-tenant Postgres (see `TODO(security)` in `packages/db/src/schema.ts`).

## Database migrations

All migrations in `packages/db/drizzle/meta/_journal.json` (including 0044–0046 and `0050_tenant_public_discovery_slug`) apply via:

```bash
cd /opt/stockix/stockixnew
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts
```

## Schema verification

Runs automatically in CI deploy immediately after migrations.

Manual production run:

```bash
# IMPORTANT: Never use 'source infra/prod/.env' — semicolons in values break bash.
. scripts/load-env-file.sh infra/prod/.env
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts
```

Expected output: `✅ Schema verified: all N required columns present.`

If it fails, resolve listed missing columns/types before serving traffic.

After migrate, backfill public discovery slugs and sync tenant Finance `.env` files:

```bash
node apps/api/scripts/backfill-discovery-slugs.mjs
node apps/api/scripts/sync-tenant-discovery-env.mjs
# Rebuild tenant webapp images so Vite bakes REACT_APP_STOCKIX_DISCOVERY_SLUG
```

Do **not** run `scripts/apply-orphan-migrations.ts` in CI — emergency recovery only.

**Verify:**

```bash
docker exec -i stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "SELECT slug FROM platform_roles ORDER BY 1;"
```

## Environment variables (Section 1)

| Variable | Where | Notes |
|----------|--------|--------|
| `LICENSE_SIGNING_SECRET` | `infra/prod/.env` → api + worker via compose | Min 32 chars; generate with `node scripts/generate-env-secrets.js` |
| `CONTROL_PLANE_REDIS_URL` | `infra/prod/.env` | `redis://control-plane-redis:6379/0` when using prod compose Redis |
| `LICENSE_SIGNING_SECRET` | Each tenant **POS** `.env` | **Must match** control-plane value for STXI validation |

### POS tenant stacks

Each provisioned POS backend reads `LICENSE_SIGNING_SECRET` from its tenant env file. When provisioning or updating tenants, set the same value as production `LICENSE_SIGNING_SECRET` in:

- Tenant stack env under `TENANT_ENV_ROOT`, or
- `services/posnew/apps/pos-backend/.env` used by that tenant’s compose project

Mismatch causes STXI keys generated on the API to fail validation on POS login.

## Tenant branding (Finance webapp)

- Edit via dashboard tenant detail **Branding** tab → `PUT /tenants/:id/config` (control-plane `tenant_config`).
- Worker writes `REACT_APP_STOCKIX_APP_NAME`, `REACT_APP_STOCKIX_LOGO_URL`, `REACT_APP_STOCKIX_PRIMARY_COLOR` into `infra/tenant-env/{slug}/.env`.
- Rebuild the tenant Finance webapp image so Vite bakes env vars: `node scripts/rebuild-tenant-webapp.mjs {slug}` (or your deployment equivalent).
- API pushes metadata to Finance: `POST /api/internal/organization/branding/sync` on the tenant stack (requires `INTERNAL_API_SECRET`).

## Finance license sync on provision

- Worker and API sync plan `maxOrganizations` to Finance `tenant_licenses` after provision (`syncFinanceLicense` / `syncFinanceLicenseForStockixTenant`).
- `organization.provision` syncs license for each new Finance sub-tenant using the parent Stockix tenant’s active license.
- Provision readiness includes `finance_license_sync_missing` when accounting modules are enabled but no sync event was journaled.
- `FINANCE_LICENSE_SYNC_OPTIONAL=1` (development only) allows provision to continue if sync fails.

## License ↔ POS sync strict mode

- `LICENSE_SYNC_STRICT=1` on the control-plane API: license suspend and tenant suspend **fail with HTTP 502** when Finance or POS sync fails (instead of returning success with `posSync: "failed"`).
- Recommended for production **after** staging verification of suspend/reactivate and STXI flows ([docs/section-2.3-license-e2e-checklist.md](../../docs/section-2.3-license-e2e-checklist.md)).
- Default (unset): license row updates succeed; POS sync failures are logged and surfaced in API JSON (`posSync`, `errors`).

## Email configuration

### Resend webhook setup

1. Log in to [resend.com](https://resend.com) → **Webhooks** → **Add Endpoint**
2. URL: `https://api.${ROOT_DOMAIN}/webhooks/resend` (replace with your API host)
3. Events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`
4. Copy the **Signing Secret** (`whsec_…`)
5. Set in `infra/prod/.env`: `RESEND_WEBHOOK_SECRET=<signing-secret>`
6. `pnpm env:sync-prod` then restart: `docker compose --env-file .env restart api api-bullmq`

Without `RESEND_WEBHOOK_SECRET`, production rejects unsigned webhooks (401). `email_logs` delivery status will not update.

## Redis (mandatory in production)

`CONTROL_PLANE_REDIS_URL` is **required**. The API exits on startup if unset in production.
Rate limits and BullMQ are not safe across multiple API replicas without shared Redis.

Prod compose runs **`api`** (1 replica, `RUN_BULLMQ_CONSUMERS=false`) and **`api-bullmq`** (1 replica, `RUN_BULLMQ_CONSUMERS=true`). Do not set `RUN_BULLMQ_CONSUMERS=true` on `api`.

## Cloudflare DNS API token

`CF_DNS_API_TOKEN` is **required** for Traefik automatic TLS (Let's Encrypt DNS-01 via Cloudflare).

- **Source:** Cloudflare dashboard → API Tokens → Create Token
- **Permission:** Zone → DNS → Edit (scoped to your zone)
- **Variable:** `CF_DNS_API_TOKEN` in `infra/prod/.env`
- **If missing:** certificate issuance and renewal fail → HTTPS breaks for `api.*` and tenant routes

## Docker socket-proxy

The socket-proxy restricts Docker API access for the worker.

Current permissions:
- `CONTAINERS=1`, `NETWORKS=1`, `SERVICES=1`, `TASKS=1`, `INFO=1`, `VERSION=1`, `IMAGES=1`, `VOLUMES=1`
- `POST=1` — worker compose up/down/run, network connect, exec
- `EVENTS=1` — Traefik Docker provider watches container changes via the same proxy
- `BUILD=0` — tenant images are pre-built (`pnpm docker:prebuild`); worker uses `--no-build`

Traefik uses `tcp://socket-proxy:2375` for the Docker provider (no direct `/var/run/docker.sock` mount on Traefik). Tenant subdomain routes still come from the **file** provider (`TRAEFIK_DYNAMIC_DIR`).

If Traefik stops discovering `api` / dashboard routers after a proxy change, confirm `EVENTS=1` and that Traefik is on `socket_proxy_network`. Rollback (temporary): restore Traefik `docker.sock` volume and `unix:///var/run/docker.sock` endpoint — document reason here before doing so in production.

Security note: socket-proxy compromise = host root access. Never expose port `2375` outside internal Docker networks.

## Control plane queues (BullMQ)

- Redis service: `control-plane-redis` (internal Docker network only).
- API logs on start when `CONTROL_PLANE_REDIS_URL` is set:
  - `License expiry BullMQ worker started`
  - `Owner invite mail BullMQ worker started`
- License milestone log line: `license_expiry_milestone_fired`.
- Owner invite mail log line: `owner_invite_mail_sent`; exhausted retries audit `invite.email_failed`.
- If Redis is down or URL unset, license milestones and owner invite mail run **inline** in the API request (degraded but functional).

## POS bootstrap credentials repair

When `defaultCredentials` on a POS org drifts from bootstrap users (masked rows missing or wrong counts):

```bash
curl -X POST "https://api.${ROOT_DOMAIN}/api/platform/v1/organizations/{posOrgId}/repair-credentials" \
  -H "X-Api-Key: $POS_PLATFORM_API_KEY"
```

Or run `node services/posnew/apps/pos-backend/scripts/repairCredentials.js` (uses the same sync logic). Plaintext PINs cannot be recovered — use dashboard **Reset PIN** per role.

## Database Backup (Backblaze B2)

Backups run automatically at **02:00 and 14:00 UTC** via the `db-backup` container.  
Storage: Backblaze B2 (S3-compatible), bucket: `$BACKUP_B2_BUCKET`.

Required env: `BACKUP_B2_BUCKET`, `BACKUP_B2_KEY_ID`, `BACKUP_B2_APP_KEY`, `BACKUP_B2_ENDPOINT`.

### Verify last backup

```bash
docker compose -f infra/prod/docker-compose.yml logs db-backup --tail=20
# Expect: "[backup] Backup complete."
```

### List available backups

```bash
AWS_ACCESS_KEY_ID=$BACKUP_B2_KEY_ID \
AWS_SECRET_ACCESS_KEY=$BACKUP_B2_APP_KEY \
aws s3 ls "s3://$BACKUP_B2_BUCKET/$BACKUP_B2_PREFIX/" \
  --endpoint-url "$BACKUP_B2_ENDPOINT" \
  | sort | tail -10
```

### Restore procedure

```bash
# 1. Download the backup
AWS_ACCESS_KEY_ID=$BACKUP_B2_KEY_ID \
AWS_SECRET_ACCESS_KEY=$BACKUP_B2_APP_KEY \
aws s3 cp \
  "s3://$BACKUP_B2_BUCKET/$BACKUP_B2_PREFIX/<filename>.dump.gz" \
  /tmp/restore.dump.gz \
  --endpoint-url "$BACKUP_B2_ENDPOINT"

# 2. Decompress
gunzip /tmp/restore.dump.gz

# 3. Stop API to prevent writes during restore
cd infra/prod
docker compose --env-file .env stop api api-bullmq

# 4. Restore
docker exec -i stockix-postgres-1 pg_restore \
  -U "$POSTGRES_USER" \
  -d "${POSTGRES_DB:-stockix_platform}" \
  --clean \
  --if-exists \
  --verbose \
  < /tmp/restore.dump

# 5. Restart API
docker compose --env-file .env start api api-bullmq

# 6. Verify
curl -fsS "${PUBLIC_BASE_URL_SCHEME:-https}://${API_DOMAIN}/ready"
```

### Estimated RPO

Maximum data loss: ~12 hours (between 02:00 and 14:00 UTC windows). For &lt;1 hour RPO, add continuous WAL archiving later.

## Rollout checklist

1. Backup Postgres (`stockix_platform`) or confirm S3 backup job healthy.
2. Apply migrations 0044 → 0045 → 0046.
3. Set `CONTROL_PLANE_REDIS_URL` in `infra/prod/.env`.
4. Deploy `control-plane-redis`, `api`, `infra-worker`.
5. Confirm API health and one test milestone (staging license) if possible.
6. Propagate `LICENSE_SIGNING_SECRET` to POS tenant envs before issuing new STXI keys.

## GitHub branch protection

Status: **PENDING**

Required checks:
- Quality gate (`.github/workflows/deploy.yml`)
- Gitleaks (`.github/workflows/secret-scan.yml`)

Minimum reviewers: 1  
Admin bypass: DISABLED (required)

Verified by: [NAME] on [DATE]

---

## M1 — Stuck provision runbook

### Symptoms

- `tenant_lifecycle_jobs` row has `status = 'running'` for > 30 minutes
- Worker logs stall at one step (e.g. `docker.app_step`, `tenant.health_check`)
- Dashboard shows tenant stuck in "provisioning"

### Diagnosis

```bash
# 1. Find the stuck job
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "SELECT id, tenant_id, type, status, started_at, correlation_id \
      FROM tenant_lifecycle_jobs WHERE status = 'running' ORDER BY started_at;"

# 2. Read the last provision events for that tenant
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "SELECT phase, level, message, created_at \
      FROM tenant_provision_events \
      WHERE correlation_id = '<correlation_id>' \
      ORDER BY created_at DESC LIMIT 20;"

# 3. Check if compose stack is actually up
docker ps --filter "name=stockix-<slug>" --format "table {{.Names}}\t{{.Status}}"

# 4. Check advisory lock held in Postgres
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "SELECT pid, granted, classid, objid FROM pg_locks WHERE locktype = 'advisory';"
```

### Safe recovery actions

1. **If worker crashed** (no process holding lock):
   - Lock releases automatically when Postgres connection drops
   - Restart worker: `docker compose -f infra/prod/docker-compose.yml --env-file .env restart infra-worker`
   - The job will be reclaimed and retried from last journal checkpoint (`hasOp` resumes)

2. **If compose step is hanging** (e.g. image pull timeout):
   - Kill the stuck compose process (worker restart above handles this)
   - Worker retries from last `markOp` — already-completed steps are skipped

3. **If tenant is in partial state after retry**:
   - See M5 — Partial tenant runbook

4. **If you need to force-fail the job**:

```bash
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "UPDATE tenant_lifecycle_jobs SET status = 'failed', \
      last_error = 'manual_force_fail', completed_at = NOW(), updated_at = NOW() \
      WHERE id = '<job_id>';"
# Then update tenant status
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "UPDATE tenants SET status = 'failed' WHERE id = '<tenant_id>';"
```

After force-fail, retry via dashboard or API with `retryModules`.

**Never delete the Postgres tenant row before running compose down and database cleanup.**

---

## M2 — Failed deprovision runbook

### Symptoms

- `tenant_lifecycle_jobs` row `status = 'failed'` for a deprovision job
- Tenant Postgres row still exists
- One or more of: Docker containers still up, MySQL DBs remain, Mongo DB remains, Redis keys remain, Traefik YAML exists

### Diagnosis

```bash
SLUG=<tenant_slug>

# 1. Check what failed (cleanupResults in logs)
docker logs stockix-infra-worker-1 2>&1 | grep -A5 "\[deprovision\]" | tail -40

# 2. Check what's still running
docker ps --filter "name=stockix-${SLUG}" --format "table {{.Names}}\t{{.Status}}"

# 3. Check MySQL remnants
SAFE_SLUG=$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | cut -c1-28)
docker exec -e MYSQL_PWD="$SHARED_MYSQL_ROOT_PASSWORD" \
  stockix-shared-stockix-mysql-1 \
  mysql -uroot -e "SHOW DATABASES LIKE 'stockix_${SAFE_SLUG}%';"

# 4. Check Mongo remnants
docker exec stockix-shared-stockix-mongo-1 \
  mongosh --quiet --eval "db.getSiblingDB('${SLUG}_pos').stats().ok"

# 5. Check Redis remnants
docker exec stockix-shared-stockix-redis-1 \
  redis-cli KEYS "tenant:${SLUG}:*" | wc -l

# 6. Check Traefik YAML
ls -la "${TRAEFIK_DYNAMIC_DIR}/tenant-${SLUG}.yml" \
       "${TRAEFIK_DYNAMIC_DIR}/tenant-pos-${SLUG}.yml" 2>/dev/null || echo "none"

# 7. Run orphan audit (includes legacy stockix_*_finance DBs — also dropped by deprovisionTenantDatabases)
cd /opt/stockix/stockixnew
npx tsx infra/worker-service/scripts/audit-orphan-dbs.ts
```

### Recovery — retry first

Re-trigger deprovision via control-plane API (preferred — uses advisory lock + cleanup). Dashboard session auth works the same as `PLATFORM_API_SECRET` bearer.

```bash
curl -X DELETE "https://api.${ROOT_DOMAIN}/tenants/${TENANT_ID}?volumes=true" \
  -H "Authorization: Bearer $PLATFORM_API_SECRET"
```

### Recovery — manual cleanup (if retry fails)

Run in order — do NOT skip steps:

```bash
SLUG=<tenant_slug>
SAFE_SLUG=$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | cut -c1-28)

# Step 1: Compose down
docker compose -f /opt/stockix/stockixnew/infra/tenant-stack/docker-compose.yml \
  -p stockix-${SLUG} down --remove-orphans --timeout 30 || true

# POS stack if applicable
docker compose -f /opt/stockix/stockixnew/infra/pos-tenant-stack/docker-compose.yml \
  -p stockix-pos-${SLUG} down --remove-orphans --timeout 30 || true

# Step 2: MySQL cleanup
docker exec -e MYSQL_PWD="$SHARED_MYSQL_ROOT_PASSWORD" \
  stockix-shared-stockix-mysql-1 mysql -uroot <<SQL
DROP DATABASE IF EXISTS \`stockix_${SAFE_SLUG}_finance\`;
DROP DATABASE IF EXISTS \`stockix_${SAFE_SLUG}_system\`;
DROP USER IF EXISTS 'tenant_${SAFE_SLUG}'@'%';
FLUSH PRIVILEGES;
SQL

# Step 3: MongoDB cleanup
docker exec stockix-shared-stockix-mongo-1 \
  mongosh --quiet --eval "db.getSiblingDB('${SLUG}_pos').dropDatabase()"

# Step 4: Redis cleanup
docker exec stockix-shared-stockix-redis-1 \
  redis-cli --scan --pattern "tenant:${SLUG}:*" | \
  xargs -r docker exec -i stockix-shared-stockix-redis-1 redis-cli DEL

# Step 5: Traefik YAML removal
rm -f "${TRAEFIK_DYNAMIC_DIR}/tenant-${SLUG}.yml"
rm -f "${TRAEFIK_DYNAMIC_DIR}/tenant-pos-${SLUG}.yml"

# Step 6: Tenant env dir removal
rm -rf "${TENANT_ENV_ROOT}/${SLUG}"

# Step 7: Postgres cleanup (LAST — only after data-plane is clean)
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "DELETE FROM tenant_provision_events WHERE tenant_id = (SELECT id FROM tenants WHERE slug = '${SLUG}');"
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "DELETE FROM tenant_deployments WHERE tenant_id = (SELECT id FROM tenants WHERE slug = '${SLUG}');"
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "DELETE FROM tenants WHERE slug = '${SLUG}';"
```

**Partial cleanup policy:** If MySQL/Redis cleanup succeeds but Mongo drop fails (e.g. RS unavailable), the Postgres row is NOT deleted. Fix Mongo RS first (see M3), then re-run deprovision or continue from Step 3 above.

---

## M3 — MongoDB replica set failure runbook

### Symptoms

- POS containers get `MongoServerError: not primary` or `MongoServerError: no primary found`
- `healthcheck.sh` reports `mongo: RS not healthy`
- Provision fails at Mongo TCP verification step

### Diagnosis

```bash
# 1. Check container status
docker ps --filter "name=stockix-shared-stockix-mongo" --format "table {{.Names}}\t{{.Status}}"

# 2. Check RS status
docker exec stockix-shared-stockix-mongo-1 \
  mongosh --quiet --eval "JSON.stringify(rs.status())" | python3 -m json.tool | head -40

# 3. Check container logs
docker logs stockix-shared-stockix-mongo-1 --tail=50

# 4. Check disk space (common cause)
df -h /var/lib/docker
```

### Recovery — container restart (single-node RS)

```bash
# Single-node RS — just restart the container
docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env \
  -p stockix-shared restart stockix-mongo

# Wait for healthy
sleep 15
docker exec stockix-shared-stockix-mongo-1 \
  mongosh --quiet --eval "rs.status().ok"
# Expected: 1
```

### Recovery — RS re-initiation (if status fails)

```bash
docker exec stockix-shared-stockix-mongo-1 mongosh --quiet --eval "
  try {
    rs.status();
    print('RS already initiated — if degraded, check member health');
  } catch(e) {
    rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'stockix-mongo:27017' }] });
    print('RS re-initiated');
  }
"
```

### Recovery — full container replacement

```bash
# Only if container is corrupt/missing — DATA SURVIVES via named volume
docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env \
  -p stockix-shared up -d --force-recreate stockix-mongo

# Re-run rs-init
docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env \
  -p stockix-shared run --rm stockix-mongo-rs-init
```

### After recovery

- Run `healthcheck.sh` to confirm exit 0
- Provision/deprovision can resume — worker retries from journal checkpoint
- If POS containers failed to start, restart them: `docker compose -p stockix-pos-<slug> up -d`

---

## M4 — Shared MySQL outage runbook

### Symptoms

- All Finance tenants return DB connection errors
- `healthcheck.sh` reports `mysql: ping failed`
- Provision fails at `docker.data_step` (provisionTenantDatabases)
- Worker logs: `ECONNREFUSED` to `stockix-mysql:3306`

### Diagnosis

```bash
# 1. Container status
docker ps --filter "name=stockix-shared-stockix-mysql" --format "table {{.Names}}\t{{.Status}}"

# 2. Container logs
docker logs stockix-shared-stockix-mysql-1 --tail=50

# 3. Disk space (most common cause of MySQL crash)
df -h /var/lib/docker
docker system df

# 4. Connection count (if running but overloaded)
docker exec -e MYSQL_PWD="$SHARED_MYSQL_ROOT_PASSWORD" \
  stockix-shared-stockix-mysql-1 \
  mysql -uroot -e "SHOW STATUS LIKE 'Threads_connected';"

# 5. Slow query log
docker exec stockix-shared-stockix-mysql-1 \
  tail -20 /var/lib/mysql/$(hostname)-slow.log 2>/dev/null || echo "no slow log"
```

### Recovery — restart

```bash
docker compose -f infra/shared/docker-compose.yml --env-file infra/prod/.env \
  -p stockix-shared restart stockix-mysql

# Wait for healthy (up to 60s)
for i in $(seq 1 12); do
  docker exec -e MYSQL_PWD="$SHARED_MYSQL_ROOT_PASSWORD" \
    stockix-shared-stockix-mysql-1 \
    mysqladmin ping -h 127.0.0.1 -uroot --silent 2>/dev/null && echo "MySQL ready" && break
  echo "Waiting... $i"
  sleep 5
done
```

### Recovery — restore from backup

```bash
# Download latest MySQL backup from B2
AWS_ACCESS_KEY_ID=$BACKUP_B2_KEY_ID \
AWS_SECRET_ACCESS_KEY=$BACKUP_B2_APP_KEY \
aws s3 ls "s3://$BACKUP_B2_BUCKET/$BACKUP_B2_PREFIX/" \
  --endpoint-url "$BACKUP_B2_ENDPOINT" | grep shared_mysql | sort | tail -3

# Download chosen backup
AWS_ACCESS_KEY_ID=$BACKUP_B2_KEY_ID \
AWS_SECRET_ACCESS_KEY=$BACKUP_B2_APP_KEY \
aws s3 cp "s3://$BACKUP_B2_BUCKET/$BACKUP_B2_PREFIX/<filename>.sql.gz" \
  /tmp/mysql_restore.sql.gz --endpoint-url "$BACKUP_B2_ENDPOINT"

# Restore (stops all Finance tenants briefly)
gunzip -c /tmp/mysql_restore.sql.gz | \
  docker exec -i -e MYSQL_PWD="$SHARED_MYSQL_ROOT_PASSWORD" \
    stockix-shared-stockix-mysql-1 mysql -uroot

# Verify grants restored
docker exec -e MYSQL_PWD="$SHARED_MYSQL_ROOT_PASSWORD" \
  stockix-shared-stockix-mysql-1 \
  mysql -uroot -e "SELECT user, host FROM mysql.user WHERE user LIKE 'tenant_%';"
```

### After recovery

- Finance server containers will auto-reconnect via pool retry
- If a tenant Finance container is in error state: `docker compose -p stockix-<slug> restart server`
- Run `healthcheck.sh` to confirm exit 0
- Blast radius: all Finance tenants affected during outage — check `tenant_provision_events` for any failed provisions during the window

---

## M5 — Partial tenant recovery runbook

### Definition

A "partial" tenant has mismatched state across data planes:

| Scenario | Postgres row | Compose containers | Shared DBs | Traefik YAML |
|----------|--------------|--------------------|------------|--------------|
| Provision failed mid-way | exists (status=failed/partial) | may be up or down | may exist | may exist |
| Deprovision failed mid-way | exists (status=failed) | should be down | may exist | may or may not exist |
| Ghost tenant | missing | running | exist | exist |

### Diagnosis — compare all planes

```bash
SLUG=<tenant_slug>
SAFE_SLUG=$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | cut -c1-28)

echo "=== Postgres ==="
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "SELECT slug, status, plan_slug FROM tenants WHERE slug = '${SLUG}';"
docker exec stockix-postgres-1 psql -U postgres -d stockix_platform \
  -c "SELECT status, internal_port, partial_failure_kind, last_error \
      FROM tenant_deployments \
      WHERE tenant_id = (SELECT id FROM tenants WHERE slug = '${SLUG}');"

echo "=== Docker ==="
docker ps -a --filter "name=stockix-${SLUG}" --format "table {{.Names}}\t{{.Status}}"

echo "=== MySQL ==="
docker exec -e MYSQL_PWD="$SHARED_MYSQL_ROOT_PASSWORD" \
  stockix-shared-stockix-mysql-1 \
  mysql -uroot -e "SHOW DATABASES LIKE 'stockix_${SAFE_SLUG}%';"

echo "=== MongoDB ==="
docker exec stockix-shared-stockix-mongo-1 \
  mongosh --quiet --eval \
  "db.getSiblingDB('${SLUG}_pos').runCommand({dbStats:1}).ok" 2>/dev/null || echo "not found"

echo "=== Traefik ==="
ls -la "${TRAEFIK_DYNAMIC_DIR}/tenant-${SLUG}.yml" \
       "${TRAEFIK_DYNAMIC_DIR}/tenant-pos-${SLUG}.yml" 2>/dev/null || echo "none"

echo "=== Tenant env ==="
ls "${TENANT_ENV_ROOT}/${SLUG}/.env" 2>/dev/null || echo "none"

echo "=== Orphan audit ==="
npx tsx /opt/stockix/stockixnew/infra/worker-service/scripts/audit-orphan-dbs.ts
```

### Recovery matrix

| Postgres status | Containers | Action |
|-----------------|------------|--------|
| `failed` / `partial` | any | Retry via API with `retryModules` first |
| `failed` | down | Manual cleanup then delete Postgres row (M2 steps) |
| `active` | down | Restart: `docker compose -p stockix-<slug> up -d` |
| missing | running | Compose down first, then MySQL/Mongo/Redis/Traefik cleanup (M2 manual steps) |
| `partial` (wire_failed) | up | API retry with `retryModules: ["wire"]` |
| `partial` (pos_failed) | Finance up | API retry with `retryModules: ["pos"]` |

### Retry via API

Dashboard session auth works the same as `PLATFORM_API_SECRET` bearer.

```bash
# Retry POS only
curl -X POST "https://api.${ROOT_DOMAIN}/tenants/${TENANT_ID}/retry-provision" \
  -H "Authorization: Bearer $PLATFORM_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"retryModules": ["pos"]}'

# Retry wire only
curl -X POST "https://api.${ROOT_DOMAIN}/tenants/${TENANT_ID}/retry-provision" \
  -H "Authorization: Bearer $PLATFORM_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"retryModules": ["wire"]}'
```

### Prevention

- Lifecycle advisory lock (`withTenantLifecycleAdvisoryLock`) prevents concurrent operations on same tenant
- Journal `hasOp`/`markOp` allows retry from last checkpoint
- `audit-orphan-dbs.ts` run weekly as cron to detect ghosts early (checks `stockix_*_finance` and `stockix_*_system`; `_finance` is included in automated deprovision cleanup)

## Monitoring

`docker compose ps` reports `healthy` / `unhealthy` for `api-bullmq`, `db-backup`, `prometheus`, and `grafana`. If `db-backup` is `unhealthy`, the cron daemon is not running and backups are not scheduled. Grafana: `https://grafana.${ROOT_DOMAIN}` (see `GRAFANA_ADMIN_PASSWORD` in `.env`).

---

## M6 — Runtime asset restore

`backup-runtime.sh` (cron at `:05` after shared backup) uploads three artifact classes to B2:

| Prefix | Contents | Restore notes |
|--------|----------|---------------|
| `redis/` | Shared tenant Redis RDB (`BGSAVE` + `docker cp`) | Stop Redis, replace `/data/dump.rdb`, restart |
| `traefik/` | Tar of `TRAEFIK_DYNAMIC_DIR` | Extract to host path, reload Traefik |
| `tenant-envs/` | GPG-encrypted tar of `TENANT_ENV_ROOT` | `gpg --decrypt` with `BACKUP_ENCRYPTION_KEY`, extract to host |

Manual run on production host:

```bash
cd /opt/stockix/stockixnew/infra/prod
. ../../scripts/load-env-file.sh .env
bash backup/backup-runtime.sh
```

Verify B2 objects:

```bash
aws --endpoint-url "$BACKUP_B2_ENDPOINT" s3 ls "s3://${BACKUP_B2_BUCKET}/${BACKUP_B2_PREFIX}/redis/"
aws --endpoint-url "$BACKUP_B2_ENDPOINT" s3 ls "s3://${BACKUP_B2_BUCKET}/${BACKUP_B2_PREFIX}/traefik/"
aws --endpoint-url "$BACKUP_B2_ENDPOINT" s3 ls "s3://${BACKUP_B2_BUCKET}/${BACKUP_B2_PREFIX}/tenant-envs/"
```

Decrypt tenant env archive (requires `BACKUP_ENCRYPTION_KEY`):

```bash
gpg --decrypt --batch --passphrase "$BACKUP_ENCRYPTION_KEY" tenant_envs_YYYYMMDD_HHMMSS.tar.gz.gpg \
  | tar -xzf - -C /opt/stockix/tenants
```
