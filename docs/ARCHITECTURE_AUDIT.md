# Architecture Audit

Date: Thursday, May 21, 2026

## 1. Monorepo Overview

| Item | Value |
|------|-------|
| Type | **Turborepo** (`turbo.json`, turbo `^2.9.7`) — not Nx |
| Package manager | **pnpm** `9.15.9` (`packageManager` in root `package.json`) |
| Node version | **`>=20.9.0`** (root `engines`); finance sub-repo allows `>=18 <=22` |
| TypeScript | **5.9.2** at root; shared presets in `packages/typescript-config` (`base.json`, `nextjs.json`) — **no root `tsconfig.json`** |
| Total workspaces (pnpm) | **8** — `apps/api`, `apps/dashboard`, `packages/config`, `packages/db`, `packages/ui`, `packages/shared`, `packages/eslint-config`, `packages/typescript-config` |

### Root structure (high level)

| Path | Role |
|------|------|
| `apps/` | Control-plane applications (dashboard, API) |
| `packages/` | Shared libraries and tooling for the control plane |
| `services/stockix-finance/` | **Separate Lerna monorepo** (Bigcapital/Stockix fork) — **not** listed in root `pnpm-workspace.yaml` |
| `infra/` | Docker Compose (dev/prod/tenant), Terraform, worker provisioning runtime |
| `scripts/` | Bootstrap, provisioning tests, boundary lint |
| `docs/` | Architecture and env documentation |

### Turbo pipelines

| Task | Behavior |
|------|----------|
| `build` | Depends on `^build`; outputs `.next/**`, `dist/**` |
| `dev` | Persistent, no cache |
| `lint` | Depends on `^lint` |
| `check-types` | Depends on `^check-types` |

Root scripts also orchestrate Postgres (`db:up`, `db:migrate`), worker build/run, and `concurrently` for API + dashboard + worker.

### Workspace definition (`pnpm-workspace.yaml`)

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`services/stockix-finance` is vendored and managed with **Lerna 8** + its own `pnpm` client (`lerna.json` → `packages/*`, `shared/*`).

---

## 2. Apps & Services Map

| Name | Path | Type | Framework | Port (default) | Purpose |
|------|------|------|-----------|----------------|---------|
| dashboard | `apps/dashboard` | Next.js app (App Router) | Next.js **16.2.4**, React **19.2.4** | **3000** (`next dev --port 3000`) | Owner control-plane dashboard |
| api | `apps/api` | HTTP API | **Hono 4.11** on `@hono/node-server` | **4000** (`@repo/config` `PORT` default) | Control-plane API (tenants, licenses, auth, provisioning hooks) |
| worker | `infra/worker-service` | Node worker (bundled from API `tsup`) | TypeScript | N/A (background) | Tenant Docker provisioning |
| stockix-finance (monorepo) | `services/stockix-finance` | Lerna monorepo | NestJS + React/Vite | varies | Tenant accounting runtime (fork) |
| @stockix/server | `services/stockix-finance/packages/server` | NestJS API | NestJS **10**, Express | **3000** (`process.env.PORT ?? 3000`) | Finance REST API (`/api` prefix), Swagger |
| @stockix/webapp | `services/stockix-finance/packages/webapp` | SPA | React **18.2**, **Vite 5** | **4000** (`cross-env PORT=4000 vite`) | Tenant-facing accounting UI |
| @stockix/sdk-ts | `services/stockix-finance/shared/sdk-ts` | Generated TS client | OpenAPI → `openapi-typescript` | N/A | Typed client from server Swagger |
| @stockix/utils | `services/stockix-finance/shared/bigcapital-utils` | Shared lib | tsup | N/A | Shared utilities |
| @stockix/pdf-templates | `services/stockix-finance/shared/pdf-templates` | Shared lib | tsup | N/A | PDF templates |
| @stockix/email-components | `services/stockix-finance/shared/email-components` | Shared lib | React email | N/A | Email templates |

**Note:** Finance webapp and control-plane API both default to port **4000** in local dev configs; they run in different contexts (tenant stack vs platform) but developers should avoid running both on the same host port simultaneously.

---

## 3. Shared Packages (control plane)

