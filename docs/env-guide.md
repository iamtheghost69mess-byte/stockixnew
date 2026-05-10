# Environment Variable Guide

## Single source of truth (local)

- **Schema:** `/.env.example` (full control-plane + dashboard variables).
- **Prod compose template:** `infra/prod/.env.example`.
- **Loaded files:** repo root `.env` then `.env.local` (overrides), via `packages/config` (`dotenv`).

Run `pnpm bootstrap:env` to create `.env` from the root example. Prefer putting secrets in `.env.local` so `.env` can stay closer to defaults.

**Do not** use `apps/api/.env` or `apps/dashboard/.env` — the API and Next app load from the repo root only.

## How config works

`packages/config` loads root env and exposes typed getters (`apiConfig`, `dashboardConfig`, `env`). Application code should import `@repo/config` instead of reading `process.env` directly (exceptions below).

**Vitest:** when `VITEST=true`, automatic loading of `.env` / `.env.local` is **skipped** so tests control `process.env`. To load real root env inside a test run (rare), set `STOCKIX_LOAD_ROOT_ENV=1`.

## Exempt files (build/test tooling only)
The following use `dotenv` directly and are formally exempt:
- `scripts/load-root-env.mjs` (shared helper; same load order as `packages/config`)
- `packages/db/scripts/phase3-db-audit.mjs` (imports `loadEnvFilesAtRoot` from `scripts/load-root-env.mjs`)
- `services/stockix-finance/playwright.config.ts`
- `services/stockix-finance/packages/webapp/craco.config.js`

## Adding a New Variable
1. Add it to `/.env.example` with a comment
2. Add it to `packages/config/src/index.ts` with validation
3. Export it from the typed config object
4. Never access it via process.env directly in app code
