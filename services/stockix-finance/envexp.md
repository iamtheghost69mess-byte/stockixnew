# Environment & DB Credentials Report

Generated: read-only audit (no config changes).

---

## STEP 1 — `.env` files found

Searched repo (excluding `node_modules`, `.git`):

| Path | Type |
|------|------|
| `.env` | **exists** (repo root) |
| `services/stockix-finance/.env` | **exists** |
| `infra/prod/.env` | **exists** |
| `services/stockix-finance/packages/server/.env` | **missing** |
| `apps/api/.env` | **missing** |

**Examples only (no secrets):**

- `apps/api/.env.example`
- `apps/dashboard/.env.example`
- `services/stockix-finance/.env.example`
- `services/stockix-finance/packages/server/.env.example`
- `services/stockix-finance/packages/webapp/.env.example`
- `infra/prod/.env.example`

No `.env.local` or `.env.production` files found in the scoped search.

---

## STEP 2 — Root `.env` (DB-related, passwords masked)

```
DB_WAIT_TIMEOUT_MS=90000
DB_CLIENT=
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_CHARSET=
SYSTEM_DB_CLIENT=
SYSTEM_DB_HOST=
SYSTEM_DB_USER=
SYSTEM_DB_PASSWORD=
SYSTEM_DB_NAME=stockix_system
SYSTEM_DB_CHARSET=
TENANT_DB_NAME_PREFIX=stockix_tenant_
TENANT_DB_NAME_PERFIX=stockix_tenant_
TENANT_DB_HOST=
TENANT_DB_USER=
TENANT_DB_PASSWORD=
TENANT_DB_CHARSET=
DATABASE_URL=postgresql://postgres:pos***@127.0.0.1:54330/stockix_platform
PORT=4000
MONGODB_DATABASE_URL=mongodb://mongo/stockix
```

**Note:** Root `.env` is oriented toward the **Stockix platform** (Postgres `DATABASE_URL`, `stockix_system` name) but **MySQL fields are mostly empty**.

---

## STEP 2b — `services/stockix-finance/.env` (DB-related, masked)

```
DB_HOST=localhost
DB_USER=bigcapital
DB_PASSWORD=big***
DB_ROOT_PASSWORD=roo***
DB_CHARSET=utf8
DB_PORT=3306
SYSTEM_DB_NAME=bigcapital_system
TENANT_DB_NAME_PERFIX=bigcapital_tenant_
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
QUEUE_HOST=localhost
QUEUE_PORT=6379
GOTENBERG_HOST_PORT=9001
```

This file has the **complete MariaDB credentials** used by local finance/docker-compose.

---

## STEP 3 — How stockix-finance loads env

### Migrate CLI script (`packages/server/package.json`)

```json
"cli:system:migrate:latest": "ts-node -r tsconfig-paths/register src/cli.ts system:migrate:latest"
```

### NestJS config

| Module | `envFilePath` | Loads `.env` file? |
|--------|---------------|-------------------|
| [`App.module.ts`](packages/server/src/modules/App/App.module.ts) | `'.env'` | Yes — **relative to process CWD** |
| [`CLI.module.ts`](packages/server/src/modules/CLI/CLI.module.ts) | **not set** | **No** — only `load: config` + `process.env` |

[`system-database.ts`](packages/server/src/common/config/system-database.ts) resolves:

- `host` → `SYSTEM_DB_HOST` || `DB_HOST`
- `user` → `SYSTEM_DB_USER` || `DB_USER`
- `password` → `SYSTEM_DB_PASSWORD` || `DB_PASSWORD`
- `databaseName` → `SYSTEM_DB_NAME` || `DB_NAME`

### `main.ts`

Uses `process.env.PORT` only; no direct dotenv import (relies on Nest `ConfigModule` when app boots).

---

## STEP 4 — docker-compose and `.env`

[`services/stockix-finance/docker-compose.yml`](docker-compose.yml):

- Uses `${DB_USER}`, `${DB_PASSWORD}`, `${DB_ROOT_PASSWORD}`, `${SYSTEM_DB_NAME}` from **shell environment**
- Docker Compose automatically loads **`services/stockix-finance/.env`** when you run compose from that directory
- No explicit `env_file:` key — implicit `.env` in compose project directory

