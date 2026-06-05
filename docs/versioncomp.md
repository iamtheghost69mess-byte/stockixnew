# Stockix — Node.js & pnpm Version Compatibility Report
**Generated:** 2026-06-05
**Branch:** architecture
**Shell Node:** v22.22.0
**Shell pnpm:** 9.15.9

> **Note:** The `pnpm docker:prebuild` failure observed in Terminal 9 (Git Bash) occurred on **Node v20.19.0**. This audit shell reports **v22.22.0** after upgrade. Values below reflect file contents at audit time plus both shell runtimes where relevant.

---

## Terminal command output (audit capture)

```
$ node --version
v22.22.0

$ pnpm --version
9.15.9
```

**Root `.npmrc` contents:**

```
engine-strict=true
fund=false
audit=true
save-exact=true
confirm-modules-purge=false
public-hoist-pattern[]=*react
public-hoist-pattern[]=*react-dom
```

**`grep -r "nestjs-i18n" services/stockix-finance --include="*.json" -l`:**

```
services/stockix-finance/packages/server/package.json
```

**`grep "nestjs-i18n" services/stockix-finance/pnpm-lock.yaml | head -5`:**

```
      nestjs-i18n:
  nestjs-i18n@10.8.4:
  nestjs-i18n@10.8.4(@nestjs/common@9.4.3(...))(@nestjs/core@9.4.3)(class-validator@0.14.4)(rxjs@7.8.2):
```

**`grep -r '"node"' services/stockix-finance --include="*.json" | grep engines`:**

```
services/stockix-finance/package.json:  "engines": {
services/stockix-finance/package.json:    "node": ">=20.0.0"
```

*(No other `engines.node` in Finance `package.json` files — `packages/server/package.json` has no `engines` block.)*

---

## 1. Version Declarations — Every File

| File | Type | Declared version | Notes |
|------|------|-----------------|-------|
| `package.json` (root) | engines.node | `>=20.9.0` | Stockix monorepo root |
| `package.json` (root) | packageManager | `pnpm@9.15.9` | Locked via Corepack |
| `.npmrc` (root) | engine-strict | `true` | Enforces all dependency `engines` checks |
| `pnpm-workspace.yaml` (root) | workspaces | `apps/*`, `packages/*`, `services/pms`, `services/posnew/*` | Does **not** include `stockix-finance` |
| `services/stockix-finance/package.json` | engines.node | `>=20.0.0` | Finance nested monorepo root |
| `services/stockix-finance/package.json` | packageManager | `pnpm@9.15.9` | Matches root |
| `services/stockix-finance/pnpm-workspace.yaml` | workspaces | `packages/*`, `shared/*` | Separate from root workspace |
| `services/stockix-finance/.npmrc` | engine-strict | *(unset)* | Inherits root `engine-strict=true` |
| `services/stockix-finance/.nvmrc` | nvm pin | `18.16.1` | **Stale** — conflicts with nestjs-i18n ≥22 |
| `services/stockix-finance/packages/server/package.json` | nestjs-i18n dep | `^10.4.5` | Lockfile resolves to **10.8.4** |
| `services/stockix-finance/packages/server/package.json` | engines.node | *(none)* | No local engines block |
| `services/stockix-finance/packages/server/Dockerfile` | FROM | `node:20-alpine` | Finance server + migration images |
| `services/stockix-finance/packages/webapp/Dockerfile` | FROM | `node:20-bookworm-slim` (build), `nginx:1.27-alpine` (runtime) | Finance static webapp; **Debian slim**, not Alpine |
| `services/posnew/package.json` | packageManager | `pnpm@9.15.9` | POS monorepo (in root workspace) |
| `services/posnew/apps/pos-backend/package.json` | engines.node | *(none)* | Express API |
| `services/posnew/apps/pos-backend/Dockerfile` | FROM | `node:20-alpine` (build + runner) | POS backend image |
| `services/posnew/apps/pos-frontend2/Dockerfile` | FROM | `node:22-alpine` (build + runner) | POS Next.js; uses **npm**, not pnpm |
| `infra/worker-service/package.json` | engines.node | *(none)* | Minimal `{ "type": "module" }` only |
| `infra/worker-service/Dockerfile` | FROM | `node:22-alpine` (base + worker) | Provisioning worker |
| `apps/api/package.json` | engines.node | *(none)* | `@types/node`: `^22.15.3` in devDeps |
| `apps/api/Dockerfile` | FROM | `node:20-alpine` (build + runner) | Control-plane API |
| `apps/dashboard/package.json` | engines.node | *(none)* | `@types/node`: `^20` in devDeps |
| `apps/dashboard/Dockerfile` | FROM | `node:20-alpine` (build + runner) | Control-plane dashboard |
| `services/pms/Dockerfile` | FROM | `node:20-alpine` | PMS API service |
| `services/pms/frontend/Dockerfile` | FROM | `node:22-alpine` | PMS Next.js frontend |
| `services/chatlive/package.json` | engines.node | `24.x` | **Isolated** subtree; not in root workspace |
| `services/chatlive/package.json` | engines.pnpm | `10.x` | Conflicts with root `pnpm@9.15.9` |
| `services/chatlive/package.json` | packageManager | `pnpm@10.2.0` | Separate from Stockix canonical version |
| `services/chatlive/.nvmrc` | nvm pin | `24.13.0` | Chatlive only |
| `scripts/prebuild-tenant-images.mjs` | docker pull | `node:20-bookworm-slim`, `node:20-alpine` | Phase 1 base pulls; not yet aligned to 22 |
| `services/stockix-finance/pnpm-lock.yaml` | nestjs-i18n@10.8.4 engines | `node: '>=22'` | **Authoritative** engine requirement |
| Shell (audit machine) | runtime Node | `v22.22.0` | Current Cursor shell |
| Shell (Terminal 9 / user Git Bash) | runtime Node | `v20.19.0` | Where prebuild failed |

