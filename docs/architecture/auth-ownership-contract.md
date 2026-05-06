# Auth Ownership Contract

## Scope

This contract defines a hard architectural boundary for Stockix authentication:

- Auth ownership: `apps/api/src/**`
- Dashboard scope: `apps/dashboard/**` as UI + HTTP client only

## API Ownership (Allowed in `apps/api/src/**`)

- Session validation and lifecycle checks
- Login, MFA, invite acceptance, reconfirmation
- Token signing and verification
- Role and permission authorization
- Auth guard decisions and protected-route enforcement
- Any cryptographic behavior used by auth flows

## Dashboard Constraints (Forbidden in `apps/dashboard/**`)

- Session token or MFA token storage lifecycle helpers
- Session validation business logic
- MFA verification or orchestration logic in UI
- Role-based authorization decisions from local role/session state
- Redirect decisions based on auth state calculation in UI
- Cryptographic logic or crypto module usage for auth

## Dashboard Allowed Behavior

- Render forms, loading states, and API errors
- Call dashboard API endpoints (`/api/**`) or approved API client helpers
- Display capability flags returned by API contracts (for UX visibility only)
- Keep transport-only relay handlers in `apps/dashboard/app/api/**` when needed.

## Relay Policy (Locked)

- Dashboard relays are permitted only as transport adapters.
- Allowed relay responsibilities:
  - forward request body/headers/cookies to API
  - forward API status/body/cookies back to client
- Forbidden in relays:
  - token/session creation or validation logic
  - role/permission decisions
  - MFA verification/business branching

## Capability Contract

Dashboard consumes API-delivered capability flags from `GET /auth/me`:

- `canAccessSettings`
- `canManageOwners`
- `canManageTenants`

Dashboard must never derive authorization from role/session tokens directly.

## CI Enforcement

The architecture is enforced by:

- `scripts/architecture-validation.mjs` (phase checks)
- CI workflow `.github/workflows/architecture-governance.yml`

Any Phase 2 violation is a merge blocker.
