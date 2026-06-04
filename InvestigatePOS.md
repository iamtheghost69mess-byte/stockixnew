# InvestigatePOS — POS-only provision timing gap

**Role:** Senior backend engineer investigation (read-only)  
**Date:** 2026-06-04  
**Scope:** `infra/worker-service` tenant provision → POS stack startup vs per-tenant `.env` write

---

## Executive summary

The **reported bug is real for code before commit `641c8d82` (2026-06-04)**. On the POS-only branch (`moduleGating && !shouldProvisionFinanceStack`), provision jumped straight to `runPosProvisionStep()` while `writeTenantEnvFileAtomic()` only ran on the **Finance path** later (~line 1361), which POS-only tenants never reached.

**Current `main` already contains REPAIR A:** `buildTenantEnvMap()` + `writeTenantEnvFileAtomic()` at lines **1216–1243**, then `runPosProvisionStep()` at **1245**. `provisionPosStack()` also **throws** if `MONGODB_URI`, `REDIS_URL`, or `REDIS_KEY_PREFIX` are missing after `readTenantEnvFile()`.

Remaining risks are **retry/add-module paths** that call POS without re-writing `.env`, and **legacy behavior when `PROVISION_MODULE_GATING=0`** (POS-only still runs the full Finance stack).

---

## 1. `provision-runtime.ts` — execution order

### Branching (module list → path)

| Condition | Location | Path |
|-----------|----------|------|
| `retryModules === ["wire"]` | `805–936` | Wire-only retry; no POS compose |
| `retryModules === ["pos"]` | `805–806`, `938–1099` | POS retry; **no env write** (see §5) |
| `moduleGating && !shouldProvisionFinanceStack(modules)` | `1213–1308` | **POS-only** (no Finance compose) |
| Else (Finance + optional POS/PMS/chat) | `1310–2254` | Full Finance provision, then POS at `2077` |

Helpers:

- `shouldProvisionFinanceStack(modules)` → `modules.includes("accounting")` (`module-stacks.ts` **95–98**)
- `isPosOnlyModules(modules)` → has `pos`, no `accounting` (`module-stacks.ts` **111–116**)
- `isModuleGatingEnabled()` → `moduleGatingConfig.enabled`; only `PROVISION_MODULE_GATING=0` disables (`module-stacks.ts` **87–88**)

`licensedModules` resolved at **1212** (`resolveTenantModules(input.modules)`). Default when `modules` omitted/empty: **`["accounting"]`** (`module-stacks.ts` **62–81**).

### POS-only path (gating ON, no accounting)

**Current (fixed) order:**

| Step | Lines | What runs |
|------|-------|-----------|
| 1 | `1214–1215` | Log: skipping Finance stack |
| 2 | `1216–1242` | `buildTenantEnvMap(...)` → `posOnlyTenantEnvMap` |
| 3 | `1243` | `writeTenantEnvFileAtomic(join(tenantEnvRoot, input.slug), posOnlyTenantEnvMap)` |
| 4 | `1244` | Log: `POS-only path: tenant .env written before POS stack` |
| 5 | `1245–1256` | `runPosProvisionStep()` → `provisionPosStackTracked()` → `readTenantEnvFile()` |
| 6 | `1267–1308` | Early `return { ok: true, ... }` — **does not** fall through to Finance env write at `1361` |

**Pre-fix (`641c8d82^`) — the timing gap:**

| Step | Lines (parent commit) | What ran |
|------|----------------------|----------|
| 1 | ~1214–1215 | Log: skipping Finance |
| 2 | ~1216–1226 | **`runPosProvisionStep()` immediately** |
| 3 | N/A | Early return — **never** reached `writeTenantEnvFileAtomic()` at ~1331 |

Finance-path env write (`buildTenantEnvMap` + `writeTenantEnvFileAtomic`) lived at **1334–1361** in current file; POS-only returned at **1292–1308** before that block.

### Finance + POS path (accounting present)

| Step | Lines | Order |
|------|-------|-------|
| Tenant config load (optional branding) | `1315–1331` | Before env map |
| `buildTenantEnvMap` | `1334–1360` | Uses `tenantConfig` when `tenantId` set |
| `writeTenantEnvFileAtomic` | `1361` | **Before** any Finance compose |
| Finance compose / DB / bootstrap | `1376–2075` | Includes `provisionTenantDatabases` at **1414–1415** |
| `runPosProvisionStep` | **2077–2088** | **After** env write and Finance stack |

POS-only path **does not** call `provisionTenantDatabases()` (MySQL user/DB creation + Mongo TCP check). Finance path does at **1414–1415**. POS compose only needs Mongo/Redis URLs from `.env`; Mongo DB `{slug}_pos` is created on first write.

### Accounting-only path

- `runPosProvisionStep` skipped when `licensedModules` lacks `pos` (`runPosProvisionStep` **114–115**).
- Env still written at **1361** for Finance.

---

## 2. `module-stacks.ts` — `provisionPosStack()`

