# Restaurant POS monorepo

Multi-tenant POS platform: **tenant API** (Express + MongoDB), **Studio + staff POS** (Next.js). Workspaces live under `apps/*` and `packages/*`. POS packages are members of the **root** Stockix pnpm workspace (`pnpm-workspace.yaml`).

## Documentation

**Primary technical and business reference:** [`SYSTEM_AUDIT_MASTER.md`](./SYSTEM_AUDIT_MASTER.md)

That file is the consolidated audit and architecture narrative for **Accounting**, **Inventory**, and **POS** (backend routes, frontend surfaces, data flows, known gaps, and recommended fix order). Prefer updating it—or app-specific READMEs below—instead of adding scattered `.md` files at the repo root.

## Apps

| App | Path | Package name | Role |
|-----|------|--------------|------|
| Tenant API | `apps/pos-backend` | `pos-backend` | REST + realtime POS, RBAC, accounting, inventory, orders |
| Studio + POS shell | `apps/pos-frontend2` | `studio-admin` | Back office (`/dashboard/*`) and staff POS (`/pos/*`) |

## Quick start

From the **Stockix repository root** (install once with the rest of the monorepo):

```bash
pnpm install
```

Run backend + Studio together from root:

```bash
pnpm dev:pos
# or only API / only UI:
pnpm dev:pos:backend
pnpm dev:pos:frontend
```

From `services/posnew` (uses root workspace via pnpm):

```bash
pnpm run dev:all
```

Production build (frontend):

```bash
pnpm build:pos
# or from this directory:
pnpm run build:all
```

Typecheck (selected packages):

```bash
pnpm run typecheck
```

Backend **unit tests** and **staff seat-cap selftest** (MongoDB) are documented in [`apps/pos-backend/README.md`](./apps/pos-backend/README.md#testing).

```bash
pnpm test:pos
```

## Environment

- **Backend:** See `apps/pos-backend/.env.example` and configure MongoDB, JWT, and any payment or print workers you use.
- **Studio / POS:** Point the browser client at the API (commonly `NEXT_PUBLIC_POS_API_ORIGIN` in `apps/pos-frontend2`).

Details and risk areas (payments, GL posting, public self-order) are summarized in [`SYSTEM_AUDIT_MASTER.md`](./SYSTEM_AUDIT_MASTER.md).
