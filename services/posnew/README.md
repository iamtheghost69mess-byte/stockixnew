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

### Testing

**Full catalog** of `npm run test:*` scripts (unit, SaaS integration, RBAC, inventory, accounting, platform, and more): [`apps/pos-backend/README.md#testing`](./apps/pos-backend/README.md#testing).

| From Stockix root | From `services/posnew/` | What |
|-------------------|-------------------------|------|
| `pnpm test:pos` | — | Backend unit + OpenAPI contracts (`pos-backend` `npm test`) |
| `pnpm --filter pos-backend test:saas-integration` | `pnpm run test:saas-integration` | SaaS / multi-tenant integration selftest |
| `pnpm --filter pos-backend test:inventory:http-smoke` | `pnpm run test:inventory:http-smoke` | Inventory HTTP smoke (API must be running) |
| `pnpm --filter pos-backend test:accounting:mandatory` | `pnpm run test:accounting:mandatory` | Accounting mandatory automated slice |
| — | `pnpm run test:printer-phases` | Printer phase bash checks |
| — | `pnpm run test:printers` | Fake printer harness |
| — | `pnpm run test:qa-checklist` | Zerowix QA checklist selftest |

```bash
# Common: fast unit suite from repo root
pnpm test:pos

# SaaS integration (MongoDB; see pos-backend README for REDIS_URL / env tips)
pnpm --filter pos-backend test:saas-integration
```

## Environment

- **Backend:** See `apps/pos-backend/.env.example` and configure MongoDB, JWT, and any payment or print workers you use.
- **Studio / POS:** Point the browser client at the API (commonly `NEXT_PUBLIC_POS_API_ORIGIN` in `apps/pos-frontend2`).

Details and risk areas (payments, GL posting, public self-order) are summarized in [`SYSTEM_AUDIT_MASTER.md`](./SYSTEM_AUDIT_MASTER.md).