| Item | Lines |
|------|-------|
| `readTenantEnvFile(opts.slug)` | **327** |
| Required vars check | **328–335** |
| Compose `up` | **386–409** |

### When `readTenantEnvFile` returns `{}`

- **ENOENT** on `{TENANT_ENV_ROOT}/{slug}/.env` → empty object (`tenant-env.ts` **247–248**).
- Other read errors → **rethrow** (**250**).

### Behavior on empty / missing keys

- **Does not** silently continue.
- **Throws** `Error` listing missing keys among `MONGODB_URI`, `REDIS_URL`, `REDIS_KEY_PREFIX` (**330–334**), with message to run `writeTenantEnvFileAtomic()` first.
- Failure is caught in `runPosProvisionStep` → `posStatus: "failed"` (**169–172**), not an uncaught crash from `provisionPosStack` itself.

Compose env merges `process.env`, then `tenantEnv`, then POS-specific overrides (**337–357**).

---

## 3. `tenant-env.ts` — env build/write

| Function | Lines | Notes |
|----------|-------|-------|
| `buildTenantEnvMap` | **120–227** | Pure function; no Finance provision required |
| `buildTenantMongoUrl(slug)` | **90–93** | `mongodb://{SHARED_MONGO_HOST}:27017/{slug}_pos?...` |
| `writeTenantEnvFileAtomic` | **271–281** | tmp `.env.tmp` → rename `.env` |
| `readTenantEnvFile` | **241–268** | Path: `defaultTenantEnvRoot()/slug/.env` |

### Can `buildTenantEnvMap()` run without Finance provision?

**Yes.** Inputs are provision-runtime locals (slug, passwords, port, S3, Stockix branding IDs) plus shared platform env (`env`, `apiConfig`). It does **not** need:

- Finance org IDs, `financeTenantId`, or finance bootstrap results
- Finance internal port (except `publicProxyPort` for Traefik — still allocated for POS-only at **1198**)

It **does** emit Finance-oriented keys (`DB_*`, `SYSTEM_DB_*`, `REACT_APP_STOCKIX_*`, mail, S3) for a unified tenant `.env` file used by Finance compose when present.

POS-only call at **1216–1242** uses empty branding defaults (`stockixDiscoverySlug: input.slug`, `stockixLogoUrl: ""`, etc.) and skips DB `tenantConfig` row load (that happens only on Finance path **1315–1331**).

---

## 4. Path matrix (flags)

```
input.modules (job payload)
        │
        ▼
resolveTenantModules()  ── default ["accounting"] if empty
        │
        ├─ retryModules=["wire"] ──► wire retry (938+ branch not taken)
        ├─ retryModules=["pos"]  ──► posOnlyRetry (938): POS without env rewrite
        │
        ├─ moduleGating OFF ──► full Finance path (legacy: pos-only still provisions Finance)
        │
        └─ moduleGating ON
              ├─ !accounting ──► POS-only branch (1214): env @ 1243, POS @ 1245
              └─ accounting ──► Finance path: env @ 1361, POS @ 2077 if pos licensed
```

| Tenant type | Gating | Env write before POS | Finance stack |
|-------------|--------|----------------------|---------------|
| `["pos"]` | ON | **1243** (current) | Skipped |
| `["pos"]` | OFF | **1361** | **Started** (legacy) |
| `["accounting"]` | either | **1361** | Started |
| `["accounting","pos"]` | ON | **1361** | Started; POS **2077** |
| `add_module: pos` | n/a | **Assumes existing `.env`** | Depends on tenant |

---

## 5. `tenant_lifecycle_jobs` / job payload

### `tenant.provision`

- **Schema:** `infra/worker-service/src/worker.ts` **439–458** — `modules?: ("accounting"|"pos"|"pms"|"chat")[]`, plus `retryModules`.
- **Enqueue:** `apps/api/src/routes/tenants.ts` **1096–1110** — `modules: body.modules` in payload.
- **Worker:** `runProvisionJob` **515–533** passes `modules` and `retryModules` into `provisionTenant` → `executeProvisionRuntime`.

Worker **can** know POS-only at job start: `resolveTenantModules(payload.modules)` and `shouldProvisionFinanceStack()` / `isPosOnlyModules()`.

### `add_module` (POS added later)

- Payload: `worker.ts` **474–481** — single `module`, no full module list re-sent (loaded from `tenants.modules` row).
- `runAddModuleStep` **2419–2492** calls `runPosProvisionStep` without `writeTenantEnvFileAtomic` — safe only if initial provision already wrote `.env` (e.g. former accounting-only tenant).

---

## REPORT FORMAT

### A) Exact file + line numbers for the timing gap

| State | File | Gap |
|-------|------|-----|
| **Bug (pre `641c8d82`)** | `infra/worker-service/src/provision-runtime.ts` | POS start ~**1216** `runPosProvisionStep`; env write only on Finance path ~**1331** `writeTenantEnvFileAtomic` — unreachable after POS-only early return ~**1267–1308** |
| **Fixed (current)** | Same file | Env **1216–1243** → POS **1245** |
| **Guard** | `infra/worker-service/src/module-stacks.ts` **327–335** | Throw if env empty |
| **Finance+POS (correct order)** | `provision-runtime.ts` **1361** then **2077** | No gap |

