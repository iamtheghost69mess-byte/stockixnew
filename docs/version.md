# Debug: pnpm + Node.js version conflicts and errors

Read-only audit of the Stockix monorepo toolchain. Run every block, read output carefully, and **do not fix anything** until the exact error is identified.

---

## Audit summary (2026-05-30)

| Field | Value |
|-------|-------|
| **Node version installed** | `v22.22.0` (first on PATH — Cursor bundled) |
| **Node version (nvm4w active)** | `v20.19.0` at `C:\nvm4w\nodejs\node.exe` |
| **Node version required** | `>=20.9.0` (root `package.json` `engines.node`) |
| **pnpm version installed** | `9.15.9` |
| **pnpm version required** | `pnpm@9.15.9` (`packageManager` field) |
| **Lockfile version** | `9.0` (`pnpm-lock.yaml`) |
| **OS / platform** | Windows NT 10.0.26200 (Win32) |
| **`pnpm install`** | **SUCCESS** — lockfile up to date, no engine errors |
| **`pnpm dev`** | **STARTED** — dev script ran, stack URLs printed |
| **Exact error message** | None during this audit |
| **Which command fails** | N/A (both succeeded) |
| **Version mismatch found** | **YES — latent risks** (see findings below) |
| **Lockfile mismatch** | **NO** — lockfile v9.0 matches pnpm 9.15.9 |
| **Engine mismatch (main repo)** | **NO** — Node 22 and pnpm 9.15.9 satisfy root `engines` |
| **Missing node_modules** | **NO** — present with `.pnpm` store |

### Critical findings (no fixes applied)

1. **Dual Node on PATH (Windows / Cursor)**  
   `where node` resolves **Cursor's bundled Node first** (`v22.22.0`), while **nvm4w** reports current `v20.19.0`. Shell scripts and `pnpm` hooks may use different Node binaries depending on how the terminal was launched. This is the highest-risk Windows-specific issue (category **D**).

2. **Nested services outside the pnpm workspace**  
   `services/chatlive` and `services/stockix-finance` are **not** listed in `pnpm-workspace.yaml`. They declare their own `engines` / `packageManager` and can conflict if installed from the wrong directory:

   | Path | `engines.node` | `engines.pnpm` | `packageManager` | `.nvmrc` |
   |------|----------------|----------------|------------------|----------|
   | Root | `>=20.9.0` | — | `pnpm@9.15.9` | none |
   | `services/stockix-finance` | `>=20.0.0` | — | `pnpm@9.15.9` | `18.16.1` ⚠️ |
   | `services/chatlive` | `24.x` | `10.x` | `pnpm@10.2.0` | `24.13.0` |

3. **`engine-strict=true`** in root `.npmrc` — any workspace package with incompatible `engines` will hard-fail install.

4. **patch-package warning** (non-fatal): `next@16.2.3` patch applied to `next@16.2.6` in `services/posnew/apps/pos-frontend2`.

---

## STEP 1 — READ CURRENT VERSIONS

### Bash (Linux / macOS / WSL)

```bash
echo "=== NODE VERSION ==="
node --version

echo ""
echo "=== NPM VERSION ==="
npm --version

echo ""
echo "=== PNPM VERSION ==="
pnpm --version

echo ""
echo "=== NODE PATH ==="
which node

echo ""
echo "=== PNPM PATH ==="
which pnpm

echo ""
echo "=== NVM / NODE VERSION MANAGER ==="
nvm --version 2>/dev/null || echo "nvm not found"
nvm current 2>/dev/null || echo "nvm not active"
cat ~/.nvmrc 2>/dev/null || echo "no ~/.nvmrc"
cat .nvmrc 2>/dev/null || echo "no .nvmrc in project root"
cat .node-version 2>/dev/null || echo "no .node-version file"
```

### PowerShell (Windows — used for this audit)

```powershell
node --version
npm --version
pnpm --version
(Get-Command node).Source
(Get-Command pnpm).Source
nvm version
nvm current
where.exe node
where.exe pnpm
```

### Results (this machine)

```
NODE:  v22.22.0
NPM:   10.8.2
PNPM:  9.15.9

NODE PATH:  c:\Users\Jad\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
PNPM PATH:  C:\nvm4w\nodejs\pnpm.ps1

NVM (nvm4w): 1.2.2, current v22.22.0
nvm4w node.exe: v20.19.0

where node:
  c:\Users\Jad\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe  ← FIRST
  C:\nvm4w\nodejs\node.exe

where pnpm:
  C:\nvm4w\nodejs\pnpm
  C:\nvm4w\nodejs\pnpm.CMD
  C:\Users\Jad\AppData\Roaming\npm\pnpm
  C:\Users\Jad\AppData\Roaming\npm\pnpm.cmd

Root .nvmrc:        none
Root .node-version: none
services/chatlive/.nvmrc:        24.13.0
services/stockix-finance/.nvmrc: 18.16.1
```

