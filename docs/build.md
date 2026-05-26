# Monorepo Dev Loop / Fast Refresh / Watcher Audit

**Repository:** `stockixnew` (pnpm workspaces + Turborepo)  
**Audit date:** 2026-05-26  
**Platform observed:** Windows 10 (`win32`), PowerShell  
**Primary symptom:** Console spam while idle:

```txt
[Fast Refresh] rebuilding
[Fast Refresh] done in XXXXms
```

This document traces **actual** scripts, outputs, and dependency paths in this repo. It separates **true file-watcher loops** from **expected monorepo HMR**, **misattributed logs**, and **platform noise**.

---

## A. Root Cause Summary

There is **no single committed “infinite loop” script** that rebuilds Next.js forever. The behavior comes from a **stack of overlapping dev processes** and **monorepo-linked source trees**, amplified on Windows:

| Rank | Cause | Loop? | Idle impact |
|------|--------|-------|-------------|
| 1 | **`pnpm dev` runs three Next.js dev servers** (dashboard, POS UI, PMS UI) via `concurrently` — Fast Refresh logs are **not prefixed** by app name | Misleading | High (looks constant) |
| 2 | **Workspace packages watched as source** (`@repo/config`, `@repo/shared`, `@repo/ui` paths) — any save anywhere in those trees recompiles every consumer | Expected HMR | Medium if IDE auto-saves / format-on-save |
| 3 | **Worker bundle output under `infra/worker-service/.runtime/`** with **content-hashed chunks** on each `tsup` run (`clean: true`) — noisy in git; **can** trigger watchers if misconfigured | Conditional | Low at idle unless something rebuilds worker repeatedly |
| 4 | **Legacy / orphan artifacts** (`.tmp-worker/`, `.tmp-dist/`) inside the repo, **not gitignored** — documented in `docs/duplications.md` | Historical | Low unless a tool still writes there |
| 5 | **Turbopack HMR noise** when `STOCKIX_NEXT_TURBOPACK=1` — Next.js itself notes spurious “BUILDING” / rebuild reporting | Benign noise | Medium if Turbopack enabled |
| 6 | **On-demand route compilation** (App Router) when the browser hits new routes — looks like “rebuilding” during navigation, not only on save | Expected | Medium while clicking around |
| 7 | **Windows filesystem watchers** (Defender, indexing, pnpm symlinks) — extra change events | Environmental | Variable |

**Most likely explanation for “idle” spam:** logs from **POS** (`localhost:3001`) or **PMS UI** (`localhost:3004`) interleaved with **dashboard** (`localhost:3000`), plus **background IDE** touching shared packages or `.env`, not a dashboard↔worker circular compile loop.

**True circular loop (possible but requires misconfiguration):**

```txt
tsup infra:worker:build (clean + new chunk hashes)
  → writes infra/worker-service/.runtime/*.js
  → Next/webpack watch sees change (if .runtime not ignored)
  → [Fast Refresh] rebuilding
  → (only if something re-triggers tsup — NOT default in pnpm dev)
```

Default `pnpm dev` runs the worker **once** as `node infra/worker-service/.runtime/worker.js` (no watch). Worker **does not** rewrite `.runtime` at runtime.

---

## B. Files Causing Rebuilds

### B.1 Files that legitimately trigger dashboard Fast Refresh

| Path | Why |
|------|-----|
| `apps/dashboard/app/**` | App Router pages, layouts, route handlers |
| `apps/dashboard/components/**` | UI |
| `apps/dashboard/lib/**`, `hooks/**`, `proxy.ts` | App code |
| `packages/config/src/**` | Imported as `@repo/config`, `@repo/config/public` |
| `packages/shared/src/**` | `@repo/shared/roles`, `permissions`, etc. |
| `packages/ui/src/**` | Declared dependency (`@repo/ui`); **0 current imports** but still resolvable / may be pulled by tooling |

### B.2 Generated / runtime artifacts (should NOT trigger HMR if ignored)

