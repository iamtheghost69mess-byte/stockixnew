# saas-dash

Next.js **platform operator** dashboard (multi-tenant product owner / support surfaces). It is separate from the tenant **Studio** in `apps/pos-frontend2`.

## Documentation

- **Global system context and how it relates to tenant POS:** [`../../SYSTEM_AUDIT_MASTER.md`](../../SYSTEM_AUDIT_MASTER.md) (see *GLOBAL SYSTEM HEALTH REPORT* and repo overview).

Tenant-facing behavior (orders, accounting, inventory) is implemented in `apps/pos-backend` and `apps/pos-frontend2`.

## Run locally

From monorepo root:

```bash
npm install
cd apps/saas-dash
npm run dev
```

Or start with the full stack: `npm run dev:all` from the repository root (runs this app alongside backend and Studio per root `package.json`).

## Scripts

Use `package.json` in this folder for `build`, `start`, and tests (e.g. `test:unit`). Root `npm run typecheck` includes this project’s TypeScript check.
