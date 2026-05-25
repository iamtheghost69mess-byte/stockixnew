# File Structure & Duplication Audit
Date: Monday May 25, 2026
Mode: Read-only

---

## Repo structure (high level)

```
stockixnew/
├── apps/
│   ├── api/              # Backend API (no UI)
│   └── dashboard/        # Next.js 16 admin app (full shadcn stack)
├── packages/
│   ├── auth/             # JWT / product tokens (@repo/auth)
│   ├── config/           # Shared config
│   ├── db/               # Drizzle schema + migrations
│   ├── eslint-config/
│   ├── shared/           # roles, audit-log, finance-api (@repo/shared)
│   ├── typescript-config/
│   └── ui/               # Turbo starter only (3 demo components)
├── services/
│   ├── pms/              # PMS API + minimal Next frontend
│   ├── posnew/           # Nested POS monorepo (own packages/ui + shadcn)
│   ├── chatlive/
│   ├── stockix-finance/
│   └── pmsfull/          # Legacy (gitignored)
└── [root .bak files, .claude/, .claude-flow/, .swarm/, .tmp-worker/, .restore-backup/]
```

**pnpm workspace members:** `apps/*`, `packages/*`, `services/pms`, `services/pms/frontend`  
(`services/posnew` is a separate nested workspace, not in root `pnpm-workspace.yaml`)

---

## 1. Shadcn/UI Status

### Where shadcn components live

| Location | Component count | Who imports it |
|----------|-----------------|----------------|
| `packages/ui/src` | 3 (`button`, `card`, `code`) | **Nobody** — Turbo create-turbo demo stubs |
| `apps/dashboard/components/ui` | 34 | Dashboard only (`@/components/ui/*`) |
| `services/pms/frontend/components/ui` | 0 | N/A — no shadcn in PMS frontend |
| `services/posnew/apps/pos-frontend2/src/components/ui` | 11 | POS frontend only |
| `services/posnew/packages/ui/src/components/ui` | 1 (`textarea`) | POS package (partial) |

### Is `packages/ui` actually shared?

**Answer: NO**

- Declared in `apps/dashboard/package.json` as `@repo/ui` and listed in `next.config.ts` `transpilePackages`.
- **Zero** `import … from "@repo/ui"` statements in dashboard source.
- Contents are Turbo boilerplate (`Button` with `alert()`, `Card` with utm links), not shadcn.

### Are dashboard and PMS using their own copies?

**Answer: Partially — they are separate stacks, not duplicate shadcn**

| App | UI approach |
|-----|-------------|
| Dashboard | Full shadcn v4 (`base-nova`), local `components/ui/`, `components.json` at `apps/dashboard/components.json` |
| PMS frontend | Custom CSS (`app/globals.css`), no Tailwind, no shadcn, only `components/logo.tsx` |
| POS (`posnew`) | Own shadcn copy under `pos-frontend2/src/components/ui/` plus `services/posnew/packages/ui` |

Dashboard `button.tsx` and `packages/ui/src/button.tsx` are **different files** (demo vs real shadcn).  
Dashboard `button.tsx` and POS `button.tsx` share 10 component **names** but **different file hashes** (not byte-identical).

### Verdict

**C) Dashboard has its own full shadcn copy AND `packages/ui` exists as unused Turbo stubs — duplication / dead dependency**

Additional note: **`services/posnew` is a third shadcn island** (10 overlapping component names with dashboard, separate implementations).

### Recommendation

1. **Pick one path for root monorepo UI:**
   - **Option A (preferred):** Move dashboard `components/ui/*` into `packages/ui`, export via `@repo/ui`, update dashboard imports. Remove Turbo demo components.
   - **Option B:** Delete `@repo/ui` from dashboard `package.json` / `next.config.ts` and remove `packages/ui` if not needed.
2. **Do not merge PMS frontend into shadcn yet** — it uses a different design system (custom dark theme CSS). Consolidate only if PMS is migrated to Tailwind/shadcn.
3. **POS (`posnew`):** Treat as out-of-scope for root `packages/ui` unless POS is folded into the main workspace; document as known parallel UI package.

