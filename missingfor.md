# Full POS + Accounting Integration Audit

**Date:** 2026-05-23  
**Mode:** Read-only (no files modified except this report)  
**Scope:** Stockix control-plane provisioning, POS ↔ Bigcapital (stockix-finance) bridge, Traefik, env vars

---

## Executive Summary

| Layer | Status |
|-------|--------|
| **License / schema** (`modules: ["accounting","pos"]`) | ✅ Implemented |
| **Provisioner** (dual Docker stacks + Finance bootstrap + POS org bootstrap) | ✅ Mostly implemented |
| **Post-provision wiring** (`IntegrationConfig`, native GL off, item maps) | ❌ **Not automated** |
| **Runtime bridge** (BullMQ → internal sale receipt API) | ✅ Implemented in code |
| **Bridge operational without manual setup** | ❌ Requires operator config + separate worker process |

**Verdict:** The **async bridge code exists and is wired**, but **provisioning does not complete the integration**. After `accounting + pos` provision, an operator must still enable Bigcapital in POS, set `internalBaseUrl` / `internalSecret` / `financeTenantId`, create item mappings, and run `npm run worker:bigcapital`. Native GL suppression is implemented but only activates when `bigcapital.enabled` is set via the integration API (not by the provisioner).

---

## Phase 1 — Provisioning Layer Audit

### 1.1 Tenant module schema

**Exists.** `tenants.modules` is a JSON text column defaulting to `["accounting"]`.

```64:65:packages/db/src/schema.ts
    /** JSON array of licensed product modules, e.g. ["accounting","pos"]. */
    modules: text("modules").notNull().default('["accounting"]'),
```

Related deployment columns for cross-stack IDs:

```168:179:packages/db/src/schema.ts
    financeTenantId: integer("finance_tenant_id"),
    financeDefaultWarehouseId: integer("finance_default_warehouse_id"),
    financeWalkInCustomerId: integer("finance_walk_in_customer_id"),
    financeCashAccountId: integer("finance_cash_account_id"),
    financeCardAccountId: integer("finance_card_account_id"),
    posOrganizationId: text("pos_organization_id"),
    posUrl: text("pos_url"),
```

**Note:** These Finance IDs are stored on **Postgres `tenant_deployments`**, not pushed into POS Mongo `IntegrationConfig` during provision.

---

### 1.2 Provision job logic

**Job system:** `tenant.provision` jobs live in Postgres `tenant_lifecycle_jobs` (not BullMQ). The **infra worker** (`infra/worker-service`) polls `POST /internal/jobs/claim` and runs `executeProvisionRuntime` via `TenantProvisionService`.

**Module gating:** `PROVISION_MODULE_GATING=1` → Finance stack only when `accounting` ∈ modules; POS when `pos` ∈ modules.

**Step sequence when `modules = ["accounting", "pos"]`:**

| Step | Operation key / action | Implemented? |
|------|------------------------|--------------|
| 1 | Preflight / insert `tenants` + `tenant_deployments` | ✅ |
| 2 | Write tenant `.env`, `docker compose up` data services (mysql, mongo, redis) | ✅ |
| 3 | `database_migration` compose run | ✅ |
| 4 | `docker compose up` webapp, server, nginx (Finance) | ✅ |
| 5 | Health check `/api/ping` on internal Finance URL | ✅ |
| 6 | `tenant.bootstrap_admin` → `POST /api/internal/provision-user` | ✅ |
| 7 | `tenant.build_organization` → org build job poll | ✅ |
| 8 | `tenant.activate_warehouses` → `POST /api/internal/tenants/:id/activate-warehouses` | ✅ **only if `hasAccountingAndPos`** |
| 9 | `tenant.seed_pos_defaults` → `POST /api/internal/tenants/:id/seed-pos-defaults` | ✅ **only if `hasAccountingAndPos`** |
| 10 | `edge.publish` → Finance Traefik `{slug}.{domain}` | ✅ |
| 11 | `syncFinanceLicense` on Finance tenant | ✅ |
| 12 | `provisionPosStack` → `docker compose` `stockix-pos-{slug}` | ✅ |
| 13 | `bootstrapPosOrganization` → `POST /api/platform/v1/organizations` + poll `provisioning-status` | ✅ |
| 14 | `writePosTraefikConfig` → `{slug}-pos` / `{slug}-pos-api` | ✅ |
| 15 | Persist `pos_organization_id`, `pos_url` on `tenant_deployments` | ✅ |
| 16 | Job complete → API stores `finance_tenant_id`, walk-in/deposit IDs, `organizations.finance_organization_id` | ✅ (when worker returns IDs) |