---

## STEP 2 — READ WHAT THE PROJECT REQUIRES

### Commands

```bash
grep -A 10 '"engines"\|"packageManager"' package.json | head -20
grep -A 5 '"engines"' apps/api/package.json
grep -A 5 '"engines"' apps/dashboard/package.json
grep -A 5 '"engines"' infra/worker-service/package.json
grep -A 5 '"engines"' services/pms/package.json
grep -A 5 '"engines"' services/stockix-finance/package.json
```

### Root `package.json`

```json
"engines": { "node": ">=20.9.0" },
"packageManager": "pnpm@9.15.9"
```

### Workspace packages with explicit `engines`

Only these `package.json` files declare `engines.node` (others inherit root via hoisting / no field):

| File | `engines.node` | `packageManager` |
|------|----------------|------------------|
| `package.json` | `>=20.9.0` | `pnpm@9.15.9` |
| `services/stockix-finance/package.json` | `>=20.0.0` | `pnpm@9.15.9` |
| `services/chatlive/package.json` | `24.x` | `pnpm@10.2.0` (+ `engines.pnpm: 10.x`) |
| `services/posnew/package.json` | — | `pnpm@9.15.9` |

`apps/api`, `apps/dashboard`, `infra/worker-service`, and `services/pms` have **no** local `engines` field.

---

## STEP 3 — CHECK `.npmrc` FOR VERSION SETTINGS

### Root `.npmrc`

```
engine-strict=true
fund=false
audit=true
save-exact=true
confirm-modules-purge=false
public-hoist-pattern[]=*react
public-hoist-pattern[]=*react-dom
```

### Other `.npmrc` files

| Path | Notable settings |
|------|------------------|
| `services/posnew/.npmrc` | `legacy-peer-deps=true` |
| `services/stockix-finance/.npmrc` | `legacy-peer-deps=true`, `node-linker=hoisted` |
| `apps/dashboard/.npmrc` | none |
| `apps/api/.npmrc` | none |

`engine-strict=true` means npm/pnpm will **reject** installs when the active Node/pnpm version does not satisfy `engines`.

---

## STEP 4 — CHECK PNPM WORKSPACE CONFIG

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/pms"
  - "services/pms/frontend"
  - "services/posnew"
  - "services/posnew/apps/pos-backend"
  - "services/posnew/apps/pos-frontend2"
  - "services/posnew/packages/ui"
  - "services/posnew/packages/domain-access"
  - "services/posnew/packages/platform-api"
```

**Not in workspace:** `services/chatlive`, `services/stockix-finance` (separate nested monorepos).

### Root `pnpm` settings (excerpt)

Overrides for React 19, Zod, Hono, Next security pins, etc. — see `package.json` `"pnpm".overrides`.

### Lockfile

```
lockfileVersion: '9.0'
```

### pnpm store

```
C:\Users\Jad\AppData\Local\pnpm\store\v3
```

Lockfile v9.0 is produced by **pnpm 9.x**. Installed pnpm **9.15.9** — compatible.

---

## STEP 5 — FIND THE ACTUAL ERROR

### `pnpm install` (captured output)

```
Scope: all 19 workspace projects
Lockfile is up to date, resolution step is skipped
Packages: +5
...
services/posnew/apps/pos-frontend2 postinstall: Warning: patch-package detected a patch file version mismatch
  Patch file created for next@16.2.3 applied to next@16.2.6
...
Done in 1m 16.5s using pnpm v9.15.9
```

No `EBADENGINE`, no lockfile frozen/outdated errors.

### `pnpm dev` (captured output)

```
> node scripts/dev-stockix.mjs
[dev] Clearing stale dev port listeners…
[dev] Stockix local stack
  Dashboard   http://127.0.0.1:3000
  API         http://127.0.0.1:4000
  ...