| Path | Generator | Rewritten when | Gitignored? |
|------|-----------|----------------|-------------|
| `apps/dashboard/.next/**` | `next dev` | Every compile | Yes (`.next/`) |
| `apps/dashboard/.next/dev/types/**` | Next typed routes | Route discovery | Under `.next/` |
| `infra/worker-service/.runtime/worker.js` (+ `.map`) | `pnpm infra:worker:build` → `apps/api/tsup.worker.config.ts` | Each worker build (`clean: true`) | **No** |
| `infra/worker-service/.runtime/chunk-*.js` | tsup code-splitting | Each worker build (new hashes) | **No** |
| `infra/worker-service/.runtime/add-accounting-module-runtime-*.js` | tsup dynamic import chunks | Each worker build | **No** |
| `apps/api/.tmp-worker/worker.js` | Legacy / mistaken cwd build | Unknown (orphan) | **No** |
| `apps/api/apps/api/.tmp-worker/worker.js` | Nested duplicate orphan | Unknown | **No** |
| `infra/worker-service/.tmp-dist/**` | Older tsc/tsup experiment | Manual builds | **No** |
| `packages/auth/dist/**` | `pnpm --filter @repo/auth build` | Dev startup (`dev-stockix`, `dev-pos-stack`) | Yes (`dist` in root gitignore) |
| `apps/api/dist/**` | `tsup` production build | `pnpm build` | Yes |
| `.turbo/**` | Turborepo | Task runs | Yes |

**Git status evidence (worker churn):** after `infra:worker:build`, git shows deleted old hashed chunks and new ones, e.g. `chunk-OZPPGGSF.js` → `chunk-SLIFFDPO.js`, plus `worker.js` modified.

### B.3 Files that do **not** feed dashboard but confuse audits

| Path | Notes |
|------|--------|
| `services/posnew/**` | Separate Next on port 3001 — own Fast Refresh stream |
| `services/pms/frontend/**` | Separate Next on port 3004 |
| `services/stockix-finance/packages/webapp/**` | Vite app — **not** started by `pnpm dev` |
| `~/.stockix/tenants/**` (default `TENANT_ENV_ROOT` on Windows) | Worker writes tenant env outside repo |
| `/opt/stockix/traefik-dynamic/**` (default `TRAEFIK_DYNAMIC_DIR`) | Worker Traefik YAML — outside repo unless overridden in `.env` |

---

## C. Processes Involved

### C.1 `pnpm dev` process tree (`scripts/dev-stockix.mjs`)

**Startup (sequential):**

1. `pnpm db:up` / `db:wait` / `db:migrate`
2. `pnpm --filter @repo/auth build` → writes `packages/auth/dist`
3. `pnpm infra:worker:build` → writes `infra/worker-service/.runtime/*`

**Runtime (`concurrently`):**

| Label | Command | Watcher | Writes artifacts? |
|-------|---------|---------|-------------------|
| `api` | `tsx watch src/index.ts` in `apps/api` | `apps/api/src/**` | No (in-memory restart) |
| `dash` | `node scripts/dev-next.mjs` → `next dev` (webpack default) | Dashboard + linked workspace sources | Yes (`.next/`) |
| `worker` | `node infra/worker-service/.runtime/worker.js` | None | No (unless provisioning to in-repo paths) |
| `pos` | `dev-pos-stack.mjs` → nodemon + `next dev` | POS backend + POS frontend | POS `.next/` |
| `pms` | `tsx watch` in `services/pms` | PMS API sources | No |
| `pms-ui` | `next dev` in `services/pms/frontend` | PMS UI | PMS `.next/` |

### C.2 Other dev entrypoints

| Script | Processes |
|--------|-----------|
| `pnpm dev:apps` | `turbo run dev --filter=dashboard --filter=api` (no worker/POS/PMS) |
| `pnpm dev:pos` | `@repo/auth build` + pos-backend nodemon + pos `next dev` |
| `pnpm dev:pms:stack` | api + pms + pms-ui |

### C.3 Worker generation flow (full chain)

```txt
pnpm infra:worker:build
  → pnpm --filter api exec tsup --config tsup.worker.config.ts
  → apps/api/tsup.worker.config.ts
       entry: ../../infra/worker-service/src/worker.ts
       outDir: ../../infra/worker-service/.runtime
       clean: true
       sourcemap: true
       bundles: apps/api/src/* (license, mail, etc.) via relative imports
  → infra/worker-service/.runtime/worker.js (+ hashed chunks)

pnpm dev (worker lane)
  → node infra/worker-service/.runtime/worker.js
  → polls DB / HTTP API every 1500ms (no file writes at idle)
  → on provision: may write ~/.stockix/tenants, Traefik dir (config-dependent)
```

Config reference:

```7:15:apps/api/tsup.worker.config.ts
export default defineConfig({
  entry: ["../../infra/worker-service/src/worker.ts"],
  format: ["esm"],
  outDir: "../../infra/worker-service/.runtime",
  target: "node20",
  bundle: true,
  sourcemap: true,
  clean: true,
```

---

## D. Circular Dependency Chains

### D.1 **Not present by default** (dashboard ↔ worker)