**POS step runs after Finance** (see `provision-runtime.ts` ~1058).

**Partial failure:** If both modules selected and POS fails, tenant → `partial`, Finance deployment stays `active` with `last_error` set.

---

### 1.3 `POS_PLATFORM_API_KEY` validation

**Validated at POS bootstrap time only** (not at job enqueue).

```45:52:infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts
function apiKeyOrThrow(): string {
  const key = posConfig.platformApiKey.trim();
  if (key.length < 10) {
    throw new Error(
      "POS_PLATFORM_API_KEY is required for POS org bootstrap (min 10 characters)",
    );
  }
  return key;
}
```

| Condition | Behavior |
|-----------|----------|
| Empty or &lt; 10 chars | `bootstrapPosOrganization` throws → `provisionPosStack` fails → combined tenant may be `partial` |
| Valid key | Platform org create + bootstrap poll proceeds |

**Gap:** No preflight check before starting POS Docker build; wasted work if key missing. Repo `.env` currently has `POS_PLATFORM_API_KEY=` empty.

---

### 1.4 Post-provision integration wiring

**Searched:** `infra/worker-service`, `apps/api` — **no code** writes POS `IntegrationConfig` after provision.

| Expected wiring | Done by provisioner? |
|-----------------|----------------------|
| `bigcapital.enabled = true` in Mongo | ❌ **Gap** |
| `financeTenantId` in Mongo | ❌ **Gap** (only on Postgres `tenant_deployments`) |
| `internalBaseUrl` (Finance internal URL) | ❌ **Gap** |
| `internalSecret` (`INTERNAL_API_SECRET`) | ❌ **Gap** |
| `defaultWalkInCustomerId`, deposit account IDs | ❌ **Gap** in Mongo (seeded in **Finance MySQL** only; IDs returned to control plane on job complete, not copied to POS) |
| `defaultWarehouseId` | ❌ **Gap** in Mongo |

**Operator must** use `PUT /api/integration/config` (backoffice) or equivalent dashboard UI.

---

### 1.5 POS native GL flag

**Not set by provisioner.** Suppression is via `AccountingConfig.bigcapitalIntegrationEnabled`, updated when integration config is saved:

```142:147:services/posnew/apps/pos-backend/routes/integrationRoute.js
    if (typeof merged.enabled === "boolean") {
      await ensureDefaultAccountsAndConfig(orgId);
      await AccountingConfig.findOneAndUpdate(
        { organization: orgId },
        { $set: { bigcapitalIntegrationEnabled: merged.enabled } }
      );
```

Native GL skip in ledger posting:

```936:936:services/posnew/apps/pos-backend/services/accountingService.js
  if (cfgDoc.bigcapitalIntegrationEnabled) return null;
```

(same guard at ~854 for COGS ledger)

**Gap:** Until an operator enables integration via API, **POS native GL still runs** on paid orders even if both modules were provisioned.

---

## Phase 2 — Bridge Worker Audit

### Files

| File | Role |
|------|------|
| `services/posnew/apps/pos-backend/services/bigcapitalSyncEnqueue.js` | Enqueue on paid order |
| `services/posnew/apps/pos-backend/services/bigcapitalSyncProcessor.js` | Job processor + HTTP to Finance |
| `services/posnew/apps/pos-backend/workers/bigcapitalSyncWorker.js` | Standalone worker process |
| `services/stockix-finance/.../InternalPos.controller.ts` | Receipt ingress |
| `services/stockix-finance/.../InternalPosReceipts.service.ts` | Creates sale receipt in tenant context |

---

### 2.1 Queue name

**`bigcapital_sync`** (BullMQ), registered in `jobQueue.js` `QUEUE_NAMES`.

---

### 2.2 Trigger

`enqueueBigcapitalSyncIfEnabled(order)` — only if `IntegrationConfig.bigcapital.enabled === true`.

Called from `orderController.js` via `fireBigcapitalSync(order)` (non-blocking `.catch`) at **paid** transitions:

- `addOrder` (immediate paid)
- `patchOrderStatus`
- `syncOfflineOrders`
- `updateOrder` (transaction + non-transaction paths)

**Not** triggered by a Finance webhook; **POS-initiated only**.

---

### 2.3 Job payload

```javascript
{
  orderId: String(order._id),
  organizationId: String(orgId),
}
```