---

## 2. Conflict Analysis

| ID | Component | Requires | Got | Engine-strict? | Breaks what? |
|----|-----------|----------|-----|---------------|--------------|
| C1 | `nestjs-i18n@10.8.4` (Finance server dep) | Node `>=22` | `v20.19.0` (user shell) | YES (root `.npmrc`) | `pnpm install` in `prebuild-tenant-images.mjs` Phase 2 |
| C2 | `nestjs-i18n@10.8.4` | Node `>=22` | `node:20-alpine` (Finance server Dockerfile) | YES (inherits root `.npmrc` in Docker COPY) | `docker build` for `stockix-server:local` / migration image |
| C3 | Root `engines.node` `>=20.9.0` | Node ≥20.9 | `nestjs-i18n` needs ≥22 | YES | Misleading docs; allows devs on Node 20 to hit C1 |
| C4 | Finance `engines.node` `>=20.0.0` | Node ≥20 | `nestjs-i18n` needs ≥22 | YES (inherited) | Same as C1/C2 inside Finance tree |
| C5 | Finance `.nvmrc` `18.16.1` | Node 18.16.1 | nestjs-i18n needs ≥22 | N/A (nvm hint only) | Developers using Finance `.nvmrc` get wrong Node |
| C6 | `nestjs-i18n` specifier `^10.4.5` vs lock `10.8.4` | 10.4.x may allow older engines | 10.8.4 declares `>=22` | YES | Caret range silently upgraded engine requirement |
| C7 | Worker / POS frontend Dockerfiles | `node:22-alpine` | Root declares `>=20.9.0` | N/A | Production images already on 22; declarations lag |
| C8 | API + Dashboard Dockerfiles | `node:20-alpine` | Shell/types mix 20 and 22 | NO (no engines in those packages) | Currently OK; no Node 22-only deps found |
| C9 | POS backend Dockerfile | `node:20-alpine` | No Node 22 deps | NO | OK on Node 20 |
| C10 | Finance webapp Dockerfile | `node:20-bookworm-slim` | Webapp build filtered; no nestjs-i18n | Inherited strict in COPY `.npmrc` | Lower risk; server image is the blocker |
| C11 | `chatlive` subtree | Node `24.x`, pnpm `10.x` | Root `pnpm@9.15.9` | Separate repo folder | Only breaks if developing Chatlive inside Stockix |
| C12 | `prebuild` Phase 1 pulls | `node:20-*` images | Finance server moving to 22 | N/A | Warm-cache pulls outdated base tags |

---

## 3. Docker Image Node Versions