```txt
tsx watch (api) ──► restarts Node ──X──► does not write .runtime
worker (node)     ──► DB/API only  ──X──► does not run tsup
next (dashboard)  ──► .next only   ──X──► does not run tsup
```

### D.2 **Possible loop if misconfigured**

```txt
[watch] infra/worker-service/.runtime/**   (accidental include)
    ↓
tsup / IDE / script rebuilds worker
    ↓
.runtime/*.js mtime changes
    ↓
Next Fast Refresh
    ↓
(only loops if step 1 re-triggers tsup — not stock dev)
```

### D.3 **Shared-package fan-out** (expected, not a bug)

```txt
Edit packages/shared/src/permissions.ts
    ↓
apps/dashboard (Fast Refresh)
services/pms/frontend (if importing shared — verify per app)
apps/api via tsx watch (restart, not Fast Refresh)
```

### D.4 **Turbo build graph** (production / `turbo build`, not `dev`)

```19:23:turbo.json
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", ".runtime/**"]
    },
```

- `globalDependencies`: `.env`, `.env.local` — **any** root env change invalidates Turbo **build** cache across packages.
- `dev` task: `cache: false`, `persistent: true` — no Turbo cache loop during dev.

---

## E. Misconfigured Watchers

| Location | Issue | Severity |
|----------|--------|----------|
| `apps/dashboard/next.config.ts` | No `webpack.watchOptions.ignored` for `infra/**`, `apps/api/**`, `.runtime`, `.tmp-worker` | Medium |
| `apps/dashboard/next.config.ts` | `outputFileTracingRoot: repoRoot` — affects **standalone** tracing, not primary HMR; increases monorepo awareness for production builds | Low (dev) |
| `services/posnew/apps/pos-frontend2/next.config.mjs` | `experimental.externalDir: true` — widens file watching outside app dir | Medium for POS |
| `scripts/dev-next.mjs` | Default **webpack** (`STOCKIX_NEXT_TURBOPACK≠1`) — good for Windows stability | OK |
| `turbo.json` | `.runtime/**` as build output but **not** in `.gitignore` | Git noise, not dev loop |
| Root `.gitignore` | Missing `.runtime/`, `.tmp-worker/`, `.tmp-dist/`, `infra/worker-service/.runtime/` | High (git + accidental watches) |
| `apps/dashboard/tsconfig.json` | Includes `.next/dev/types/**/*.ts` — correct for Next 15+ typed routes; ensure watchers exclude `.next` (Next default) | Low |
| `concurrently` in `dev-stockix.mjs` | No per-process log prefix for Next HMR lines | High (observability) |
| `pos-backend/nodemon.json` | Watches `workers/`, `migrations/`, etc. — isolated from dashboard | OK |

---

## F. Performance Bottlenecks (slow `[Fast Refresh] done in XXXXms`)

| Factor | Detail |
|--------|--------|
| **Large App Router surface** | 70+ `app/**` files; on-demand compilation per route (see `apps/dashboard/.next/dev/logs/next-development.log`: multi-second gaps between `/login`, `/`, `/api/*`) |
| **Monorepo resolution** | React dedupe aliases scan `repoRoot/node_modules` (`realpathSync` in `next.config.ts`) |
| **`transpilePackages`** | `@base-ui/react`, `react-hook-form`, `@hookform/resolvers` |
| **`optimizePackageImports`** | lucide-react, etc. — helps prod, still work at dev compile |
| **Many parallel dev servers** | CPU contention from 3× Next + 3× tsx watch/nodemon |
| **Windows I/O** | Slower file events vs Linux; consider `WATCHPACK_POLLING=true` for diagnosis |
| **Full reload events** | Log shows `Fast Refresh had to perform a full reload` — boundary/export mixing (see Next docs) |

---

## G. Recommended Fixes (prioritized)

### Immediate (today)

1. **Isolate which app logs Fast Refresh** — run only dashboard:
   ```powershell
   pnpm dev:apps
   # or
   node scripts/dev-next.mjs
   ```
   If spam stops, cause was POS/PMS Next instances.

2. **Add watcher ignores** to `apps/dashboard/next.config.ts` (see § H).

3. **Extend `.gitignore`** for runtime artifacts (see § I).

4. **Do not run `infra:worker:build` in a watch loop** while Next is running unless you accept a one-time HMR blip.

5. **Windows diagnosis:**
   ```powershell
   $env:WATCHPACK_POLLING="true"
   pnpm dev:apps
   ```
   If loop stops, use polling or exclude repo from Defender real-time scan.

6. **Disable Turbopack on dashboard** unless needed (already default via `dev-next.mjs`).

