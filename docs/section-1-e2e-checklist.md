# Section 1.1–1.4 — Manual E2E checklist

Run after each phase’s automated tests pass. Do not start the next phase until all boxes for the current phase are checked.

## Phase 0 — Baseline

- [ ] Migration `packages/db/drizzle/0044_platform_roles.sql` applied on target DB
- [ ] `pnpm vitest run` in `apps/api` (rbac, password-reset-mail-status, license-suspend, license-expiry-*, org-access-scope) — all green
- [ ] Super admin: Settings → Platform roles loads
- [ ] Invite dialog lists roles from API (not only four hardcoded labels)
- [ ] `read_only` user: no **Add tenant** button

**Signed off:** __________ **Date:** __________

## Phase 1 — §1.1 Auth & access

- [ ] Support agent with org scope: tenant list shows only assigned tenants
- [ ] Direct URL to out-of-scope tenant → 404 or forbidden
- [ ] Invite with mail off: audit `invite.email_failed` + copy-link + **Resend invite**
- [ ] Invite with Redis + mail on: API returns `emailQueued`; `owner-invite` row in Email logs after worker runs
- [ ] Custom role with only `licenses.read` cannot suspend a license

**Signed off:** __________ **Date:** __________

## Phase 2 — §1.2 Tenant details

- [ ] Tenant list: **Created**, **Provisioned**, **Expires** columns correct
- [ ] **Partial** filter shows only `tenants.status = partial`
- [ ] Tenant profile: Suspend/Reactivate license from license panel

**Signed off:** __________ **Date:** __________

## Phase 3 — §1.3 Licenses & STXI

- [ ] Generate **Platform + Accounting** preset works
- [ ] New STXI key for tenant+location; POS login OK at matching location
- [ ] Wrong location / bad checksum → login blocked
- [ ] Legacy STKX still works before `LICENSE_ACCEPT_STKX_UNTIL`
- [ ] Suspend from tenant panel blocks POS; Finance sync verified in staging

**Signed off:** __________ **Date:** __________

## Phase 4 — §1.4 Expiry & BullMQ

- [ ] License 7 days to expiry: one tenant email + one owner email + one bell per milestone
- [ ] BullMQ job id `licenseId:milestone` runs once (no duplicate sends)
- [ ] After expiry + grace: tenant suspended in list; POS blocked
- [ ] Logs contain `license_expiry_milestone_fired`

**Signed off:** __________ **Date:** __________