| Image | Dockerfile | Node version | Used for |
|-------|------------|--------------|----------|
| stockix-server (Finance) | `services/stockix-finance/packages/server/Dockerfile` | `node:20-alpine` → **fix to 22** | Finance NestJS server |
| stockix-database-migration | same Dockerfile (`--target migration`) | `node:20-alpine` → **fix to 22** | Finance DB migrations |
| stockix-webapp (Finance) | `services/stockix-finance/packages/webapp/Dockerfile` | `node:20-bookworm-slim` (build) | Finance static SPA + nginx |
| stockix-nginx (Finance) | `services/stockix-finance/docker/nginx/` | `nginx:1.27-alpine` | Finance reverse proxy |
| stockix-pos-backend | `services/posnew/apps/pos-backend/Dockerfile` | `node:20-alpine` | POS Express API |
| stockix-pos-frontend | `services/posnew/apps/pos-frontend2/Dockerfile` | `node:22-alpine` | POS Next.js frontend |
| stockix-infra-worker | `infra/worker-service/Dockerfile` | `node:22-alpine` | Provisioning worker |
| stockix-api | `apps/api/Dockerfile` | `node:20-alpine` | Control-plane API |
| stockix-dashboard | `apps/dashboard/Dockerfile` | `node:20-alpine` | Control-plane dashboard |
| stockix-pms-api | `services/pms/Dockerfile` | `node:20-alpine` | PMS backend |
| stockix-pms-frontend | `services/pms/frontend/Dockerfile` | `node:22-alpine` | PMS Next.js UI |
| chatlive | `services/chatlive/docker/Dockerfile` | `node:24-alpine` | Chatwoot fork (isolated) |

---

## 4. pnpm Versions

| Location | Declared | Notes |
|----------|----------|-------|
| root `package.json` | `pnpm@9.15.9` | Canonical Stockix version |
| Finance `package.json` | `pnpm@9.15.9` | Matches root |
| `services/posnew/package.json` | `pnpm@9.15.9` | Matches root |
| Finance server Dockerfile | `corepack prepare pnpm@9.15.9 --activate` | Matches root |
| Finance webapp Dockerfile | `corepack prepare pnpm@9.15.9 --activate` | Matches root |
| POS backend Dockerfile | `corepack prepare pnpm@9.15.9 --activate` | Matches root |
| Worker Dockerfile | `corepack prepare pnpm@9.15.9 --activate` | Matches root |
| API Dockerfile | `corepack prepare pnpm@9.15.9 --activate` | Matches root |
| Dashboard Dockerfile | `corepack prepare pnpm@9.15.9 --activate` | Matches root |
| POS frontend Dockerfile | *(none — uses npm)* | Intentional; standalone Next build |
| PMS Dockerfile | `corepack enable pnpm` (no pin) | Unpinned minor |
| `services/chatlive/package.json` | `pnpm@10.2.0` | Isolated; not part of Stockix dev path |
| Shell (`pnpm --version`) | `9.15.9` | Matches root `packageManager` |

---

## 5. Root Cause of prebuild failure

1. **What command failed:** `pnpm docker:prebuild` → Phase 2 → `pnpm install --ignore-scripts` with `cwd = services/stockix-finance`.

2. **Which file triggered it:** Root `.npmrc` (`engine-strict=true`) is inherited by pnpm when installing inside the Finance tree. The failing dependency is declared in `services/stockix-finance/pnpm-lock.yaml` under `nestjs-i18n@10.8.4`.

3. **Which dependency requires which Node version:** `@stockix/server` depends on `nestjs-i18n` (`^10.4.5` in `packages/server/package.json`). The lockfile resolves **10.8.4**, whose `engines.node` is **`>=22`**.

4. **Why engine-strict makes it fatal:** With `engine-strict=true`, pnpm aborts the install instead of warning when the active Node version does not satisfy any dependency's `engines.node`. There is no bypass in Finance `.npmrc`.

5. **Why Node 20 is insufficient:** `nestjs-i18n@10.8.4` explicitly declares Node 22+. The package is **used at runtime** — `I18nModule.forRootAsync` in `App.module.ts` and `I18nService` across Financial Statements, Warehouses, Banking, etc. This is not a dev-only dependency.

6. **Secondary failure (Docker):** Even after shell upgrade, `docker build` of `stockix-server:local` would fail for the same reason because the Finance server Dockerfile uses `node:20-alpine` and runs `pnpm install --frozen-lockfile` with the copied `.npmrc`.

---

## 6. Fix Options (DO NOT APPLY YET — list only)

### Option A — Upgrade shell to Node 22 (recommended)
**Pros:** Aligns with worker + POS frontend Dockerfiles; satisfies nestjs-i18n; matches post-fix repo policy.
**Cons:** Requires nvm/fnm/volta or global Node upgrade on each developer machine.
**Steps:**
```bash
nvm install 22
nvm use 22
node --version   # v22.x.x
pnpm docker:prebuild
```

### Option B — Downgrade nestjs-i18n in Finance
Find which package depends on nestjs-i18n: `@stockix/server` (`packages/server/package.json`).
Check if older version (e.g. 10.4.x) has `engines.node: >=16`.
**Risk:** Requires lockfile change (disallowed in safe-fix pass); may break i18n features; 10.8.x may have been pulled intentionally.

