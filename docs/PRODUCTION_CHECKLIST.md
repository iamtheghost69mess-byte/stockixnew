# Production Deployment Checklist

Run through this in order before going live.

---

## Pre-Deploy

- [ ] `pnpm docker:prebuild` (builds all tenant images)
- [ ] `pnpm docker:check` (verify all 4 Finance images exist)
- [ ] `pnpm db:migrate` (run on production Postgres)
- [ ] Finance: `pnpm cli:system:migrate:latest` + `pnpm cli:tenants:migrate:latest` on prod MariaDB
- [ ] All env vars set in `infra/prod/.env` (see [ENV_REFERENCE.md](./ENV_REFERENCE.md))
- [ ] `pnpm env:sync-prod --confirm-server` on deploy host
- [ ] `PROVISION_MODULE_GATING=1`
- [ ] `AUTH_TOKEN_SECRET` identical in root + POS + PMS tenant stacks
- [ ] `INTERNAL_API_SECRET` set (≠ `WORKER_SECRET` in prod); matches each tenant Finance `.env`
- [ ] `POS_PLATFORM_API_KEY` set (min 10 chars)
- [ ] `PLATFORM_API_SECRET`, `WORKER_SECRET`, `SESSION_SECRET`, `DEPLOYMENT_SECRET_KEY`, `LICENSE_SIGNING_SECRET` rotated for prod
- [ ] `CF_DNS_API_TOKEN` set (Cloudflare DNS for Traefik ACME)
- [ ] `MAIL_PASSWORD` set (Resend API key, starts with `re_`)
- [ ] `MAIL_FROM_ADDRESS` on verified Resend domain
- [ ] `CHATWOOT_SECRET_KEY_BASE` set (`openssl rand -hex 64`)
- [ ] `CHATWOOT_DB_PASSWORD` set
- [ ] `S3_*` set if tenant file uploads enabled
- [ ] `WORKER_JOB_EXECUTION_TIMEOUT_MS=2700000` in prod env
- [ ] `pnpm infra:worker:build` after worker changes; redeploy worker container
- [ ] `cd infra/prod && docker compose --env-file .env config` — no errors
- [ ] `cd infra/prod && docker compose --env-file .env up -d --build`
- [ ] Secret rotation completed per [SECRET_ROTATION_RUNBOOK.md](./SECRET_ROTATION_RUNBOOK.md) (set date in `infra/prod/OPERATIONS.md`)
- [ ] `CONTROL_PLANE_REDIS_URL=redis://control-plane-redis:6379/0` in `infra/prod/.env`
- [ ] `DB_POOL_MAX` and related `DB_*` pool vars set (required in production by `@repo/config`)
- [ ] `BACKUP_S3_BUCKET` + `BACKUP_AWS_*` for `db-backup` sidecar
- [ ] `RESEND_WEBHOOK_SECRET`, `SENTRY_DSN` set for production

## Scale-first control plane (2+ API replicas)

Compose runs **`api` × 2** (`RUN_BULLMQ_CONSUMERS=false`) and **`api-bullmq` × 1** (`RUN_BULLMQ_CONSUMERS=true`). Do not enable BullMQ on scaled `api` replicas.

- [ ] `docker compose ps` shows 2 `api` and 1 `api-bullmq` healthy
- [ ] `GET https://api.${ROOT_DOMAIN}/ready` → `ready: true`, `database: ok`, `redis: ok`
- [ ] `bash scripts/prod-scale-smoke.sh` passes on the deploy host
- [ ] Rate limits shared across replicas (optional: exceed `/auth/*` limit from one IP — 429 on repeat requests)

## Docker Images Required

| Image | Built from |
|-------|------------|
| `stockix-webapp:local` | `services/stockix-finance/packages/webapp/Dockerfile` |
| `stockix-server:local` | `services/stockix-finance/packages/server/Dockerfile` (target: `app`) |
| `stockix-database-migration:local` | `services/stockix-finance/packages/server/Dockerfile` (target: `migration`) |
| `stockix-nginx:local` | `services/stockix-finance/docker/nginx/` |

## First Provision Test

- [ ] Provision accounting-only tenant → Finance accessible at `{slug}.{ROOT_DOMAIN}`
- [ ] Provision pos-only tenant → POS accessible (no Finance stack when gating on)
- [ ] Provision accounting+pos tenant → both accessible
- [ ] `finance_tenant_id` set on `tenant_deployments`
- [ ] `pos_organization_id` and `pos_url` set when POS module selected
- [ ] IntegrationConfig auto-wired for accounting+pos
- [ ] Bootstrap password captured or impersonate works
- [ ] Admin changes Finance password after first login

## Email

- [ ] Test email sends from control plane (owner invite or welcome)
- [ ] Finance password reset sends (tenant SMTP)
- [ ] License expiry warning email sends
- [ ] Resend dashboard shows delivery

## License

- [ ] Plan limits enforced in Finance (`maxOrganizations`, users)
- [ ] License sync working after provision (`tenant_licenses` in Finance)
- [ ] Suspended license → HTTP 402 on Finance API
- [ ] Revoke propagates to Finance within cache window (~60s)

## Branch Protection Status

| Item | Status | Date | By |
|------|--------|------|----|
| Branch protection rule on `main` | ☐ PENDING — configure in GitHub UI |  |  |
| Required status checks configured | ☐ PENDING — `Quality gate`, `Gitleaks` |  |  |
| Admin bypass disabled | ☐ PENDING |  |  |
| CODEOWNERS file added | ✅ Done | 2026-05-27 |  |
| Production environment in GitHub | ☐ PENDING — see [BRANCH_PROTECTION_SETUP.md](./BRANCH_PROTECTION_SETUP.md) |  |  |

## Integration (accounting + pos)

- [ ] `pos-bigcapital-worker` running in POS tenant compose
- [ ] Map at least one menu item to Finance item
- [ ] Paid order → `accountingSaleStatus: ok` + Finance receipt
- [ ] Reverse order → Finance receipt voided

## Monitoring

- [ ] `PROVISION_MODULE_GATING=1` confirmed in prod env
- [ ] Worker processing jobs (`tenant.provision` completes)
- [ ] Traefik routing Finance (`{slug}.{domain}`) and POS (`{slug}-pos.{domain}`)
- [ ] API `GET /health` → `{"status":"ok"}`
- [ ] API `GET /ready` → `ready: true` with `database` + `redis` ok
- [ ] Postgres, api, api-bullmq, dashboard, traefik healthchecks passing

## Type / Test Gate (pre-merge baseline)

```bash
pnpm --filter @repo/auth check-types
pnpm --filter api check-types
pnpm --filter dashboard check-types
pnpm --filter @stockix/pms check-types
pnpm --filter api test
```

## Post-Deploy Smoke

- [ ] `bash scripts/prod-scale-smoke.sh` (automated `/ready`, `/health`, replica counts)
- [ ] Dashboard login + MFA if enabled
- [ ] Create tenant via wizard with module selection
- [ ] Finance users CRUD from tenant detail
- [ ] POS organizations visible via dashboard `/pos/*` proxy (if POS enabled)
- [ ] Chatwoot account id set for tenant with `chat` module

---

**Full references:** [ENV_REFERENCE.md](./ENV_REFERENCE.md) · [PROVISIONING_REFERENCE.md](./PROVISIONING_REFERENCE.md) · [INTEGRATION_REFERENCE.md](./INTEGRATION_REFERENCE.md) · [PLATFORM_REFERENCE.md](./PLATFORM_REFERENCE.md)
