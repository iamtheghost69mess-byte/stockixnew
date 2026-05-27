# Production operations — control plane

# SECRETS ROTATED: _pending_ — replace date after git-history rotation (see [docs/SECRET_ROTATION_RUNBOOK.md](../../docs/SECRET_ROTATION_RUNBOOK.md))

Reference for `infra/prod` deploys. Secrets live in `infra/prod/.env` (gitignored). After editing, sync and redeploy:

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

## Horizontal API scaling (2+ replicas)

| Service | Replicas | `RUN_BULLMQ_CONSUMERS` | Traefik |
|---------|----------|------------------------|---------|
| `api` | 2 (`deploy.replicas`) | `false` | yes — `api.${ROOT_DOMAIN}` |
| `api-bullmq` | 1 | `true` | no — internal only |

Post-deploy smoke (from repo root on server):

```bash
bash scripts/prod-scale-smoke.sh
```

## Database migrations

All migrations in `packages/db/drizzle/meta/_journal.json` (including 0044–0046 and `0050_tenant_public_discovery_slug`) apply via:

```bash
cd /opt/stockix/stockixnew
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db exec tsx scripts/verify-schema.ts
```

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

## Redis (mandatory in production)

`CONTROL_PLANE_REDIS_URL` is **required**. The API exits on startup if unset in production.
Rate limits and BullMQ are not safe across multiple API replicas without shared Redis.

Prod compose runs **`api`** (2 replicas, `RUN_BULLMQ_CONSUMERS=false`) and **`api-bullmq`** (1 replica, `RUN_BULLMQ_CONSUMERS=true`). Do not set `RUN_BULLMQ_CONSUMERS=true` on scaled `api` replicas.

## Docker socket-proxy

Worker Docker access is restricted via `socket-proxy` (`BUILD=0` — images must be pre-built).
Any new Docker API verb requires an explicit proxy env change and security review.

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

## Database backup and restore

Automated backups: `db-backup` service runs `infra/prod/backup/backup.sh` daily (02:00 cron) to S3.

Required env: `BACKUP_S3_BUCKET`, `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY`.

**Restore:**

```bash
aws s3 cp s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/<backup-file>.dump.gz /tmp/restore.dump.gz
gunzip /tmp/restore.dump.gz
docker exec -i stockix-postgres-1 pg_restore -U postgres -d stockix_platform --clean --if-exists < /tmp/restore.dump
```

## Rollout checklist

1. Backup Postgres (`stockix_platform`) or confirm S3 backup job healthy.
2. Apply migrations 0044 → 0045 → 0046.
3. Set `CONTROL_PLANE_REDIS_URL` in `infra/prod/.env`.
4. Deploy `control-plane-redis`, `api`, `infra-worker`.
5. Confirm API health and one test milestone (staging license) if possible.
6. Propagate `LICENSE_SIGNING_SECRET` to POS tenant envs before issuing new STXI keys.