Full order loaded inside processor from Mongo `Order` model. Line items, payment method/splits, location resolved at processing time.

---

### 2.4 Bigcapital API call

POS posts to **Finance internal bridge**, not public `/api/sales-receipts`:

```157:166:services/posnew/apps/pos-backend/services/bigcapitalSyncProcessor.js
  const response = await fetch(`${base}/api/internal/pos/receipts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": cfg.internalSecret || "",
    },
    body: JSON.stringify({
      tenantId: cfg.financeTenantId,
      payload,
    }),
  });
```

Finance `InternalPosReceiptsService.createReceipt` maps payload → `SaleReceiptApplication.createSaleReceipt` (closed receipt).

---

### 2.5 COGS handling

| Aspect | Behavior |
|--------|----------|
| POS processor | Sends `itemId`, `quantity`, `rate` per mapped line; **no explicit cost** in payload |
| POS native COGS | **Skipped** when `bigcapitalIntegrationEnabled` |
| Finance COGS | Relies on Bigcapital item `costPrice` + inventory/COGS rules when receipt is **closed** (`closed: true` in payload) |

**Gap:** No per-line cost override from POS ingredient costing; unmapped or wrong BC item cost → wrong COGS in Finance.

---

### 2.6 Item mapping

**Mongo collection:** `IntegrationItemMapping` (`integrationItemMappingModel.js`)

- Unique index: `(organization, posMenuItemId)`
- Fields: `bigcapitalItemId`, `bigcapitalItemName`, `bigcapitalCostPrice` (optional metadata)

Processor loads mappings for order menu item IDs; **unmapped lines are dropped**; if no mapped lines remain → job returns `{ skipped: true, reason: "No mapped items..." }` **without error**.

---

### 2.7 Error handling

| Mechanism | Details |
|-----------|---------|
| Retries | `attempts: 5`, exponential backoff `10s` on enqueue |
| Failed handler | `onBigcapitalSyncFailed` → sets `IntegrationConfig.bigcapital.syncStatus = "error"`, `lastSyncError`, order `accountingSaleStatus = "failed"` |
| Dead letter | `removeOnFail: 500` (BullMQ retained failed jobs, not a separate DLQ UI) |
| Manual retry | `POST /api/integration/sync/replay/:orderId` |
| Status UI | `GET /api/integration/sync/status` (queue counts + config sync fields) |

**Silent failure mode:** Integration disabled → enqueue no-ops; unmapped items → skip without failing job.

---

### 2.8 Native GL suppression

| Check | Where |
|-------|--------|
| Before enqueue | `cfg?.bigcapital?.enabled` in `bigcapitalSyncEnqueue.js` |
| In processor | Early return if not enabled |
| Before POS journals | `AccountingConfig.bigcapitalIntegrationEnabled` in `postOrderSaleLedger` / `postOrderCogsLedger` |

**Provisioner does not set `enabled`**, so bridge and GL suppression are **off by default** after provision.

---

### 2.9 Separate worker process required

```bash
npm run worker:bigcapital   # services/posnew — bigcapitalSyncWorker.js
```

If Redis down or worker not running: `addJob` may no-op or queue unavailable; **orders stay unsynced with no crash**.

---

## Phase 3 — IntegrationConfig Model Audit

**Exists:** `services/posnew/apps/pos-backend/models/integrationConfigModel.js`

### Schema (`bigcapital` subdocument)

| Field | Type | Purpose |
|-------|------|---------|
| `enabled` | Boolean (default `false`) | Master switch |
| `internalBaseUrl` | String | Finance stack base URL for bridge |
| `internalSecret` | String | `x-internal-secret` for internal API |
| `financeTenantId` | Number | Bigcapital numeric tenant id |
| `defaultWalkInCustomerId` | Number | Required for receipts |
| `defaultCashDepositAccountId` | Number | Payment routing |
| `defaultCardDepositAccountId` | Number | Payment routing |
| `defaultWarehouseId` | Number | Fallback warehouse |
| `locationMapping[]` | posLocationId → branch/warehouse ids | Per-location |
| `lastSyncedAt`, `lastSyncError`, `syncStatus` | Sync telemetry | idle / syncing / error |

**Not in schema:**

- `financeUrl` / `financeApiKey` — **not used**; bridge uses `internalBaseUrl` + `internalSecret`
- Inline `itemMapping` — **separate collection** `IntegrationItemMapping`

---

## Phase 4 — Item Mapping Audit

| Capability | Status |
|------------|--------|
| Mongo collection | ✅ `IntegrationItemMapping` |
| Postgres table | ❌ None |
| CRUD API | ✅ `GET/POST/DELETE /api/integration/item-mappings` (backoffice staff) |
| Auto-seed from POS menu → BC items | ❌ **Gap** |
| Auto-sync job on menu change | ❌ **Gap** |
| Provisioner creates mappings | ❌ **Gap** |

**Impact:** Every sellable menu item needs a **manual** mapping before any receipt line syncs.

---

## Phase 5 — Traefik Routing Audit

**Implementation:** `infra/worker-service/domain/traefik-config.ts`

### Finance

- Host: `` `{slug}.{domain}` ``
- Entry: `websecure`, TLS `certResolver: cloudflare`
- Upstream: `http://{TRAEFIK_TENANT_UPSTREAM_HOST}:{internalPort}`

