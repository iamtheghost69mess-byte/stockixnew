# Staging verification checklist

Run after deploy with live finance stack, worker, and Stockix API.

**Local/dev verification (2026-05-20):** migrations applied, worker rebuilt (`pnpm infra:worker:build`), `apps/api` 91 tests + finance server 21 Jest specs pass. Live staging items below still require operator sign-off on the target environment.

## Migrations (Phase 0)

- [x] `pnpm db:migrate` on Stockix Postgres (dev/local)
- [x] `pnpm cli:system:migrate:latest` on finance MariaDB (dev/local)
- [x] `pnpm cli:tenants:migrate:latest` on finance (dev/local — all tenants migrated)
- [ ] Repeat on **staging/prod** before cutover

## Worker (Phase 0)

- [x] `pnpm infra:worker:build` (bundle at `infra/worker-service/.runtime/worker.js`)
- [x] `buildTenantSignupEnv()` writes only `SIGNUP_DISABLED=true` (unit test `apps/api/tests/tenant-signup-env.test.ts`)
- [ ] Redeploy worker on **staging/prod**

## Signup & provision

- [ ] `POST /api/auth/register` with signup disabled → **403** (live)
- [ ] `/auth/register` redirects to login when disabled (live)
- [ ] `POST /api/internal/provision-user` with `x-internal-secret` creates user (live)

## Setup wizard

- [x] Congrats step removed; `/setup` redirects to `/setup/complete` when org ready + profile incomplete
- [ ] Dashboard blocked until `POST /api/organization/setup/complete` (live)
- [ ] `setup_completed_at` set in DB (live)

## License

- [ ] License `suspended` → **402** on all API methods (live)
- [ ] Expired past grace → **402** all; within grace → GET OK, mutations **402** (live)
- [ ] Stockix license assign/extend/revoke updates `tenant_licenses` (live)
- [ ] UI: suspended overlay, grace banner, gated invoice/bill/expense actions (live)

## Owner dashboard users (Phase 1)

- [ ] Tenant detail → **Finance users** card lists users (live)
- [ ] Create / edit / suspend / activate / reset password / delete work via UI (live)
- [x] `read_only` / `support_agent` RBAC covered in `apps/api/tests/finance-users-http.test.ts`

## Org switcher & sub-org

- [ ] Switch tenant reloads app; org number subtitle shown (live)
- [ ] Sub-org provision copies COA + tax + remapped `settings` account pointers (live)
- [x] `CopyParentTenantSettings.service.spec.ts` — settings remap + `onConflict` paths

## Billing

- [x] Subscription endpoints return **501** when billing disabled (code)
- [x] No LemonSqueezy step in setup wizard (code)
