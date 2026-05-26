# Staging verification — SaaS provision repair

Use after deploying worker (`pnpm infra:worker:build`), API, dashboard, and Finance server. Run Finance system migration for `must_change_password` before sign-in tests.

## Smoke tests

| Check | Steps | Pass |
|-------|--------|------|
| Provision tenant | Create tenant with accounting module; wait until deployment `active` | [ ] |
| `financeTenantId` | Tenant detail → Finance↔POS integration shows numeric Finance tenant ID | [ ] |
| Bootstrap password | Tenant detail → **Bootstrap access** card shows password within ~15 min; copy works | [ ] |
| Finance login | Sign in at Finance URL with admin email + bootstrap password | [ ] |
| Force password change | After bootstrap login, redirected to `/auth/change-password`; new password works | [ ] |
| Impersonate | Super admin → Impersonate; Finance loads without refresh loop; session ~24h | [ ] |
| Owner invite | Stockix owner invite → email received; accept link works | [ ] |
| Finance user invite | Tenant detail → Finance users → **Invite user**; invitation email received | [ ] |
| Repair Finance link | Legacy tenant with null `financeTenantId` → **Repair Finance link** → ID populated | [ ] |
| Provisioning poll cap | Stuck `provisioning` >45 min → banner with Refresh / Stop (no infinite poll) | [ ] |
| License suspended | Suspend license → Finance API returns 402; grace unchanged | [ ] |

## Operator runbook (quick)

1. **Bootstrap password** — Deterministic per tenant slug (`DEPLOYMENT_SECRET_KEY`); shown in dashboard ~15 minutes after provision on list wizard and tenant detail **Bootstrap access** card. Not single-use in Finance DB; users must change it (forced on first login).
2. **Impersonate** — Super admin only; control plane signs in with bootstrap password and redirects browser to Finance `/auth/impersonate?t=…`.
3. **Repair Finance link** — Tenant detail (integration card) or Finance users panel when `financeTenantId` is missing; calls `POST /tenants/:id/repair-finance-link`.
4. **Invite users** — Prefer **Invite user** (email) on Finance users panel; **Set password directly** is break-glass only.
5. **Stuck provisioning** — Check `tenant_lifecycle_jobs`, worker logs, `tenant_deployments.status`. If job `completed` and stack healthy, fix status operationally; do not leave dashboard polling indefinitely (45 min cap).

## Commands

```bash
pnpm db:migrate
cd apps/api && npx tsc --noEmit && pnpm test
cd apps/dashboard && npx tsc --noEmit
cd services/stockix-finance/packages/server && npx tsc --noEmit && pnpm test
cd infra/worker-service && npx tsc --noEmit
```

## Mail (ops)

- `GET /health` returns `mail.configured: true` when `MAIL_PASSWORD` and `MAIL_FROM_ADDRESS` are set.
- Dashboard shows a warning banner for super admins when mail is not configured.
- Confirm `MAIL_FROM_ADDRESS` domain verified in Resend (control plane and tenant `.env` after provision).
- Tenant stack should include `MAIL_HOST`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` from worker `tenant-env.ts`.
- Owner forgot-password sends email (not console-only).
- `POST /owners/:id/resend-invite` for pending owners.
- Optional: configure `RESEND_WEBHOOK_SECRET` and point Resend webhooks to `POST /webhooks/resend`.