---

## 2. Next.js Convention Files (error / loading / not-found)

| File | Locations | Identical content? | Should be shared? |
|------|-----------|--------------------|-------------------|
| `error.tsx` | 12 under `apps/dashboard` only; **none** in `services/pms/frontend` | **Partially** — see below | Thin wrappers: yes (already DRY) |
| `loading.tsx` | 12 under `apps/dashboard` only | **Partially** — see below | Thin wrappers: yes (already DRY) |
| `not-found.tsx` | 4 under `apps/dashboard` only | Not compared byte-for-byte | Per-route: acceptable |
| `layout.tsx` | 4 (3 dashboard + 1 PMS) | N/A (always app-specific) | **No** — by design |

### Dashboard `error.tsx` detail

| Group | Count | Content |
|-------|-------|---------|
| Segment wrappers → `RouteError` | 8 | Identical 13-line files re-exporting `@/components/route-error` |
| Root `app/error.tsx` | 1 | **Different** — inline Alert UI, not `RouteError` |
| `app/(dashboard)/licenses/[id]/error.tsx` | 1 | Same wrapper as segment group |
| `app/(dashboard)/tenants/[id]/…` | 2 | Same wrapper pattern |

### Dashboard `loading.tsx` detail

| Group | Count | Content |
|-------|-------|---------|
| Segment wrappers → `RouteLoading` | 8 | Identical 5-line files |
| Root `app/loading.tsx` | 1 | **Different** — full-screen spinner (not `RouteLoading`) |
| Dynamic segment loaders | 3 | Same `RouteLoading` wrapper |

**PMS frontend:** No `error.tsx`, `loading.tsx`, or `not-found.tsx` (minimal app shell).

### Recommendation

- **Accept** per-route `error.tsx` / `loading.tsx` **files** (Next.js App Router requirement).
- **Already good:** Shared implementations in `components/route-error.tsx` and `components/route-loading.tsx`.
- **Optional cleanup:** Generate segment files from a single template or a codemod — low priority.
- **Consider:** Align root `app/error.tsx` with `RouteError` for consistent UX.
- **PMS:** Add `error.tsx` / `loading.tsx` when the app grows; no duplication issue today.

---

## 3. Truly Duplicated Files (identical content)

| Files | Content | Action |
|-------|---------|--------|
| 8× `apps/dashboard/app/(dashboard)/*/error.tsx` (api-keys, audit-log, licenses, owners, plans, settings, tenants, parent `error.tsx`) | Thin wrapper: `export default … <RouteError …>` | **Accept** — required per segment; logic is centralized |
| 8× matching `loading.tsx` in same routes | Thin wrapper: `export default … <RouteLoading />` | **Accept** — same pattern |
| `apps/dashboard/components/logo.tsx` vs `services/pms/frontend/components/logo.tsx` | Same SVG paths; PMS adds `aria-hidden` only | **Move** to `packages/ui` or `packages/shared` asset export |
| `packages/ui/src/button.tsx` vs `apps/dashboard/components/ui/button.tsx` | **Not duplicates** (demo vs shadcn) | Remove dead `packages/ui` demo or replace with real shadcn |
| ~50 API `route.ts` files under `apps/dashboard/app/api/**` | Hash collision group — likely minimal stubs / similar structure | Review individually if consolidating API layout |

No byte-identical shadcn component copies were found between dashboard and PMS (PMS has no shadcn).  
Dashboard vs POS `button.tsx`: **different hashes** (similar purpose, different implementations).

---

## 4. Components That Should Be Shared But Aren't

