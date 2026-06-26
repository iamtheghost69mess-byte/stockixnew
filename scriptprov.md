# Provisioning Validation Suite — Reference & Report

> **This file has two purposes:**
> 1. **Static documentation** — describes every scenario, validation step, and output format.
> 2. **Runtime report** — when you run the suite, this file is overwritten with only the errors found during that run. If all scenarios pass, it says so clearly.

---

## How to Run

```bash
# Full suite (all 16 scenarios) — runs against live infrastructure
node scripts/e2e/provision-all-scenarios.mjs

# Run a single scenario
node scripts/e2e/provision-all-scenarios.mjs --only pos+finance

# Run a comma-separated subset
node scripts/e2e/provision-all-scenarios.mjs --only finance,pos+finance,all

# Skip specific scenarios
node scripts/e2e/provision-all-scenarios.mjs --skip none,pms,chat
```

**Prerequisites**
- `pnpm dev` running (API server + worker + shared infra)
- Tenant Docker images built (`pnpm infra:worker:build`)
- Shared infra with dev-ports overlay:
  ```bash
  docker compose -f infra/shared/docker-compose.yml \
                 -f infra/shared/docker-compose.dev-ports.yml \
                 --env-file .env up -d --wait
  ```

**Required environment variables** (in root `.env`):

| Variable | Purpose |
|---|---|
| `DEPLOYMENT_SECRET_KEY` | Derives Finance bootstrap admin passwords (must be ≥ 32 chars) |
| `SHARED_MYSQL_ROOT_PASSWORD` | Lets the suite inspect MySQL databases during validation |
| `DATABASE_URL` | Control-plane Postgres — used for licensing checks and Chatwoot account lookups |
| `PLATFORM_API_SECRET` or `PLATFORM_ADMIN_EMAIL` + `PLATFORM_ADMIN_PASSWORD` | Authenticates all API calls |
| `POS_PLATFORM_API_KEY` | Platform-scoped POS API key (org read/write) |
| `CHATWOOT_BASE_URL` + `CHATWOOT_API_ACCESS_TOKEN` | *(optional)* — enables Chatwoot account verification for Chat scenarios |
| `PMS_BASE_URL` | *(optional, default `http://localhost:3003`)* — enables PMS health probe |

---

## All 16 Scenarios

Every scenario provisions a real tenant through `POST /tenants` → poll `provision-status` → consume SSE stream, then deprovisions and asserts all infrastructure is cleaned up. **All tenants are provisioned with admin email `jad.haidar.ahmad315@gmail.com`.**

| # | ID | Modules |
|---|---|---|
| 1 | `none` | *(none)* |
| 2 | `pms` | PMS |
| 3 | `pos` | POS |
| 4 | `finance` | Finance (accounting) |
| 5 | `chat` | Chat (Chatwoot) |
| 6 | `pms+pos` | PMS + POS |
| 7 | `pms+finance` | PMS + Finance |
| 8 | `pms+chat` | PMS + Chat |
| 9 | `pos+finance` | POS + Finance |
| 10 | `pos+chat` | POS + Chat |
| 11 | `finance+chat` | Finance + Chat |
| 12 | `pms+pos+finance` | PMS + POS + Finance |
| 13 | `pms+pos+chat` | PMS + POS + Chat |
| 14 | `pms+finance+chat` | PMS + Finance + Chat |
| 15 | `pos+finance+chat` | POS + Finance + Chat |
| 16 | `all` | PMS + POS + Finance + Chat |

---

## What Each Scenario Validates

### For every scenario

| Check | What it verifies |
|---|---|
| `POST /tenants` → 202 | Provisioning request accepted; `correlationId` returned |
| `GET /tenants/provision-status/:id` | Polls until `status: complete` (fails if `status: failed` or timeout) |
| SSE stream `/tenants/provision-stream/:id` | Consumes real-time events; asserts final `done` event with `status: complete` |
| No rollback events | No `phase: rollback` events in the event log |
| `tenant.status === "active"` | Control-plane marks tenant active after all steps succeed |
| Module licensing | `tenant.modules` includes every requested module |
| Teardown | `DELETE /tenants/:id?volumes=true` succeeds and all infra is gone within 2 min |

### Finance module (`accounting`)

| Check | What it verifies |
|---|---|
| Journal ops in order | `docker.data_step` → `docker.migration_step` → `docker.app_step` → `docker.network_connect` → `tenant.health_check` → `edge.publish` → `tenant.bootstrap_admin` → `tenant.build_organization` → `tenant.activate_warehouses` |
| `GET /api/ping` on Finance app | Finance container is up and responding on its internal port |
| Traefik YAML exists | `{TRAEFIK_DIR}/tenant-{slug}.yml` created and contains the slug host rule |
| MySQL databases | `stockix_{slug}_system` and org databases created |
| Finance admin login | `POST /api/auth/signin` with bootstrap password succeeds; `accessToken` returned |
| **Bad-password rejection** | Same endpoint with a wrong password returns 401/422 — not 200 |

### POS module

| Check | What it verifies |
|---|---|
| Journal ops | `pos.bootstrap_organization` → `pos.schema_migration` (requires `PROVISION_MODULE_GATING=1`) |
| 4 Docker containers healthy | `stockix-pos-{slug}` project: all 4 containers running and healthy |
| POS backend health | `GET http://127.0.0.1:{port}/health` or `/ready` returns 200 |
| Traefik YAML exists | `{TRAEFIK_DIR}/tenant-pos-{slug}.yml` created and contains `{slug}-pos` host rule |
| MongoDB database | `{slug}_pos` database exists in MongoDB |
| POS org platform API | `GET /api/platform/v1/organizations/{posOrgId}` returns 200 |
| POS credentials | `GET /tenants/{id}/pos-credentials` returns admin PIN (unmasked) |
| POS admin login | `POST /api/auth/login` with admin PIN succeeds (auto-approves device if DEVICE_PENDING) |