[dev] Postgres + migrations…
```

Dev server started; no version-related failure observed within the capture window.

---

## STEP 6 — ALL `packageManager` / `engines` ACROSS REPO

### `packageManager` field

| File | Value |
|------|-------|
| `package.json` | `pnpm@9.15.9` |
| `services/posnew/package.json` | `pnpm@9.15.9` |
| `services/stockix-finance/package.json` | `pnpm@9.15.9` |
| `services/chatlive/package.json` | `pnpm@10.2.0+sha512.…` |

### `engines.node`

| File | Value |
|------|-------|
| `package.json` | `>=20.9.0` |
| `services/stockix-finance/package.json` | `>=20.0.0` |
| `services/chatlive/package.json` | `24.x` |

### `engines.pnpm`

| File | Value |
|------|-------|
| `services/chatlive/package.json` | `10.x` |

---

## STEP 7 — CHECK `node_modules` STATE

| Check | Result |
|-------|--------|
| `node_modules` exists | YES |
| Top-level entries | ~30 (hoisted layout) |
| `node_modules/.pnpm` | YES |
| `node_modules/.modules.yaml` | YES (hoistPattern: `*`) |

### Critical packages (root hoisted)

| Package | Version |
|---------|---------|
| `react` | 19.2.4 |
| `typescript` | 5.9.2 |
| `drizzle-orm` | 0.45.2 |
| `zod` | 3.25.76 |
| `next` | NOT at root (workspace package dep) |
| `hono` | NOT at root (workspace package dep) |

---

## STEP 8 — LOCKFILE VERSION CONFLICTS

```
lockfileVersion: '9.0'
```

| Check | Result |
|-------|--------|
| Lockfile vs installed pnpm | **Match** (9.0 ↔ pnpm 9.15.9) |
| Multiple Node refs in lockfile | Normal peer/metadata entries only |
| Frozen / outdated lockfile | **No** — "Lockfile is up to date" |

---

## STEP 9 — CHECK TURBO

| Item | Value |
|------|-------|
| Installed turbo | `2.9.14` |
| Declared in root | `"turbo": "^2.9.14"` |
| `turbo.json` | Standard pipeline: `build`, `lint`, `check-types`, `dev` |

No turbo-specific Node engine conflict observed.

---

## STEP 10 — WINDOWS-SPECIFIC ISSUES

| Check | Result |
|-------|--------|
| OS | Windows NT 10.0.26200 |
| WSL | N/A (native Windows shell) |
| Node source split | **YES** — Cursor Node v22 first; nvm4w Node v20 second |
| pnpm source | nvm4w (`C:\nvm4w\nodejs\pnpm.ps1`) |
| Multiple pnpm installs | nvm4w + `%AppData%\Roaming\npm\pnpm` |

### Likely failure modes on this setup

| Code | Scenario |
|------|----------|
| **A** | Node too old — unlikely (22 ≥ 20.9) unless someone switches to stockix-finance `.nvmrc` (18.16.1) |
| **B** | pnpm mismatch — unlikely at root (9.15.9 matches); **will fail** in `services/chatlive` (needs pnpm 10.x) |
| **C** | Lockfile mismatch — **not observed** |
| **D** | Windows PATH using wrong Node — **observed risk** (Cursor vs nvm4w) |
| **E** | Corrupt `node_modules` — **not observed** |
| **F** | `.npmrc` blocking — `engine-strict=true` will hard-fail on engine violations |

---

## STEP 11 — FULL ERROR CAPTURE (when something fails)

Re-run with verbose reporters and paste **exact** output:

```bash
pnpm install --reporter=verbose 2>&1 | head -80
pnpm dev 2>&1 | head -80
grep -A 30 '"scripts"' package.json | head -40
```

PowerShell equivalent:

```powershell
pnpm install --reporter=verbose 2>&1 | Select-Object -First 80
pnpm dev 2>&1 | Select-Object -First 80
```

---

## WHAT TO REPORT (template)

Fill this in after running all blocks on the failing machine:

```
Node version installed:    [x.x.x]
Node version required:     [from engines field]
pnpm version installed:    [x.x.x]
pnpm version required:     [from packageManager field]
Lockfile version:          [x]
OS/Platform:               [Windows/WSL/Mac/Linux]
Exact error message:       [paste here — full text, not summary]
Which command fails:       [pnpm install / pnpm dev / other]
Which file causes it:      [package.json path]
Version mismatch found:    YES/NO
  Expected: [x.x.x]
  Got:      [x.x.x]
Lockfile mismatch:         YES/NO
Engine mismatch:           YES/NO
Missing node_modules:      YES/NO
```

---

## CRITICAL RULES

- Run every block and read output carefully.
- **Do NOT fix anything yet — audit only.**
- The error is ONE of these:
  - **A)** Node version too old or too new for `engines` field
  - **B)** pnpm version mismatch with `packageManager` field
  - **C)** Lockfile created by different pnpm version
  - **D)** WSL2 / Windows using wrong Node or pnpm binary (PATH order)
  - **E)** `node_modules` corrupted or missing
  - **F)** `.npmrc` settings blocking install (`engine-strict`, `legacy-peer-deps`, etc.)
- Paste the **exact** error message — not a summary.
- Report **all** version numbers found.
- Always run commands from the **repo root** unless debugging a nested monorepo (`services/chatlive`, `services/stockix-finance`).
- On Windows, run `where node` and `where pnpm` **before** trusting `node --version`.

---

## Quick reference — canonical versions for main Stockix workspace

```
Node:  >=20.9.0  (22.x or 20.19+ both OK)
pnpm:  9.15.9   (Corepack: corepack enable && corepack prepare pnpm@9.15.9 --activate)
```

Verify alignment:

```powershell
node --version          # expect >= v20.9.0
pnpm --version          # expect 9.15.9
pnpm install            # expect no EBADENGINE
```
