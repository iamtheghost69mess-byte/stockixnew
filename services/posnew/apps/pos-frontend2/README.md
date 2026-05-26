# studio-admin (pos-frontend2)

Next.js **App Router** app: **Studio** back office (`/dashboard/*`) and **staff POS** (`/pos/*`), plus guest flows such as **`/self-order`**. NPM workspace name is `studio-admin`; the directory is `pos-frontend2`.

## Documentation

- **Product architecture, POS vs Studio scope, payment/GL notes:** [`../../SYSTEM_AUDIT_MASTER.md`](../../SYSTEM_AUDIT_MASTER.md)

## Run locally

From the Stockix repository root (recommended):

```bash
pnpm install
pnpm dev:pos:frontend
```

Or start API + UI together: `pnpm dev:pos` or `pnpm run dev:all` from `services/posnew`.

## Configuration

- Set **`NEXT_PUBLIC_POS_API_ORIGIN`** (and any auth-related vars your deployment uses) so the browser targets the tenant API (`apps/pos-backend`).

Biome is used for lint/format (`npm run check`, `npm run check:fix`).

## Layout

- `src/app/(main)/dashboard/` — catalog, accounting, inventory, floor, RBAC, etc.
- `src/app/(main)/pos/` — floor, table session, payment/refund dialogs
- `src/lib/*-api.ts` — typed fetch helpers toward `/api/*`