Audit note: user cited “~1215” and “~1331” — matches pre-fix branch entry and Finance-path env write.

### B) Env vars missing when POS starts with empty `{}`

`provisionPosStack` **hard-fails** on:

| Variable | Set by `buildTenantEnvMap` | Used by POS compose |
|----------|---------------------------|---------------------|
| `MONGODB_URI` | **165–166** (`buildTenantMongoUrl`) | `pos-backend`, workers |
| `REDIS_URL` | **173** | workers, backend |
| `REDIS_KEY_PREFIX` | **174** | isolation prefix |

Also written but **not** in the guard (would be wrong/empty if compose ran without full map):

- `MONGODB_DATABASE_URL` (duplicate mongo URL)
- `AUTH_TOKEN_SECRET` — injected from `apiConfig` in compose overrides (**346**), not from `.env` file
- `JWT_SECRET`, `DB_*`, mail/S3 — Finance-oriented; POS stack does not require them for compose **up**

Without `.env`, compose could substitute empty `${MONGODB_URI}` → broken POS containers (pre-guard behavior). With guard, provision fails fast with explicit error.

### C) Can `buildTenantEnvMap()` run safely before Finance provision?

**Yes** — already done on POS-only path (**1216–1242**). No finance-specific runtime data required. Shared infra hostnames come from worker environment (`SHARED_MONGO_HOST`, `TENANT_REDIS_HOST`, etc.). Per-tenant secrets (`dbPassword`, `jwtSecret`) are generated earlier in the same function before the branch (**780–786**, transaction **1194–1203**).

Caveat: POS-only does not run `provisionTenantDatabases()`; MySQL entries in `.env` exist but DBs/users may not exist until Finance is added — irrelevant for POS compose.

### D) Simplest fix path

| Option | Status / recommendation |
|--------|-------------------------|
| **Move `writeTenantEnvFileAtomic()` before POS on POS-only path** | **Done** in `641c8d82` (REPAIR A) |
| **Call `buildTenantEnvMap()` early + write before POS** | Equivalent to above; current implementation |
| **Guard if `.env` missing before compose** | **Done** in `module-stacks.ts` **328–335** |
| **Other (recommended additions)** | See §E |

If deploying code **before** REPAIR A: apply D row 1 + guard row 3.

### E) Other timing / ordering issues found

1. **`posOnlyRetry` (`retryModules: ["pos"]`)** — `938–977`: calls `runPosProvisionStep` with **no** `writeTenantEnvFileAtomic`. Fails if first attempt died before env write; succeeds on retry if `.env` was written in a later manual fix or partial run.

2. **`runAddModuleStep` for `module === "pos"`** — `2481`: assumes `.env` from initial tenant provision. POS-only tenant that never had env (pre-fix) still broken until reprovision or manual env write.

3. **`PROVISION_MODULE_GATING=0`** — POS-only **skips** branch at **1214**; runs full Finance stack (`apps/api/tests/module-provision-gating.test.ts` **138–142**). Not an env timing bug, but changes product behavior vs POS-only intent.

4. **POS-only skips `provisionTenantDatabases()`** — no MySQL user/DB creation, no explicit Mongo TCP verify before compose (Finance path **1414–1418**). POS may still work if shared Mongo is up; flakier on cold shared infra.

5. **POS-only skips `tenantConfig` branding load** — uses slug/default colors in env (**1236–1241**) vs Finance path **1315–1331**. Cosmetic for POS; Finance branding keys empty/wrong until reprovision.

6. **Stale `.tmp-dist`** — compiled `provision-runtime.js` may predate source fixes; production should run from `src`/rebuilt worker image, not `.tmp-dist`.

7. **`financeInternalPort` on POS-only** — port allocated and passed to POS (**1252**) for optional `FINANCE_INTERNAL_BASE_URL`; empty when no Finance stack (expected).

---

## References

- Fix commit: `641c8d82` — `refactor(infra): enhance tenant provisioning and shared infrastructure`
- Architecture doc: `docs/Architecture2.md` — REPAIR A (**21**, **387–393**, **741**)
- POS compose env contract: `infra/pos-tenant-stack/docker-compose.yml` **35–38**, **68–70**

---

## Investigation checklist (requested tasks)

| # | Task | Result |
|---|------|--------|
| 1 | POS-only path vs `writeTenantEnvFileAtomic` in `provision-runtime.ts` | Mapped §1; gap pre-fix, fixed **1243→1245** |
| 2 | `provisionPosStack` + `readTenantEnvFile` | §2; throws on missing trio |
| 3 | `buildTenantEnvMap` / `writeTenantEnvFileAtomic` | §3; finance-independent |
| 4 | Branching POS / accounting / both | §4 matrix |
| 5 | Job payload / worker visibility | §5; `modules` on `tenant.provision` |

**No source files were modified during this investigation.**