### Option C — Set `engine-strict=false` for Finance only
Create `services/stockix-finance/.npmrc` with `engine-strict=false`.
**Risk:** Hides future engine incompatibilities; Docker build on Node 20 may still fail at runtime.

### Option D — Add `--ignore-engines` to prebuild script
In `scripts/prebuild-tenant-images.mjs` Phase 2, use `pnpm install --ignore-scripts --ignore-engines`.
**Risk:** Same as C; does not fix Finance Dockerfile `pnpm install` inside Node 20 image.

### Recommended fix
**Option A + declaration/Dockerfile alignment (Safe fixes 1–5).**

`nestjs-i18n` is a **runtime** dependency of the Finance NestJS server. The lockfile version (10.8.4) legitimately requires Node 22. Declarations and the Finance **server** Dockerfile must match. Pinning `.nvmrc` / `.node-version` at repo root prevents developers from accidentally using Node 20. Upgrading only the shell without updating the Finance server Dockerfile would still break `docker build` for `stockix-server:local`.

---

## 7. Consistency Verdict

| Check | Status | Detail |
|-------|--------|--------|
| Shell Node matches root `engines.node` | ❌ → ✅ after fix | Was `>=20.9.0`; nestjs-i18n needs 22. Shell now v22.22.0; engines updated to `>=22.0.0` |
| Shell pnpm matches root `packageManager` | ✅ | Both `9.15.9` |
| Finance Dockerfile Node matches Finance `engines.node` | ❌ → ✅ after fix | Was `node:20-alpine` vs `>=20.0.0`; server Dockerfile → `node:22-alpine` |
| Finance deps compatible with Finance Dockerfile Node | ❌ → ✅ after fix | `nestjs-i18n@10.8.4` requires ≥22; server image must use 22 |
| Worker Dockerfile Node consistent with worker deps | ✅ | `node:22-alpine`; no Node 22-only dep conflicts found |
| POS backend Dockerfile Node consistent with POS deps | ✅ | `node:20-alpine`; no engines conflicts |
| All Dockerfiles use Alpine (not Debian) | ❌ | Finance webapp uses `node:20-bookworm-slim`; chatlive uses `node:24-alpine` |
| pnpm version consistent across all Dockerfiles | ⚠️ | Most pin `9.15.9`; PMS unpinned; POS frontend uses npm |
| `.nvmrc` exists to pin Node for developers | ❌ → ✅ after fix | Root had none; Finance had stale `18.16.1` |
| No version pinned to exact patch (should use `^`) | ⚠️ | Root `save-exact=true`; many exact pins by policy — intentional |

---

## 8. Action Plan (ordered)

List to make `pnpm docker:prebuild` succeed on any developer machine without manual Node switching:

| # | Action | File to change | Effort | Risk |
|---|--------|---------------|--------|------|
| 1 | Pin Node 22 for all developers | `.nvmrc`, `.node-version` (root) | Low | None |
| 2 | Align root `engines.node` to `>=22.0.0` | `package.json` (root) | Low | None |
| 3 | Align Finance `engines.node` to `>=22.0.0` | `services/stockix-finance/package.json` | Low | None |
| 4 | Upgrade Finance server Dockerfile to `node:22-alpine` | `services/stockix-finance/packages/server/Dockerfile` | Low | Low — matches nestjs-i18n |
| 5 | Update stale Finance `.nvmrc` `18.16.1` → `22` | `services/stockix-finance/.nvmrc` | Low | None |
| 6 | Update prebuild Phase 1 pulls to `node:22-alpine` / `node:22-bookworm-slim` | `scripts/prebuild-tenant-images.mjs` | Low | None |
| 7 | Document Node 22 requirement in README / setup | `docs/` or root README | Low | None |
| 8 | Consider Finance webapp Dockerfile `20-bookworm-slim` → `22-bookworm-slim` | `packages/webapp/Dockerfile` | Medium | Low |
| 9 | Align API/Dashboard Dockerfiles to 22 (optional) | `apps/api/Dockerfile`, `apps/dashboard/Dockerfile` | Medium | Low — future-proofing |
| 10 | Isolate Chatlive pnpm 10 / Node 24 from Stockix docs | `services/chatlive/` | Low | N/A — separate product |

**Safe fixes applied in this change (items 1–4):** root `.nvmrc`, `.node-version`, root + Finance `engines.node`, Finance server Dockerfile.