### POS

- Frontend: `` `{slug}-pos.{domain}` `` → `frontendPort`
- API: `` `{slug}-pos-api.{domain}` `` → `backendPort`
- Same TLS resolver on both routers
- File: `tenant-pos-{slug}.yml` in Traefik dynamic dir

### Gaps

| Issue | Severity |
|-------|----------|
| POS `IntegrationConfig.internalBaseUrl` **not auto-set** to Finance URL (e.g. `https://{slug}.{domain}` or internal `http://127.0.0.1:{port}`) | **High** |
| Bridge calls Finance, not POS API domain — `{slug}-pos-api` is for external/POS clients, not required for sync if `internalBaseUrl` points at Finance server | Info |
| Local dev: compose binds POS to `127.0.0.1` only; Traefik still generates public host rules | Medium (dev routing) |

---

## Phase 6 — Environment Variable Audit

| Variable | Required for | Validated at provision? | Notes |
|----------|--------------|-------------------------|-------|
| `POS_PLATFORM_API_KEY` | POS org bootstrap | At bootstrap only (≥10 chars) | **Empty in repo `.env`** → POS step fails |
| `POS_APP_ROOT` | POS image build | No | Default `services/posnew` |
| `INTERNAL_API_SECRET` | Finance internal APIs (seed, warehouses, receipts) | Finance bootstrap throws if missing | Must match POS `IntegrationConfig.internalSecret` manually |
| `DEPLOYMENT_SECRET_KEY` | Bootstrap admin password HMAC | Yes | |
| `PROVISION_MODULE_GATING` | Stack selection | No | `1` in root `.env` |
| `ROOT_DOMAIN` / `PUBLIC_BASE_URL_SCHEME` | Traefik hostnames | No | |
| `TRAEFIK_DYNAMIC_DIR` / `TRAEFIK_TENANT_UPSTREAM_HOST` | Edge routing | No | |
| Redis URL (POS `config.redisUrl`) | BullMQ | No | Silent if missing |
| `TENANT_ID` (POS compose) | Documented on org model | No | Set in compose; **not read by POS backend config** for integration |
| `BIGCAPITAL_INTERNAL_URL` | N/A as env name | — | Use `IntegrationConfig.bigcapital.internalBaseUrl` per org |
| `FINANCE_WEBHOOK_SECRET` | Outbound webhooks | N/A for this bridge | POS webhooks use separate HMAC (`webhooks_out` queue); **not used for POS→Finance receipt sync** |

### Silent failure modes (no crash)

1. `bigcapital.enabled = false` (default) → no enqueue  
2. Empty item mappings → job skips with "No mapped items"  
3. Missing walk-in / deposit IDs in IntegrationConfig → throw in processor, retries then error state  
4. `worker:bigcapital` not running → jobs pile in Redis or never queue  
5. Wrong `internalBaseUrl` → HTTP errors, `syncStatus: error`  
6. `financeTenantId` mismatch → Finance 404 / bad tenant context  

---

## Gap Summary

### Critical

| # | Gap | Impact |
|---|-----|--------|
| C1 | Provisioner does **not** write `IntegrationConfig` (enabled, financeTenantId, internal URL/secret, seeded customer/account IDs) | Dual-module provision does **not** activate bridge |
| C2 | **Manual item mapping** required for every menu item | Paid orders sync **zero lines** until mapped |
| C3 | **`worker:bigcapital` must run separately** | Code deployed but sync never executes |
| C4 | `POS_PLATFORM_API_KEY` empty in default env | POS bootstrap fails on combined provision |

### High

