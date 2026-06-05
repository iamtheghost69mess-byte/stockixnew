# Stockix E2E Audit Results
**Date:** 2026-06-05T12:19:34.776Z
**Environment:** http://localhost:4000
**Branch:** architecture

## Summary
| Total | Pass | Fail | Skip | Partial |
|-------|------|------|------|---------|
| 20    | 5    | 3    | 12    | 0       |

## Verdict
FAIL — 3 scenario(s) failed — see Open Issues.

## Scenario Results
### S01 — API Health Check
**Status:** ✅ PASS
**Duration:** 50ms
**Detail:** GET /health → 200, GET /ready → 200
**Evidence:** 
```json
{
  "health": {
    "status": "ok",
    "mail": {
      "configured": true,
      "fromAddressSet": true,
      "transport": "resend-api"
    }
  },
  "ready": {
    "ready": true,
    "checks": {
      "database": "ok",
      "redis": "ok"
    },
    "timestamp": "2026-06-05T12:19:22.057Z"
  }
}
```


### S02 — Admin Auth
**Status:** ✅ PASS
**Duration:** 311ms
**Detail:** POST /auth/login → 200, session cookie captured
**Evidence:** 
```json
stockix-session=…
```


### S03 — Plans: list and create
**Status:** ✅ PASS
**Duration:** 84ms
**Detail:** Initial count=6, created plan e2e-plan-mq0w5nlh, list confirms=true
**Evidence:** 
```json
{
  "planId": "dfa65890-dfb8-4a5d-a213-d883f7f5580e",
  "total": 7
}
```


### S04 — Provision: Accounting only
**Status:** ❌ FAIL
**Duration:** 5408ms
**Detail:** Provision failed, tenantStatus=failed
**Evidence:** 
```json
{
  "status": "failed",
  "ready": false,
  "readiness": {
    "status": "FAILED",
    "reason": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '?' at line 1",
    "checks": {
      "jobCompleted": false,
      "tenantExists": true,
      "deploymentValid": false,
      "tenantResponding": false,
      "authReady": false,
      "routeActive": false,
      "financeTenantLinked": false,
      "financeLicenseSynced": false
    },
    "reasons": [
      "tenant_status_failed"
    ]
  },
  "correlationId": "51df881c-7f5e-41fa-ae33-642b791cc70b",
  "error": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '?' at line 1",
  "events": [
    {
      "id": "ebba0ec0-5b7d-4b2e-80bf-ee63bf8ba8f7",
      "phase": "api",
      "level": "info",
      "message": "HTTP 202 — provisioning accepted; background worker will start",
      "meta": null,
      "createdAt": "2026-06-05T12:19:24.095Z"
    },
    {
      "id": "640e3ae4-29ad-4a7a-bcec-5bee591f389e",
      "phase": "preflight.cleanup",
      "level": "info",
      "messag…
```
**Issue (if fail):** Expected status=active within timeout

### S05 — Finance server health
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No internalPort from S04
**Evidence:** [none]


### S06 — Tenant detail & events
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No tenant from S04
**Evidence:** [none]


### S07 — Organization management
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No tenant from S04
**Evidence:** [none]


### S08 — Organization access
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Missing tenant or secondOrgId from S07
**Evidence:** [none]


### S09 — Tenant branding / config
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No tenant from S04
**Evidence:** [none]


### S10 — Provision: POS only
**Status:** ❌ FAIL
**Duration:** 3371ms
**Detail:** status=failed, modules=[]
**Evidence:** 
```json
{
  "tenantId": null,
  "posUrl": null
}
```
**Issue (if fail):** Expected active POS tenant

