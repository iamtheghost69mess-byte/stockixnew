# Restaurant POS monorepo

Multi-tenant POS platform: **tenant API** (Express + MongoDB), **Studio + staff POS** (Next.js), and **platform operator dashboard** (Next.js). Workspaces live under `apps/*` and `packages/*`.

## Documentation

**Primary technical and business reference:** [`SYSTEM_AUDIT_MASTER.md`](./SYSTEM_AUDIT_MASTER.md)

That file is the consolidated audit and architecture narrative for **Accounting**, **Inventory**, and **POS** (backend routes, frontend surfaces, data flows, known gaps, and recommended fix order). Prefer updating it—or app-specific READMEs below—instead of adding scattered `.md` files at the repo root.

## Apps

| App | Path | Role |
|-----|------|------|
| Tenant API | `apps/pos-backend` | REST + realtime POS, RBAC, accounting, inventory, orders |
| Studio + POS shell | `apps/pos-frontend2` | Back office (`/dashboard/*`) and staff POS (`/pos/*`) |
| Platform dashboard | `apps/saas-dash` | Operator / platform-level UI |

## Quick start

From the repository root:

```bash
npm install
```

Run backend + Studio + SaaS dashboard together:

```bash
npm run dev:all
```

Nx graph and builds:

```bash
npm run graph
npm run build:all
```

Typecheck (selected packages):

```bash
npm run typecheck
```

Backend **unit tests** and **staff seat-cap selftest** (MongoDB) are documented in [`apps/pos-backend/README.md`](./apps/pos-backend/README.md#testing).

## Environment

- **Backend:** See `apps/pos-backend/.env.example` and configure MongoDB, JWT, and any payment or print workers you use.
- **Studio / POS:** Point the browser client at the API (commonly `NEXT_PUBLIC_POS_API_ORIGIN` in `apps/pos-frontend2`).

Details and risk areas (payments, GL posting, public self-order) are summarized in [`SYSTEM_AUDIT_MASTER.md`](./SYSTEM_AUDIT_MASTER.md).
