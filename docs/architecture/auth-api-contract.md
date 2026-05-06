# Auth API Contract (Dashboard Consumer)

Dashboard must consume auth only through API contracts and never handle token internals.

## Endpoints

- `POST /auth/login`
  - Request: `{ email, password, code? }`
  - Response:
    - success: `{ success: true, ok: true }`
    - mfa-required: `{ success: false, error: "mfa_required", requiresMfa: true }` with HTTP 401
  - Side effects: sets `stockix-session` or `stockix-mfa` HttpOnly cookie

- `POST /auth/verify-mfa`
  - Request: `{ code }`
  - Response: `{ success, ok: true }`
  - Side effects: reads `stockix-mfa`, sets `stockix-session`, clears `stockix-mfa`

- `GET /auth/me`
  - Response:
    - `{ success: true, me: { id, role, email, name, capabilities } }`
  - `capabilities`:
    - `canAccessSettings`
    - `canManageOwners`
    - `canManageTenants`

- `POST /auth/reconfirm`
  - Request: `{ password }`
  - Response: `{ success, ok: true }`

- `GET /auth/mfa/status`
- `POST /auth/mfa/begin`
- `POST /auth/mfa/enable` with `{ code }`
- `POST /auth/mfa/disable` with `{ code }`

- `POST /auth/logout`
  - Response: `{ success, ok: true }`
  - Side effects: clears auth cookies

## Dashboard Usage Rule

- Dashboard pages call `/api/auth/**` and `/api/me`.
- Dashboard pages call `/api/**` relay endpoints (e.g. `/api/session/login`, `/api/security/mfa/*`, `/api/auth/invite/*`, `/api/auth/logout`) and `/api/me`.
- Dashboard does not parse or persist `sessionToken` or `mfaToken`.