[`docker-compose.prod.yml`](docker-compose.prod.yml): same pattern — `${DB_USER}`, `${DB_PASSWORD}`, etc.

---

## STEP 5 — Running MariaDB (`stockix-finance-mariadb-1`)

```text
Database
bigcapital_system
information_schema
mysql
performance_schema
```

---

## STEP 6 — MariaDB users

```text
User        Host
bigcapital  %
root        %
root        localhost
```

---

## FINAL REPORT

### 1. Where is the `.env` file the project actually uses?

| Context | File used |
|---------|-----------|
| **Docker Compose** (mariadb) | `services/stockix-finance/.env` (auto-loaded when compose runs from that folder) |
| **Nest HTTP server** (`nest start` from `packages/server`) | `packages/server/.env` — **file does not exist**; would need to be created or CWD/env vars set |
| **CLI migrations** (`npm run cli:system:migrate:latest` from `packages/server`) | **No `.env` file loaded** — `CLI.module` has no `envFilePath`; only `process.env` → explains `user ''` error |
| **Monorepo platform** (API, worker, dashboard) | Repo root `.env` (Postgres / platform vars) |

**There is no single `.env` for the whole monorepo.** Finance MySQL creds live in `services/stockix-finance/.env`, not at repo root and not in `packages/server/.env`.

### 2. DB_HOST, DB_USER, SYSTEM_DB_NAME (passwords masked)

| Source | DB_HOST | DB_USER | DB_PASSWORD | SYSTEM_DB_NAME |
|--------|---------|---------|-------------|----------------|
| **Root `.env`** | *(empty)* | *(empty)* | *(empty)* | `stockix_system` |
| **`services/stockix-finance/.env`** | `localhost` | `bigcapital` | `big***` | `bigcapital_system` |
| **Running MariaDB** | `localhost:3306` | `bigcapital` / `root` | `big***` / `roo***` | `bigcapital_system` exists |

### 3. Does the finance server load from root `.env` or its own?

- **Not from repo root `.env`** (and root MySQL fields are empty anyway).
- **Intended:** `packages/server/.env` per `App.module` `envFilePath: '.env'`.
- **Actual credentials on disk:** `services/stockix-finance/.env` (used by Docker Compose, not auto-loaded by CLI).
- **Migrations CLI:** does **not** load any `.env` file unless you export vars or add `envFilePath` / copy `.env`.

### 4. What databases exist in the running MariaDB?

- `bigcapital_system` (application system DB)
- `information_schema`, `mysql`, `performance_schema` (system)

### 5. What users exist in MariaDB?

- `bigcapital` @ `%`
- `root` @ `%` and `localhost`

---

## Why `cli:system:migrate:latest` failed

```
ER_ACCESS_DENIED_ERROR: Access denied for user ''@'172.20.0.1' (using password: NO)
```

`npm run cli:system:migrate:latest` was run from `packages/server/` with:

- No `packages/server/.env`
- `CLI.module` not loading `services/stockix-finance/.env`
- Empty `DB_USER` / `DB_PASSWORD` in `process.env`

### Recommended fix (pick one)

1. **Copy env file:**
   ```powershell
   Copy-Item services\stockix-finance\.env services\stockix-finance\packages\server\.env
   ```
   Then re-run migrate from `packages/server`.

2. **Run from finance root with env injected:**
   ```powershell
   cd services\stockix-finance
   Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
   cd packages\server
   npm run cli:system:migrate:latest
   ```

3. **Add `envFilePath` to `CLI.module.ts`** (code change — not done in this audit).

---

## Name mismatch note

| Location | `SYSTEM_DB_NAME` |
|----------|------------------|
| Root `.env` | `stockix_system` |
| `services/stockix-finance/.env` | `bigcapital_system` |
| MariaDB (actual) | `bigcapital_system` |

Finance/docker stack uses **`bigcapital_system`**. Root `.env` `stockix_system` is for a different (platform) stack.
