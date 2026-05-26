# Section 2.1 — POS provisioning manual E2E checklist

Run after each phase’s automated tests pass. Do not start the next phase until all boxes for the current phase are checked.

## Phase 0 — `readyForPinLogin` baseline

- [ ] `pnpm vitest run apps/api/tests/bootstrap-pos-org.test.ts` — all green
- [ ] `pnpm --filter pos-backend test -- organization-provisioning-status` — all green
- [ ] Provision tenant `modules: ["pos","accounting"]`; poll POS `GET .../provisioning-status` until `readyForPinLogin: true`
- [ ] Admin PIN login on POS succeeds before leaving provision flow

**Signed off:** __________ **Date:** __________

## Phase 1 — Bootstrap PIN capture (peek/consume)

- [ ] New tenant provision shows **POS staff PINs** block in dashboard (all bootstrap roles)
- [ ] Job completes; encrypted `pos_bootstrap_pins` event in provision trace
- [ ] Re-polling `provisioning-status` does not erase PINs before worker finishes (peek, not consume-on-read)
- [ ] Worker calls `POST .../provisioning-credentials/consume` after persisting secrets

**Signed off:** __________ **Date:** __________

## Phase 2 — Staff PINs UX

- [ ] Tenant detail → **View staff PINs** shows masked rows (not empty “no roles”)
- [ ] Alert explains bootstrap PINs are not stored in plaintext
- [ ] **Reset PIN** for one role returns plaintext once; copy works

**Signed off:** __________ **Date:** __________

## Phase 3 — POS-only entitlements

- [ ] Provision `modules: ["pos"]` only
- [ ] POS org `entitlements.modules.accounting` is false; inventory true
- [ ] Accounting-only backoffice routes blocked for POS-only tenant

**Signed off:** __________ **Date:** __________

## Phase 4 — `defaultCredentials` drift

- [ ] `POST .../repair-credentials` rebuilds masked rows from bootstrap users (no invented PINs)
- [ ] Reset PIN updates User + `defaultCredentials` masked row

**Signed off:** __________ **Date:** __________

## Phase 5 — Sign-off

- [ ] [missing_for3.md](../missing_for3.md) §2.1 rows updated with test refs and dates
- [ ] [PROVISIONING_REFERENCE.md](./PROVISIONING_REFERENCE.md) links this checklist

**Signed off:** __________ **Date:** __________
