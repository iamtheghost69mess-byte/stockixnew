# Production operations — control plane

Reference for `infra/prod` deploys. Secrets live in `infra/prod/.env` (gitignored). After editing, sync and redeploy:

```bash
pnpm env:sync-prod          # copies infra/prod/.env → repo root .env (worker fallback)
cd infra/prod
docker compose --env-file .env up -d --build api infra-worker control-plane-redis
```

## Section 1 database migrations (0044–0046)

These SQL files are **not** in the Drizzle journal yet. Apply once per environment after backup.

| Order | File | Purpose |
|-------|------|---------|
| 1 | `packages/db/drizzle/0044_platform_roles.sql` | `platform_roles`, `owners.role_id`, seed system roles |
| 2 | `packages/db/drizzle/0045_tenants_org_scope_permission.sql` | `tenants.org_scope` on support_agent |
| 3 | `packages/db/drizzle/0046_stxi_license.sql` | `licenses.key_format`, `scoped_location_id` |

**On the server** (compose project name `stockix`):

```bash
cd /opt/stockix/stockixnew
pnpm --filter @repo/db db:migrate:section1
```

Or via Postgres container:

```bash
docker exec -i stockix-postgres-1 psql -U postgres -d stockix_platform \
  < packages/db/drizzle/0044_platform_roles.sql
# repeat for 0045 and 0046
```

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

## License expiry queue (BullMQ)

- Redis service: `control-plane-redis` (internal Docker network only).
- API logs on start: `License expiry BullMQ worker started` when `CONTROL_PLANE_REDIS_URL` is set.
- Milestone log line: `license_expiry_milestone_fired`.
- If Redis is down or URL unset, milestones still run **inline** in the worker scan (degraded but functional).

## Rollout checklist

1. Backup Postgres (`stockix_platform`).
2. Apply migrations 0044 → 0045 → 0046.
3. Set `CONTROL_PLANE_REDIS_URL` in `infra/prod/.env`.
4. Deploy `control-plane-redis`, `api`, `infra-worker`.
5. Confirm API health and one test milestone (staging license) if possible.
6. Propagate `LICENSE_SIGNING_SECRET` to POS tenant envs before issuing new STXI keys.