| Component | Dashboard | PMS frontend | Should move to |
|-----------|-----------|--------------|----------------|
| `Logo` | ✅ `components/logo.tsx` | ✅ `components/logo.tsx` (near-identical) | `packages/ui` or shared assets |
| shadcn `components/ui/*` (34) | ✅ local | ❌ | `packages/ui` (if consolidating) |
| `RouteError` / `RouteLoading` | ✅ shared within dashboard | ❌ | Keep in dashboard until PMS adopts same stack |
| `data-table.tsx` | ✅ `components/data-table.tsx` | ❌ | Dashboard-only for now |
| `login-form.tsx` | ✅ | ❌ (no login UI in PMS frontend) | Dashboard-only |
| Sidebar shell | ✅ `app-sidebar.tsx` + `ui/sidebar.tsx` | ❌ | N/A — PMS uses inline layout in `app/layout.tsx` |
| Toast | ✅ `reusabletoast.tsx` + `ui/sonner.tsx` | ❌ | Dashboard-only |

**PMS frontend** is intentionally minimal (7 `app/` pages, 1 component file, custom CSS). Duplication with dashboard is **low** except `logo.tsx`.

---

## 5. Tailwind Config — Single Source?

| File | Status |
|------|--------|
| `apps/dashboard/postcss.config.mjs` + `app/globals.css` | Tailwind v4 via `@import "tailwindcss"` + `shadcn/tailwind.css` — **no** `tailwind.config.*` |
| `services/pms/frontend/app/globals.css` | **No Tailwind** — hand-written CSS variables |
| `services/chatlive/tailwind.config.js` | Separate Ruby/JS app |
| `services/stockix-finance/.../tailwind.config.js` | PDF/email templates only |

### Is there a shared Tailwind preset?

**Answer: NO**

### Recommendation

- Introduce `packages/ui` (or `packages/tailwind-config`) with shared `@theme` / CSS variables **only if** PMS or POS are migrated to the same design tokens.
- Until then, dashboard and PMS **should stay different** (shadcn vs custom dark theme).

---

## 6. `.bak` Files — Should Delete

| File | Present | Action |
|------|---------|--------|
| `docker-compose.prod.yml.bak` | ✅ | **DELETE** |
| `Dockerfile.server.bak` | ✅ | **DELETE** |
| `Dockerfile.webapp.bak` | ✅ | **DELETE** |
| `package.server.bak.json` | ✅ | **DELETE** |
| `package.webapp.bak.json` | ✅ | **DELETE** |

All five root backup files exist. No exceptions.

---

## 7. Hidden Folders Status

| Folder | Purpose | In `.gitignore` | Tracked in git | Action |
|--------|---------|-----------------|----------------|--------|
| `.claude` | Cursor / Claude Code agents, skills, hooks | **NO** | **YES** (~277 files) | **Keep** if intentional team AI config; otherwise trim |
| `.claude-flow` | claude-flow runtime config + metrics | Partial (`.claude-flow/.gitignore` only) | **YES** (8 files) | Keep config; **gitignore** `daemon.pid`, `logs/`, `sessions/` |
| `.swarm` | Multi-agent swarm config | **NO** | **YES** (2 files) | Keep or gitignore per team policy |
| `.tmp-worker` | Build worker artifacts (`worker.js`, `.map`) | **NO** | **YES** (2 files) | **Add to `.gitignore`** + untrack |
| `.restore-backup` | Old `.env.local` backups (pms, pmsfull) | **NO** | **YES** (3 files) | **Delete folder** + **gitignore** |

---

## 8. `packages/ui` — Is It Actually Used?

**Exported** (via `package.json` `"exports": { "./*": "./src/*.tsx" }`):

- `button.tsx` — Turbo demo (`alert(appName)`)
- `card.tsx` — Turbo demo (external link card)
- `code.tsx` — Turbo demo

**Imported by:**

| Consumer | Imports `@repo/ui`? |
|----------|---------------------|
| `apps/dashboard` | Declared in `package.json` only — **0 source imports** |
| `apps/api` | No |
| `services/pms/frontend` | No |
| `services/pms` (API) | No |

### `@repo/shared` (for comparison — **actively used**)

| Export path | Used by |
|-------------|---------|
| `./roles` | `apps/api`, `apps/dashboard/lib/roles.ts` |
| `./audit-log` | `apps/api` |
| `./finance-api` | `apps/api`, tests |

### `@repo/auth` (for comparison — **actively used**)

