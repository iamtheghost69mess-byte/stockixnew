# Production checklist — multi-product platform

## Control plane

- [ ] `packages/auth` deployed; `AUTH_TOKEN_SECRET` shared with POS/PMS tenant stacks
- [ ] Postgres migrations through `0030_chatwoot_account_id.sql` applied
- [ ] Owner dashboard at `apps/dashboard`; API at `apps/api`
- [ ] Tenant provision form persists `modules` JSON on tenants and job payload

## Finance (default)

- [ ] `modules` includes `accounting` (default) — existing `infra/tenant-stack` provision unchanged
- [ ] `PROVISION_MODULE_GATING` unset or `0` until non-Finance tenants are tested

## POS

- [ ] `POS_PLATFORM_BASE_URL` and `POS_PLATFORM_API_KEY` set on control-plane API
- [ ] POS sections in dashboard load via `/api/pos/*` proxy
- [ ] POS backend validates Stockix JWT with `pos` module (`@repo/auth`)
- [ ] `saas-dash` removed; operators use main dashboard only

## PMS

- [ ] `PMS_BASE_URL` / `PMS_PORT=3003` for API proxy and service
- [ ] `@stockix/pms` service running with `DATABASE_URL`
- [ ] iCal sync interval active (10 minutes)
- [ ] Dashboard PMS pages use `tenantId` query when proxying

## Chatwoot

- [ ] Shared `chatwoot` stack in `infra/prod/docker-compose.yml`
- [ ] `CHATWOOT_*` env vars set
- [ ] Tenants with `chat` module receive `chatwoot_account_id` after provision

## Module-gated provisioning (optional)

- [ ] Set `PROVISION_MODULE_GATING=1` only after validating:
  - `accounting` only → Finance stack only
  - `pos` only → POS stack (`infra/pos-tenant-stack`)
  - `pms` only → PMS stack (`infra/pms-tenant-stack`)

## Verification commands

```bash
pnpm --filter @repo/auth check-types
pnpm --filter api check-types
pnpm --filter dashboard check-types
pnpm --filter @stockix/pms check-types
pnpm --filter api test
pnpm db:migrate
```
