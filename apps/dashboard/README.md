# Dashboard Service Runbook

## Purpose
`apps/dashboard` is the owner-facing control plane UI. It serves:
- auth pages (`/login`, `/accept-invite`)
- protected dashboard areas (`/owners`, `/tenants`, `/settings`)
- server-side API relay routes under `app/api/*` to the control-plane API.

## Required Runtime Environment
- `DATABASE_URL`
- `SESSION_SECRET`
- `PLATFORM_API_SECRET`
- `PLATFORM_ADMIN_EMAIL`
- `PLATFORM_ADMIN_PASSWORD`
- `NODE_ENV`

Build-time/public:
- `NEXT_PUBLIC_STOCKIX_API_URL`
- `NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME`
- `NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN`
- `NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST`

## Security Controls
- Protected dashboard routes are server-gated in `app/(dashboard)/layout.tsx`.
- Relay calls include `Authorization` with `PLATFORM_API_SECRET`.
- Mutating relay requests include `Idempotency-Key`.
- Correlation IDs are forwarded as `x-request-id`/`x-correlation-id`.
- Proxy middleware sets security headers and CSP in `proxy.ts`.

## Production Deployment Checklist
1. Set all required env vars in deployment manifests.
2. Confirm `NEXT_PUBLIC_STOCKIX_API_URL` points to the production API origin.
3. Ensure `PLATFORM_API_SECRET` matches API runtime value.
4. Verify CSP `connect-src` resolves to expected API host.
5. Verify login, `/api/me`, owner mutation, and tenant mutation flows.
6. Verify dashboard health by loading `/` and protected routes after deploy.

## Local Development
From repo root:
```bash
pnpm install
pnpm bootstrap:env
pnpm dev
```

Dashboard is available at `http://localhost:3000`.