| # | Gap | Impact |
|---|-----|--------|
| H1 | Native GL off only when integration API sets `enabled` | Double-books risk if operator assumes provision handled it |
| H2 | Finance seeded IDs on Postgres **not copied** to POS Mongo | Operator must re-enter or build sync job from `tenant_deployments` |
| H3 | No auto `internalBaseUrl` from tenant Finance port/Traefik URL | Misconfiguration blocks all sync |
| H4 | POS failure on bundle → tenant `partial`, easy to miss | Finance live, POS broken, status unclear in UI |

### Medium

| # | Gap | Impact |
|---|-----|--------|
| M1 | No menu ↔ BC item auto-provision | Large onboarding effort |
| M2 | COGS entirely Finance-side from item master | POS recipe costs ignored |
| M3 | `finance_tenant_id` on deployment sometimes not persisted if job complete payload incomplete | License sync / cross-ref gaps |
| M4 | `TENANT_ID` env in POS compose unused for integration wiring | Weak control-plane ↔ POS link except `stockixTenantId` on Organization |

### Low

| # | Gap | Impact |
|---|-----|--------|
| L1 | No dedicated DLQ admin UI beyond BullMQ failed count + replay endpoint | Ops friction |
| L2 | Traefik TLS depends on Cloudflare resolver | Local/dev cert behavior |

---

## What Exists vs What Is Needed (Checklist)

| Requirement | Exists? | Location / notes |
|-------------|---------|------------------|
| Dual module license | ✅ | `tenants.modules` |
| Finance docker provision | ✅ | `infra/tenant-stack` |
| POS docker provision | ✅ | `infra/pos-tenant-stack` |
| Finance org + COA build | ✅ | provision-user + build_organization |
| Warehouse activation (bundle) | ✅ | `InternalActivateWarehousesService` |
| Walk-in + deposit seed (bundle) | ✅ | `InternalSeedPosDefaultsService` |
| POS org + PIN bootstrap | ✅ | `bootstrap-pos-org.ts` + platform API |
| Async BullMQ bridge | ✅ | `bigcapital_sync` queue |
| Internal sale receipt API | ✅ | `POST /api/internal/pos/receipts` |
| IntegrationConfig model | ✅ | Mongo |
| Item mapping model + API | ✅ | Mongo + REST |
| Native GL suppression when enabled | ✅ | `accountingService.js` |
| **Auto-enable integration on provision** | ❌ | **Build** |
| **Auto item mapping** | ❌ | **Build** |
| **Auto internalBaseUrl from provision** | ❌ | **Build** |
| **Single worker in tenant compose** | ❌ | Run `worker:bigcapital` separately |

---

## Recommended Implementation Order (for future work — not done in this audit)

1. After `seed_pos_defaults` + POS org create: upsert `IntegrationConfig` from `tenant_deployments` + Finance internal URL template.  
2. Set `bigcapital.enabled = true` and `bigcapitalIntegrationEnabled = true` for bundle tenants.  
3. Preflight validate `POS_PLATFORM_API_KEY` before POS compose.  
4. Optional: seed item mappings from a catalog export or BC item list API.  
5. Add `worker:bigcapital` to `pos-tenant-stack` compose or document as mandatory sidecar.  
6. Dashboard: show integration readiness (config + mappings + worker heartbeat).

---

## Appendix — Key File References

| Area | Path |
|------|------|
| Tenant / deployment schema | `packages/db/src/schema.ts` |
| Provision runtime | `infra/worker-service/src/provision-runtime.ts` |
| POS stack + bootstrap | `infra/worker-service/src/module-stacks.ts`, `domain/provisioning/adapters/bootstrap-pos-org.ts` |
| Finance seed / warehouses | `services/stockix-finance/.../InternalOrg.controller.ts` |
| Traefik | `infra/worker-service/domain/traefik-config.ts` |
| Sync enqueue / processor / worker | `services/posnew/.../bigcapitalSync*.js`, `workers/bigcapitalSyncWorker.js` |
| Integration routes | `services/posnew/.../routes/integrationRoute.js` |
| Finance receipt ingress | `services/stockix-finance/.../InternalPos.controller.ts` |
| Job complete / deployment IDs | `apps/api/src/index.ts` (~1478–1513) |
| Prior audits | `docs/PROVISIONING_AUDIT.md`, `docs/POS_BIGCAPITAL_INTEGRATION_AUDIT.md`, `docs/INTEGRATION_VERIFICATION_REPORT.md` |

---

*End of report.*
