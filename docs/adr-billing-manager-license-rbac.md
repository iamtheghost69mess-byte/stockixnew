# ADR: `billing_manager` — optional license route expansions

**Status:** Proposed (not approved)  
**Date:** 2026-05-13  
**Context:** [`docs/missingorga.md`](missingorga.md) §3; current implementation in [`apps/api/src/middleware/rbac.ts`](../apps/api/src/middleware/rbac.ts).

## Current behavior (shipped)

| Path pattern | Minimum role |
|--------------|----------------|
| `GET /licenses*` | `read_only` |
| `POST /licenses/:id/extend` | `billing_manager` |
| `PATCH /licenses/:id` (notes only in handler) | `billing_manager` |
| `POST …/activations/…/deactivate` | `support_agent` |
| Other mutating `/licenses/*` (generate, assign, revoke) | `super_admin` |
| `/fingerprints*` | `super_admin` |

Dashboard hides generate / assign / revoke entry points for non–`super_admin` on license list/detail.

## Proposed expansions (pick explicitly; do not merge piecemeal without matrix)

1. **`POST /licenses/:id/assign` at `billing_manager`** — allows reassignment without revoke; requires audit and UI to hide revoke for that role.
2. **`GET /fingerprints*` at `read_only`** (unchanged) **vs** **`GET` at `billing_manager` only** — if fingerprint list is considered billing-sensitive, keep super-only reads.
3. **`POST /fingerprints/blacklist`** — almost certainly remains **`super_admin`** only.

## Decision

- **Default:** no change until product signs one row above.
- **Approval:** update `requiredApiRole`, [`apps/api/tests/rbac.test.ts`](../apps/api/tests/rbac.test.ts), and dashboard affordances in one PR per expansion.