### Short-term (this week)

7. **Prefix concurrently output** or split terminals per service.

8. **Delete orphan artifacts:** `apps/api/.tmp-worker/`, `apps/api/apps/api/.tmp-worker/`, `infra/worker-service/.tmp-dist/` (after confirming no script references).

9. **Document worker rebuild** in README (already in `docs/PROVISIONING_REFERENCE.md`): after worker code changes → `pnpm infra:worker:build` + restart worker lane.

10. **Verify `.env` is not auto-synced** into repo during dev (`pnpm env:sync-*` scripts) while Turbo build tasks run.

### Architectural (longer)

11. **Extract worker-shared code** from `apps/api/src` into `packages/provisioning` (see `docs/ARCHITECTURE_DEBT_AUDIT.md`) — smaller bundles, clearer boundaries.

12. **Stable worker outDir** — disable hashed chunk filenames for dev or emit to `dist/worker/` outside app trees.

13. **Reduce concurrent Next apps** in default `pnpm dev` — opt-in POS/PMS UI flags.

---

## H. Exact Config Changes

### H.1 `apps/dashboard/next.config.ts` — ignore non-frontend paths

```typescript
import path from "node:path";
// ... existing imports ...

const repoRoot = path.join(dashboardDir, "..", "..");

const nextConfig: NextConfig = {
  // ... existing config ...
  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      config.resolve ??= {};
      config.resolve.alias = { ...config.resolve.alias, ...reactAliases };
    }
    if (dev) {
      config.watchOptions ??= {};
      const ignored = config.watchOptions.ignored;
      const extraIgnored = [
        path.join(repoRoot, "infra/worker-service/.runtime"),
        path.join(repoRoot, "infra/worker-service/.tmp-dist"),
        path.join(repoRoot, "apps/api"),
        path.join(repoRoot, "apps/api/.tmp-worker"),
        path.join(repoRoot, "services"),
        path.join(repoRoot, ".turbo"),
        path.join(repoRoot, ".claude-flow"),
      ];
      config.watchOptions.ignored = Array.isArray(ignored)
        ? [...ignored, ...extraIgnored]
        : [ignored, ...extraIgnored].filter(Boolean);
    }
    return config;
  },
};
```

### H.2 Root `.gitignore` additions

```gitignore
# Worker / API runtime bundles (not source)
infra/worker-service/.runtime/
infra/worker-service/.tmp-dist/
**/.tmp-worker/
apps/api/dist/
```

### H.3 `apps/api/tsup.worker.config.ts` — optional dev-stable output

For fewer hashed renames when rebuilding worker:

```typescript
export default defineConfig({
  // ...
  splitting: false, // optional: single worker.js, stable filename
  // clean: true,   // keep for prod; consider clean: false in dev-only config
});
```

### H.4 `scripts/dev-stockix.mjs` — clearer logs (optional)

Use concurrently `--prefix` / `--prefix-colors` or separate terminals:

```javascript
const concurrentlyArgs = [
  "-n", "api,dash,worker,pos,pms,pms-ui",
  "-c", "blue,cyan,magenta,green,yellow",
  "--prefix", "[{name}]",
  // ...
];
```

Note: Next’s `[Fast Refresh]` lines still come from the browser/Next process unless you wrap `next dev` with a logger.

### H.5 POS frontend — narrow `externalDir` impact

If POS Fast Refresh is the noisy one, set `NEXT_TURBOPACK_ROOT` only in Docker (already conditional in `next.config.mjs`) and avoid pointing it at monorepo root on local dev.

---

## I. Safe Ignore Paths

Folders that should be **excluded from webpack/Turbopack watch** (dashboard):

```
infra/worker-service/.runtime/
infra/worker-service/.tmp-dist/
apps/api/
apps/api/.tmp-worker/
apps/api/dist/
services/          # entire subtree unless dashboard imports (it should not)
packages/auth/dist/
.turbo/
.next/             # Next excludes by default
node_modules/      # default
.git/
coverage/
.stockix/          # if ever inside repo
**/*.log
```

POS/PMS Next apps should ignore each other’s trees and `infra/worker-service/.runtime/`.

---

## J. Long-Term Architecture Recommendations

1. **Single “platform UI” dev command** — `pnpm dev:apps` as default; POS/PMS behind `STOCKIX_DEV_POS=1` / `STOCKIX_DEV_PMS_UI=1`.

2. **Runtime output contract**
   - Source: `infra/worker-service/src/`
   - Build: `infra/worker-service/dist/` or `out/worker.js` (gitignored)
   - Never commit `.runtime` hashed chunks.