### POS + Finance together (wire)

| Check | What it verifies |
|---|---|
| Wire health | `GET /api/platform/v1/organizations/{posOrgId}/integration/bigcapital/health` returns 200 |
| BullMQ Redis keys | `bull:tenant:{slug}:bigcapital_sync:*` keys exist in Redis — confirms sync queue wired |
| Additional journal ops | `tenant.seed_pos_defaults` → `pos.bootstrap_organization` → `pos.schema_migration` → `tenant.wire_pos_integration` |

### PMS module

| Check | What it verifies |
|---|---|
| PMS service health | `GET {PMS_BASE_URL}/health` (or `/ready`, `/api/health`) returns 200 |
| PMS journal ops (observed) | Any `pms.*` journal ops are logged; no specific ops are required (PMS may provision via shared service without Docker steps) |
| Module licensed | `tenant.modules` includes `"pms"` |

### Chat module (Chatwoot)

| Check | What it verifies |
|---|---|
| Module licensed | `tenant.modules` includes `"chat"` |
| Chatwoot account created | `organizations.chatwoot_account_id` is set in the control-plane DB for this tenant |
| Chatwoot account exists | `GET {CHATWOOT_BASE_URL}/platform/api/v1/accounts/{accountId}` returns 200 (requires `CHATWOOT_BASE_URL` + `CHATWOOT_API_ACCESS_TOKEN`) |
| Chat journal ops (observed) | Any `chat.*` or `chatwoot.*` journal ops are logged |

### Teardown (every scenario)

| Check | What it verifies |
|---|---|
| Tenant deleted | `GET /tenants/{id}` returns 404 within 10 min |
| MySQL databases gone | No `stockix_{slug}_*` databases remain |
| MongoDB database gone | `{slug}_pos` no longer exists |
| Redis keys gone | No `*{slug}*` keys remain in Redis |
| Traefik YAMLs gone | `tenant-{slug}.yml` and `tenant-pos-{slug}.yml` deleted |

---

## Multi-Tenant Isolation

Isolation is structurally enforced at three layers — this suite verifies the structures exist, not that they contain the right data (that is covered by unit and integration tests):

1. **MySQL** — each tenant's databases are prefixed `stockix_{slug}_*`. The MySQL user `tenant_{slug}` has grants only to that prefix.
2. **MongoDB** — each POS tenant gets its own `{slug}_pos` database. POS containers only connect to their own database.
3. **Traefik routing** — Finance apps are exposed at `{slug}.{ROOT_DOMAIN}` and POS at `{slug}-pos.{ROOT_DOMAIN}`. Containers are only reachable via their correct host header.

---

## Email Tracking

Every provisioned tenant sends emails to `jad.haidar.ahmad315@gmail.com`. The suite logs which emails are expected but **does not intercept delivery** (no Mailhog or mock SMTP in this suite — it tests the real pipeline):

| Trigger | Expected email |
|---|---|
| Tenant created | Welcome / provisioning started email |
| Finance module | Admin credentials / one-time password email |
| Any module activated | Module activation confirmation email |

To verify delivery: check the Resend dashboard or the mail provider logs.

---

## Credential Documentation

When the suite runs successfully, it appends a credentials table to this file:

| Scenario | Slug | Module | Credential | Value |
|---|---|---|---|---|
| *e.g.* `pos+finance` | `e2e-pos-finance-1abc2d-ef3456` | `finance` | Admin password | `<bootstrap-derived>` |
| *e.g.* `pos+finance` | `e2e-pos-finance-1abc2d-ef3456` | `pos` | Admin PIN | `<from pos-credentials API>` |

> Slugs are time-stamped UUIDs — unique per run. All tenants are deprovisioned after each scenario; credentials are for reference only.

---

## Runtime Report Format

When the script runs, this file is **overwritten** with one of the following:

### All passed
```
# Provisioning Validation Report
Date: 2026-06-26T12:34:56.000Z
Scenarios: 16 total — 16 passed, 0 failed

## Result: ALL PASSED
All 16 provisioning scenarios completed successfully.
```

### Some failed
```
# Provisioning Validation Report
Date: 2026-06-26T12:34:56.000Z
Scenarios: 16 total — 14 passed, 2 failed

## Failures

### ✗ Scenario: chat [chat]
**Error**: Chatwoot account not found for tenant 42 (e2e-chat-1abc2d-ef3456)
**Slug**: `e2e-chat-1abc2d-ef3456`
**Modules**: chat
**Last 10 provision events**:
...

## Notes
- CHATWOOT_BASE_URL not configured — Chat account validation was skipped
- Expected emails for "chat": Welcome email → jad.haidar.ahmad315@gmail.com | Module activated → jad.haidar.ahmad315@gmail.com. Delivery requires SMTP/Resend capture.
```

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | All selected scenarios passed |
| `1` | One or more scenarios failed, or a fatal preflight error occurred |

---

## Source Files

| File | Purpose |
|---|---|
| `scripts/e2e/provision-all-scenarios.mjs` | Main runner — 16 scenarios, preflight, report |
| `scripts/e2e/lib/provision-all-helpers.mjs` | PMS/Chat validators, bad-password test, credentials store, report writer |
| `scripts/e2e/lib/provision-suite-core.mjs` | API client, journal assertions, SSE polling, bootstrap password |
| `scripts/e2e/lib/provision-suite-infra.mjs` | Docker, MySQL, MongoDB, Redis, Traefik, POS helpers |
| `scripts/e2e/provision-suite.mjs` | Original suite (Finance, POS, combined, failure injection) |
