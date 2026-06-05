# Stockix E2E Audit Results
**Date:** 2026-06-05T08:52:47.308Z
**Environment:** http://localhost:4000
**Branch:** architecture

## Summary
| Total | Pass | Fail | Skip | Partial |
|-------|------|------|------|---------|
| 20    | 0    | 1    | 19    | 0       |

## Verdict
FAIL — 1 scenario(s) failed — see Open Issues.

## Scenario Results
### S01 — API Health Check
**Status:** ❌ FAIL
**Duration:** 75ms
**Detail:** GET /health → 200, GET /ready → 401
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
    "error": "unauthorized_actor"
  }
}
```
**Issue (if fail):** Expected HTTP 200 on /health and /ready

### S02 — Admin Auth
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S03 — Plans: list and create
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S04 — Provision: Accounting only
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S05 — Finance server health
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S06 — Tenant detail & events
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S07 — Organization management
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S08 — Organization access
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S09 — Tenant branding / config
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S10 — Provision: POS only
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S11 — Provision: Accounting + POS combined
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S12 — POS proxy reachability
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S13 — Tenant suspend and reactivate
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S14 — Tenant stop and restart
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S15 — License: generate and assign
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S16 — License: suspend and reactivate
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S17 — License: revoke
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S18 — License: extend
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S19 — Backup scripts exist and are executable
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** Skipped — API unavailable
**Evidence:** [none]


### S20 — Deprovision all test tenants (cleanup)
**Status:** ⏭️ SKIP
**Duration:** 0ms
**Detail:** No test tenants were created
**Evidence:** [none]


## Shared Infrastructure Check
| Component | Status | Evidence |
|-----------|--------|----------|
| MySQL | ❌ | stockix-shared-stockix-mysql-1: no output |
| MongoDB RS | ❌ | stockix-shared-stockix-mongo-1: no output |
| Redis | ❌ | stockix-shared-stockix-redis-1: no output |
| stockix-shared network | ❌ | bridge, dev_default, host, none |

## Tenant Isolation Verification
| Tenant slug | MySQL DBs | Mongo DB | Redis keys | Traefik YAML |
|-------------|-----------|----------|------------|--------------|
| [TO BE FILLED] | — | — | — | — |

## Backup Scripts Audit
| Script | Exists | Syntax valid | Notes |
|--------|--------|--------------|-------|
| backup.sh | [TO BE FILLED] | [TO BE FILLED] | |
| backup-shared.sh | [TO BE FILLED] | [TO BE FILLED] | |
| healthcheck.sh | [TO BE FILLED] | [TO BE FILLED] | |

## Open Issues Found
- **S01 — API Health Check:** Expected HTTP 200 on /health and /ready
  - Expected vs actual: GET /health → 200, GET /ready → 401

## What is Working
_Run `pnpm audit:e2e` to populate — [TO BE FILLED]_
