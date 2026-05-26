# Section 4 — POS + Accounting integration E2E checklist

Run on **staging** after Phases 0–3 code is deployed (`pos-bigcapital-worker`, Finance internal APIs, control-plane `organization.provision`).

Automated smoke (local, MongoDB required):

```bash
cd services/posnew/apps/pos-backend
npm run test:accounting-integration
```

**Signed off:** __________ **Date:** __________

---

## Phase 0 — Wire, health, combined org guard

- [ ] Provision `modules: ["pos","accounting"]`; tenant reaches `active`, integration `bigcapitalIntegrationEnabled: true`
- [ ] `GET /api/platform/v1/organizations/:posOrgId/integration/bigcapital/health` → healthy
- [ ] Re-run provision resume: unhealthy wire is re-applied (`verify-pos-bigcapital-integration`)
- [ ] On combined stack, ad-hoc `POST /api/platform/v1/organizations` (no `stockix-provision-*` key) → **409** `COMBINED_ORG_REQUIRES_CONTROL_PLANE`

## Phase 1 — Sales bridge (outbox + receipts)

- [ ] Pay order with **all** sellable lines mapped → Finance receipt `referenceNo` = order id; POS `accountingSaleStatus: ok`
- [ ] Pay order with **one unmapped** sellable line → **no** partial receipt; backoffice unmapped notification; `accountingSaleStatus: failed`
- [ ] Full refund / void → Finance receipt deleted (`void_receipt`)
- [ ] Partial refund &lt; total → Finance credit note (`partial_refund`)
- [ ] Split tender (cash + card) → receipt + deposit split journals
- [ ] Stop Redis → outbox row `pending`; restart worker → drain completes

## Phase 2 — Multi-org (control plane)

- [ ] Primary org: one POS org + one Finance tenant (existing provision)
- [ ] `POST /tenants/:tenantId/organizations` (secondary, `isPrimary: false`) → new Finance sub-org + new POS org + `posOrganizationId` on control-plane row
- [ ] Each POS org has distinct `financeTenantId` on `IntegrationConfig`
- [ ] Secondary org orders sync only to **its** Finance tenant

## Phase 3 — Stock → accounting

- [ ] Map ingredients + vendor (or `defaultVendorId` on wire)
- [ ] Confirm GRN → Finance bill `referenceNo` `pos-grn-{grnId}`; no duplicate on retry
- [ ] Inventory adjust (waste) → variance journal
- [ ] Post stock take → variance journal `pos-stocktake-{sessionId}`
- [ ] Paid order with recipe → Finance COGS uses recipe-based `costPrice` (check item before receipt)

## Phase 4 — Ops APIs & mapping coverage

- [ ] `GET /api/integration/events` lists six event types
- [ ] `GET /api/integration/mapping-coverage` → `bridgeReady: true` when mappings complete
- [ ] `GET /api/integration/outbox` shows recent rows with `originatedBy`
- [ ] Failed row: `POST /api/integration/outbox/:id/retry` re-queues

## Phase 5 — Operator UI & owner visibility

- [ ] POS Studio → **Accounting → Finance bridge** (`/dashboard/accounting/finance-integration`): map menu item, ingredient, vendor; coverage cards update
- [ ] Unmapped sellable line blocks paid receipt (default); after mapping, pay succeeds
- [ ] Outbox tab: failed row **Retry** re-queues job
- [ ] Owner dashboard → tenant detail → **Bridge readiness** shows wire health + sales/inventory counts (`GET /api/tenants/:id/integration/bridge-summary`)
- [ ] Platform API: `GET /api/platform/v1/organizations/:posOrgId/integration/bridge-summary` (same payload as control-plane proxy)

## Sign-off

- [ ] [missing_for3.md](../missing_for3.md) §4 rows updated
- [ ] [INTEGRATION_REFERENCE.md](./INTEGRATION_REFERENCE.md) “Live E2E” marked run with date