| Consumer | Usage |
|----------|-------|
| `apps/api` | `StockixModule`, product tokens |
| `services/pms` | `createHonoAuthMiddleware`, `StockixTokenPayload` |

### Verdict: **UNUSED** (dead workspace dependency)

**Dead exports:** All three `packages/ui` components.  
**Dead dependency:** `@repo/ui` in dashboard `package.json` / `next.config.ts`.

---

## 9. Utility / lib / hooks duplication

| Artifact | Dashboard | PMS frontend | Notes |
|----------|-----------|--------------|-------|
| `lib/utils.ts` (cn) | ✅ | ❌ | Single copy |
| `lib/api-client.ts` | ✅ | ❌ | Dashboard-only |
| `lib/pms-client.ts` | ❌ | ✅ | PMS-specific |
| `lib/roles.ts` | ✅ re-exports `@repo/shared/roles` | ❌ | Good shared pattern |
| `hooks/` directory | ❌ none | ❌ none | — |
| `types.ts` | ❌ (only under `apps/api`) | ❌ | No cross-app dup |

---

## 10. Component counts

| Scope | `.tsx` count |
|-------|----------------|
| `packages/ui` | 3 |
| `apps/dashboard/components` | 68 |
| `apps/dashboard/app` (pages + routes) | 70 |
| `services/pms/frontend/components` | 1 |
| `services/pms/frontend/app` | 7 |

---

## 11. Recommended Actions

### Delete immediately (no value, just noise)

- [ ] `docker-compose.prod.yml.bak`
- [ ] `Dockerfile.server.bak`
- [ ] `Dockerfile.webapp.bak`
- [ ] `package.server.bak.json`
- [ ] `package.webapp.bak.json`
- [ ] `.restore-backup/` folder (contains stale `.env.local` copies)
- [ ] `.tmp-worker/` contents (`worker.js`, `worker.js.map`)

### Consolidate shadcn (dashboard ↔ root `packages/ui`)

- [ ] Either migrate `apps/dashboard/components/ui/*` → `packages/ui` and import `@repo/ui/button`, etc.
- [ ] Or remove `@repo/ui` from dashboard and delete/repurpose `packages/ui` Turbo stubs
- [ ] Do **not** duplicate effort into PMS frontend until it adopts Tailwind/shadcn

### Add to `.gitignore`

- [ ] `.tmp-worker/`
- [ ] `.restore-backup/`
- [ ] `.claude-flow/daemon.pid`, `.claude-flow/logs/`, `.claude-flow/sessions/` (runtime noise)

### Move to shared package

- [ ] `logo.tsx` → `packages/ui` or shared brand asset (dashboard + PMS frontend)

### Accept as-is (justified duplication)

- [ ] Per-segment `error.tsx` / `loading.tsx` files in dashboard (Next.js convention; bodies delegate to `RouteError` / `RouteLoading`)
- [ ] `layout.tsx` per app / route group — different shells
- [ ] PMS custom CSS vs dashboard shadcn — different products / maturity levels
- [ ] `services/posnew` separate UI package — nested product workspace
- [ ] Root `app/loading.tsx` vs segment loaders — different UX (full-screen vs skeleton)

---

## 12. Summary Score

| Category | Status |
|----------|--------|
| Shadcn shared | ❌ **Duplicated / dead package** — dashboard local copy; `packages/ui` unused |
| Next.js convention files | ⚠️ **Partial** — many files, but DRY via `RouteError` / `RouteLoading` |
| Utility files | ✅ **Good** — little duplication; `@repo/shared` used correctly |
| Tailwind config | ⚠️ **Split stacks** — dashboard Tailwind v4 vs PMS custom CSS (intentional) |
| `.bak` files cleaned | ❌ **5 files present** |
| `.gitignore` complete | ❌ **Missing** `.tmp-worker`, `.restore-backup`; runtime logs in `.claude-flow` |

**Overall: NEEDS WORK** — primary issue is unused `packages/ui` + undeclared shadcn island in dashboard; secondary cleanup is `.bak` / tracked temp folders; PMS↔dashboard duplication is minimal by design.