3. **Shared libraries**
   - Keep `@repo/shared` / `@repo/config` as TypeScript source (current pattern).
   - Build `@repo/auth` to `dist` only for CJS consumers (POS); dashboard should not need auth package if unused.

4. **Worker decoupling** — move mail/license helpers to `packages/platform-worker` so worker tsup does not bundle half of `apps/api`.

5. **CI guard** — `git status --porcelain` after `infra:worker:build` must not show tracked files under `.runtime/`.

6. **Document Windows** — README note for Defender exclusions or `WATCHPACK_POLLING`.

---

## 1. Severity Assessment

| Area | Level | Notes |
|------|-------|-------|
| Overall dev loop | **Medium** | Annoying, rarely data-corrupting |
| True infinite compile loop | **Low** (default dev) | Not reproduced from static analysis |
| Misconfigured in-repo Traefik/tenant paths | **High** if `.env` points into repo | Can cause real write→watch loops during provisioning |
| Git hygiene (`.runtime` tracked) | **Medium** | Accidental commits, confusing diffs |

---

## 2. Production Impact Assessment

| Topic | Impact |
|-------|--------|
| Fast Refresh / HMR | **None** — dev-only |
| Worker `.runtime` bundle | **Production** uses built worker in Docker/infra — correct |
| `output: "standalone"` + `outputFileTracingRoot` | **Production** — intentional for Docker |
| Turbo `globalDependencies` on `.env` | **CI/production builds** — env change invalidates cache (desired) |

---

## 3. Dev Experience Assessment

- **Default `pnpm dev` is heavy:** 6 processes, 3 Next apps — high CPU and interleaved logs.
- **Dashboard webpack default** is the right choice on Windows (`scripts/dev-next.mjs`).
- **Worker requires manual rebuild** after changes — easy to mistake for “stale” behavior (documented, not a refresh loop).
- **Missing gitignore** on worker output creates false alarms in `git status`.

---

## 4. Recommended Immediate Fixes

1. Run `pnpm dev:apps` to confirm which app produces Fast Refresh spam.  
2. Add webpack `watchOptions.ignored` to dashboard (§ H.1).  
3. Gitignore `.runtime/`, `.tmp-worker/`, `.tmp-dist/` (§ H.2).  
4. Remove orphan `apps/api/**/.tmp-worker` directories.  
5. Ensure `TRAEFIK_DYNAMIC_DIR` and `TENANT_ENV_ROOT` are **outside** the repo in local `.env`.  
6. Try `WATCHPACK_POLLING=true` on Windows if idle events persist.

---

## 5. Recommended Architectural Fixes

1. Opt-in secondary Next apps in `dev-stockix.mjs`.  
2. Relocate worker bundle to gitignored `dist/` with stable filenames.  
3. Extract `apps/api` imports from worker into a shared package.  
4. Add CI check: no tracked files under `infra/worker-service/.runtime/`.  
5. Align with `docs/duplications.md` cleanup (`.tmp-worker`, `.restore-backup`).

---

## Appendix: Quick reference commands

| Goal | Command |
|------|---------|
| Dashboard + API only | `pnpm dev:apps` |
| Skip POS/PMS in full dev | `STOCKIX_DEV_SKIP_POS=1 pnpm dev` |
| Rebuild worker after code change | `pnpm infra:worker:build` then restart worker lane |
| Worker + build | `pnpm infra:worker:dev` |
| Check unstable generated files | `git status --short` |
| POS only | `pnpm dev:pos` |

---

## Appendix: Key file index

| File | Role |
|------|------|
| `scripts/dev-stockix.mjs` | Full stack orchestrator |
| `scripts/dev-next.mjs` | Dashboard Next (webpack default) |
| `scripts/dev-api.mjs` | `tsx watch` API |
| `scripts/dev-pos-stack.mjs` | POS nodemon + Next |
| `scripts/dev-pms-frontend.mjs` | PMS tenant Next |
| `apps/api/tsup.worker.config.ts` | Worker bundle → `.runtime` |
| `apps/dashboard/next.config.ts` | Standalone + React dedupe |
| `turbo.json` | Build outputs include `.runtime/**` |
| `docs/duplications.md` | `.tmp-worker` cleanup notes |
| `docs/PROVISIONING_REFERENCE.md` | Worker rebuild procedure |

---

*This audit is based on repository static analysis and existing dev logs. To pinpoint a live loop, run with `WATCHPACK_POLLING` / single-app dev and use OS-level file monitors (e.g. Process Monitor on Windows) on the first path that changes at idle.*