### S11 — Provision: Accounting + POS combined
**Status:** ❌ FAIL
**Duration:** 3307ms
**Detail:** status=failed
**Evidence:** 
```json
{
  "status": "failed",
  "ready": false,
  "readiness": {
    "status": "FAILED",
    "reason": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '?' at line 1",
    "checks": {
      "jobCompleted": false,
      "tenantExists": true,
      "deploymentValid": false,
      "tenantResponding": false,
      "authReady": false,
      "routeActive": false,
      "financeTenantLinked": false,
      "financeLicenseSynced": false
    },
    "reasons": [
      "tenant_status_failed"
    ]
  },
  "correlationId": "43f205ae-6ee4-4f79-8001-82f58a679629",
  "error": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '?' at line 1",
  "events": [
    {
      "id": "be48122c-e4de-4330-b435-a269100bfa9e",
      "phase": "api",
      "level": "info",
      "message": "HTTP 202 — provisioning accepted; background worker will start",
      "meta": null,
      "createdAt": "2026-06-05T12:19:32.175Z"
    },
    {
      "id": "5a51bc0b-5e40-4d05-80f8-58ecca34308b",
      "phase": "preflight.cleanup",
      "level": "info",
      "messag…
```
**Issue (if fail):** Expected active or partial with POS

### S12 — POS proxy reachability
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** S11 failed or posUrl empty
**Evidence:** [none]


### S13 — Tenant suspend and reactivate
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Missing acct tenant/port from S04
**Evidence:** [none]


### S14 — Tenant stop and restart
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No acct tenant from S04
**Evidence:** [none]


### S15 — License: generate and assign
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Missing tenant or auth
**Evidence:** [none]


### S16 — License: suspend and reactivate
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No licenseId from S15
**Evidence:** [none]


### S17 — License: revoke
**Status:** ✅ PASS
**Duration:** 93ms
**Detail:** revoke=200, status=revoked
**Evidence:** 
```json
{
  "revokeLicenseId": "63c2baba-144c-4118-8b4e-ea12d2630f7f"
}
```


### S18 — License: extend
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No licenseId from S15
**Evidence:** [none]


### S19 — Backup scripts exist and are executable
**Status:** ✅ PASS
**Duration:** 133ms
**Detail:** 3 scripts checked
**Evidence:** 
```json
[
  {
    "script": "infra/prod/backup/backup.sh",
    "exists": true,
    "syntaxOk": true,
    "notes": ""
  },
  {
    "script": "infra/prod/backup/backup-shared.sh",
    "exists": true,
    "syntaxOk": true,
    "notes": ""
  },
  {
    "script": "infra/prod/monitoring/healthcheck.sh",
    "exists": true,
    "syntaxOk": true,
    "notes": ""
  }
]
```


### S20 — Deprovision all test tenants (cleanup)
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No test tenants were created
**Evidence:** [none]


## Shared Infrastructure Check
| Component | Status | Evidence |
|-----------|--------|----------|
| MySQL | ✅ | stockix-shared-stockix-mysql-1: mysqladmin: [Warning] Using a password on the command line interface can be insecure.
mysqld is alive |
| MongoDB RS | ✅ | stockix-shared-stockix-mongo-1: 1 |
| Redis | ✅ | stockix-shared-stockix-redis-1: PONG |
| stockix-shared network | ✅ | bridge, dev_default, host, none, stockix-shared |

## Tenant Isolation Verification
| Tenant slug | MySQL DBs | Mongo DB | Redis keys | Traefik YAML |
|-------------|-----------|----------|------------|--------------|
| [TO BE FILLED] | — | — | — | — |

## Backup Scripts Audit
| Script | Exists | Syntax valid | Notes |
|--------|--------|--------------|-------|
| infra/prod/backup/backup.sh | ✅ | ✅ |  |
| infra/prod/backup/backup-shared.sh | ✅ | ✅ |  |
| infra/prod/monitoring/healthcheck.sh | ✅ | ✅ |  |

## Open Issues Found
- **S04 — Provision: Accounting only:** Expected status=active within timeout
  - Expected vs actual: Provision failed, tenantStatus=failed
- **S10 — Provision: POS only:** Expected active POS tenant
  - Expected vs actual: status=failed, modules=[]
- **S11 — Provision: Accounting + POS combined:** Expected active or partial with POS
  - Expected vs actual: status=failed

## What is Working
- **S01:** GET /health → 200, GET /ready → 200
- **S02:** POST /auth/login → 200, session cookie captured
- **S03:** Initial count=6, created plan e2e-plan-mq0w5nlh, list confirms=true
- **S17:** revoke=200, status=revoked
- **S19:** 3 scripts checked