| Package | Purpose | Used by |
|---------|---------|---------|
| `@repo/config` | Centralized `.env` loading + Zod validation (`apiConfig`, `dashboardConfig`, `dbConfig`, `infraConfig`) | API, dashboard, worker, `@repo/db` |
| `@repo/db` | Platform **Postgres** schema via **Drizzle ORM** + migrations | API, worker |
| `@repo/shared` | Shared constants (e.g. `roles`) | API, dashboard |
| `@repo/ui` | Minimal shared React primitives (`button`, `card`, `code` only — **3 files**) | Dashboard (`transpilePackages`) |
| `@repo/eslint-config` | ESLint presets | Apps and packages |
| `@repo/typescript-config` | TS base + Next.js preset | Apps and packages |
| `packages/types` | **Does not exist** | — |

There is **no** dedicated `packages/design-system` beyond thin `@repo/ui`. The dashboard hosts the real design system locally under `apps/dashboard/components/ui/` (shadcn).

---

## 4. Deep Audit: `apps/dashboard`

| Item | Finding |
|------|---------|
| Router | **App Router** (`app/` directory, route groups `(dashboard)`, `(auth)`) |
| Next.js | **16.2.4** |
| UI | **shadcn/ui** (`components.json`, `shadcn` `^4.6.0`, **34** files in `components/ui/`) |
| Primitives | `@base-ui/react`, `lucide-react`, `cmdk`, `vaul`, `sonner` |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`, `app/globals.css` imports `shadcn/tailwind.css`) |
| Forms | **react-hook-form** + `@hookform/resolvers` + **Zod** |
| Tables | `@tanstack/react-table` |
| State | **No Redux/Zustand**; server state via route handlers + client hooks; session via HTTP-only cookies |
| Shared UI package | `@repo/ui` (minimal); primary UI is local shadcn |
| Build | `next build` / `output: "standalone"` |
| Tests | Vitest |

---

## 5. Deep Audit: `apps/api`

| Item | Finding |
|------|---------|
| Framework | **Hono** (`hono` `^4.11.4`) with `@hono/node-server` |
| API style | **REST** (large `index.ts` route surface + modular `routes/auth`, `routes/jobs`) |
| Auth | **JWT sessions** via `jose`; HTTP-only `stockix-session` cookie; optional API keys; RBAC middleware (`@repo/shared/roles`) |
| Database | **Drizzle ORM** + **Postgres** through `@repo/db` |
| Other DB tooling | `knex` / `mysql2` present at root for finance/tenant integration paths |
| Build | **tsup** → `dist/`; separate worker bundle (`tsup.worker.config.ts`) |
| Validation | **Zod** |
| Port | `apiConfig.port` → env `PORT` default **4000** |

---

## 6. Finance Sub-Repo (`services/stockix-finance`)

### 6.1 Finance Server (`packages/server`)

| Item | Finding |
|------|---------|
| Framework | **NestJS 10** (`@nestjs/common/core` `^10.0.0`) |
| HTTP | Express (`@nestjs/platform-express`), global prefix **`/api`** |
| API docs | **Swagger** at `/swagger` (`@nestjs/swagger`) |
| Database | **MySQL** (`mysql`, `mysql2`) |
| ORM / query | **Knex 3** + **Objection 3** (not Prisma/Drizzle) |
| Auth | **Passport** — JWT (`passport-jwt`, `@nestjs/jwt`), local, Google OAuth, API key (`passport-headerapikey`); guards in `modules/Auth` |
| Jobs | Bull / BullMQ, Redis |
| Multi-tenancy | Dedicated modules: `Tenancy`, `TenantDBManager`, tenant/system CLI migrations |
| Key modules (sample of **80+** under `src/modules/`) | Accounts, Auth, Banking*, Bills, Customers, Vendors, SaleInvoices, SaleEstimates, SaleReceipts, CreditNotes, Expenses, Items, Inventory*, FinancialStatements, Ledger, TaxRates, Warehouses, StripePayment, Plaid, Subscription, License, Organization, UsersModule, Pdf, Mail, S3, Socket, Dashboard, Import/Export, … |

### 6.2 Finance Webapp (`packages/webapp`) — critical

| Item | Current |
|------|---------|
| React version | **18.2.0** |
| Build tool | **Vite 5.1.6** (`@vitejs/plugin-react`, legacy plugin) |
| UI Library | **Blueprint.js v4** (`@blueprintjs/core` `^4.20.2` + datetime, select, table, popover2, timezone, colors) |
| UI Library version | Core **4.20.x** family |
| Files using `@blueprintjs/core` | **914** `.tsx` + **6** `.ts` = **920** files |
| Files using any `@blueprintjs/*` | **927** files |
| Tailwind | **No** (not in `package.json`) |
| CSS approach | **SCSS** (`@/style/App.scss`), **styled-components** (**286** files), **@emotion/react**, **theme-ui**, **basscss** |
| State management | **Redux** + **@reduxjs/toolkit** (**196** files); **react-query v3** (**65** files) |
| Routing | **react-router-dom v5** + `history` 4.x (**213** files) |
| Forms | **Formik** + **Yup** (**418** files mention formik); **@blueprintjs-formik/** bridges (**14** files) |
| Tables / data grids | **react-table v7**, custom `Datatable` components, **react-virtualized**; `@blueprintjs/table` in deps but **0** direct imports found |
| Rich text | **TipTap** |
| Total `.tsx` files under `src/` | **2624** |
| Total `.ts` files under `src/` | **273** |
| Source layout | **342** files in `components/`, **2198** in `containers/` |
| Dev port | **4000** |

**Confirmed not used (in `package.json` only):** Ant Design, MUI, Radix, shadcn, Tailwind.

Entry: `src/components/App.tsx` — React Router v5, react-query `QueryClientProvider`, lazy-loaded dashboard and auth routes.

---

## 7. shadcn/ui Migration Analysis

### 7.1 Current UI library

**Blueprint.js v4** is the primary UI system, deeply integrated:

| Metric | Count |
|--------|------:|
| Files importing `@blueprintjs/core` | 920 |
| Files importing any `@blueprintjs/*` | 927 |
| Share of TS/TSX source files | ~32% direct Blueprint core usage (920 / 2897) |

Supporting UI stacks that must move with any migration: **styled-components** (286 files), **Formik** (418), **Blueprint-Formik** (14), **SCSS/global Blueprint classes** (`Classes.*` used in **296** import sites).

### Top 20 Blueprint `@blueprintjs/core` symbols (import frequency)

| Component / symbol | Usage count | shadcn equivalent | Effort |
|--------------------|------------:|-------------------|--------|
| Intent | 531 | Variants on Button/Badge/Alert | medium (semantic mapping) |
| Button | 318 | Button | trivial |
| Classes | 296 | Tailwind utilities / cn() | high (layout-wide) |
| Position | 162 | Radix positioning props | medium |
| MenuItem | 159 | DropdownMenuItem | low |
| Menu | 116 | DropdownMenu | low |
| NavbarGroup | 91 | Custom layout / Sidebar | high |
| Alert | 84 | AlertDialog / Alert | low |
| Popover | 83 | Popover | low |
| PopoverInteractionKind | 67 | Popover `modal` behavior | medium |
| NavbarDivider | 66 | Separator | trivial |
| FormGroup | 62 | Field + Label | low |
| Alignment | 45 | flex utilities | trivial |
| Tab | 45 | Tabs | low |
| MenuDivider | 43 | DropdownMenuSeparator | trivial |
| Tag | 42 | Badge | trivial |
| ControlGroup | 42 | InputGroup | medium |
| Text | 41 | `<p>` / typography | trivial |
| Spinner | 37 | Loader / custom | low |
| Tabs | 30 | Tabs | low |

Additional packages: `@blueprintjs/select` (15 files), `@blueprintjs/popover2` (13), `@blueprintjs/datetime` (10), `@blueprintjs-formik/*` (14).

### 7.2 What migration would require

| Area | Assessment |
|------|------------|
| Files touched (full replacement) | **900–2600+** (all Blueprint + styled-components + Formik form layouts) |
| Tailwind prerequisite | **Must install** — not present today |
| CSS Modules | Minimal; **SCSS + styled-components + global Blueprint classes** dominate |
| 1:1 shadcn mapping | **Partial** — buttons, dialogs, menus, tabs map well |
| No shadcn equivalent / custom build | **Financial datatables** (react-table + custom cells), **Blueprint Navbar shell**, **Intent color system**, **drawer-heavy CRUD**, **TipTap**, **react-virtualized** grids, **Stripe/Plaid** embeds, **PDF preview** flows |
| Form layer | Formik → react-hook-form is a **separate migration** from component swap |
| State | Redux store can remain, but container/form coupling will churn |

### 7.3 Migration effort estimate

**VERY HIGH** — thousands of source files, ~920 direct Blueprint consumers, accounting-specific grids and drawers, and no Tailwind foundation. A full UI swap is a **multi-quarter** program, not a dependency upgrade.

### 7.4 Migration strategy options

| Option | Effort | Risk | Recommended? |
|--------|--------|------|:------------:|
| **A — Full replacement** | **52–78 weeks** (1–2 senior FE) | **High** — regression surface across all accounting modules | No |
| **B — Incremental page-by-page** | **30–52 weeks** for high-traffic areas; **12–18+ months** for full parity | **Low–Medium** per PR if scoped | **Yes** |
| **C — New frontend (Next + shadcn)** | **52–104 weeks** to replicate feature parity | **Medium** (API stable via Swagger/SDK) | Long-term alternative |
| **D — Shell only** | **2–4 weeks** | **Low** | No (cosmetic; internals stay Blueprint) |

### Recommendation

**Choose Option B — incremental page-by-page migration.**

The finance webapp is too large and too entangled with Blueprint, Formik, and styled-components for a big-bang rewrite (Option A) or a short shell swap (Option D). Option C is architecturally clean and aligns with the control-plane stack, but duplicating **2600+** TSX screens against a full accounting product is a **12–24 month** parallel product effort—only viable with a dedicated frontend team and explicit parity roadmap. Option B lets tenants keep using the current product while you introduce Tailwind + shadcn on **new** or **low-risk** surfaces first, then attack high-complexity modules (financial statements, banking, inventory grids) last.

**Practical guardrails for Option B:**

1. Add Tailwind + shadcn to `packages/webapp` in isolation (no global CSS collision — use a prefixed wrapper or route-level scope).
2. Migrate **authentication** and **settings/preferences** first (fewer grid dependencies).
3. Extract a thin **layout shell** (sidebar/topbar) to shadcn; keep container internals on Blueprint until touched.
4. Pair UI migration with **Formik → react-hook-form** only per screen, not repo-wide.
5. Keep `@stockix/sdk-ts` as the contract if you later pivot toward Option C for specific modules.

### If migrating — suggested order

1. Install Tailwind CSS (with prefix strategy to avoid SCSS conflicts).
2. Install shadcn/ui and shared tokens aligned with `apps/dashboard` where branding should match.
3. Replace layout/shell (sidebar, nav, topbar) first.
4. Replace page by page, starting with auth → settings → simple CRUD lists.
5. Tackle financial statement tables and banking last.
6. Remove Blueprint packages only when **zero** imports remain (expect final cleanup phase of several weeks).

---

## 8. Open Questions For Decision

1. Is the goal to modernize the existing Bigcapital UI in place, or eventually replace it with a Next.js tenant app aligned with the control plane?
2. Are there paying tenants on the current finance UI who would be disrupted by visual or workflow changes during migration?
3. What is the timeline pressure (cosmetic refresh vs full design-system unification vs new features)?
4. Is the finance webapp white-labeled per tenant (custom branding), which would affect token/theming strategy for shadcn?
5. Will migration include **Formik → react-hook-form**, or only visual components (doubles scope if deferred)?
6. Should `@repo/ui` be expanded into a real shared design system for **both** dashboard and finance, or keep finance styling isolated until cutover?

---

## Appendix: Commands & file evidence

Audit performed read-only against the repository on May 21, 2026. Key counts produced via PowerShell `Select-String` over `services/stockix-finance/packages/webapp/src`. Blueprint symbol counts derived from parsing `import { … } from '@blueprintjs/core'` statements across **920** files.

Root `package.json` engines: `"node": ">=20.9.0"`. Finance `packages/webapp/package.json` dev server: `"dev": "cross-env PORT=4000 vite"`. Finance server `main.ts`: `app.setGlobalPrefix('/api')`, Swagger at `/swagger`, listen `process.env.PORT ?? 3000`.
