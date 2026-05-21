# Config / Environment Audit

**Date:** 2026-05-17  
**Scope:** Read-only audit of env files, provisioning, docker-compose, and `@repo/config`.  
**No code changes** were made to produce this report.

---

## BLOCK 1 — Every env file and what it owns

### Files found in repo (tracked `.env.example` only)

| Path | Committed? | Purpose |
|------|------------|---------|
| `.env.example` | Yes | Claims to be **canonical schema** for platform; copied to root `.env` via bootstrap |
| `apps/api/.env.example` | Yes | **Pointer only** — says API loads root `.env`, not `apps/api/.env` |
| `infra/prod/.env.example` | Yes | Production compose (`infra/prod/docker-compose.yml`) |
| `services/stockix-finance/.env.example` | Yes | Finance monorepo local dev defaults |
| `services/stockix-finance/packages/server/.env.example` | Yes | Finance **server** NestJS (`ConfigModule` → `envFilePath: '.env'`) |
| `services/stockix-finance/packages/webapp/.env.example` | Yes | Finance webapp build-time vars |

### Files **not** in git (runtime / local)

Full repo scan (`Get-ChildItem -Recurse -Filter '.env*'`, excluding `node_modules`/`.git`):

```
.env
.env.example
apps/api/.env.example
apps/dashboard/.env.example
infra/prod/.env
infra/prod/.env.example
services/stockix-finance/.env
services/stockix-finance/.env.example
services/stockix-finance/packages/server/.env
services/stockix-finance/packages/server/.env.example
services/stockix-finance/packages/webapp/.env.example
```

| Path | Purpose |
|------|---------|
| `.env` (repo root) | Platform API, worker, dashboard via `@repo/config` |
| `services/stockix-finance/.env` | Finance monorepo local overrides (if present) |
| `services/stockix-finance/packages/server/.env` | Nest server when run via `pnpm` (not tenant Docker) |
| `infra/prod/.env` | Production compose overrides |
| `~/.stockix/tenants/{slug}/.env` | Per-tenant Docker compose `--env-file` (outside repo) |

**Tenant slugs observed:** `test`, `jadh`, `jadh213`, `mk5`, `testfix02`, plus several `diag-*` diagnostics.

### Root `.env` (masked keys — secrets truncated after 8 chars)

```
NODE_ENV=developm***
HOSTNAME=server***
DATABASE_URL=postgres***
DB_WAIT_TIMEOUT_MS=90000***
… (legacy DB_* block mostly empty) …
PORT=4000***
PLATFORM_API_SECRET=5b8e0d2e***
WORKER_SECRET=a29489af***
DASHBOARD_URL=http://l***
ROOT_DOMAIN=localhos***
…
JWT_SECRET=7682b3e5***
SIGNUP_DISABLED=true***
SIGNUP_ALLOWED_DOMAINS=
SIGNUP_ALLOWED_EMAILS=
… (no INTERNAL_API_SECRET set) …
TENANT_ENV_ROOT=
STOCKIX_TENANT_APP_ROOT=
```

### `services/stockix-finance/.env`

**Present** on disk (gitignored). Used for Finance local dev; **tenant Docker stacks still use** `~/.stockix/tenants/{slug}/.env`, not this file.

### Example tenant `~/.stockix/tenants/test/.env` (masked)

```
MYSQL_VOLUME_NAME=stockix-***
STOCKIX_TENANT_APP_ROOT=C:\Users***
BASE_URL=http://t***
DB_CLIENT=mysql***
DB_HOST=mysql***
DB_USER=stockix_***
DB_PASSWORD=3cb18643***
DB_ROOT_PASSWORD=67503aae***
SYSTEM_DB_NAME=stockix_***
TENANT_DB_NAME_PERFIX=stockix_***
JWT_SECRET=efcf21a6***          # ≠ root JWT_SECRET (per-tenant generated)
SIGNUP_DISABLED=true***
SIGNUP_ALLOWED_EMAILS=test@gma***
S3_REGION=us-east-***
S3_ACCESS_KEY_ID=local***
S3_ENDPOINT=http://l***
INTERNAL_API_SECRET=a29489af***  # matches WORKER_SECRET (dev fallback)
REACT_APP_STOCKIX_API_URL=       # empty
```

### Ownership model (actual, not aspirational)

| Layer | File | Owns |
|-------|------|------|
| **Platform** | Root `.env` | Postgres `DATABASE_URL`, API/dashboard auth, worker, Traefik paths, provisioning knobs, **documented** legacy Finance keys |
| **Tenant runtime** | `~/.stockix/tenants/{slug}/.env` | MySQL/Mongo/Redis stack, per-tenant JWT/DB secrets, signup policy **for Finance containers**, S3, mail, `INTERNAL_API_SECRET` |
| **Finance local** | `packages/server/.env` (optional) | Only when running Nest server directly — **orthogonal** to tenant Docker |

---

## BLOCK 2 — What the worker writes to tenant `.env`

**Source:** `infra/worker-service/domain/provisioning/tenant-env.ts` (full file is 87 lines; logic below).

### Every variable written to tenant `.env`

| Variable | Source |
|----------|--------|
| `MYSQL_VOLUME_NAME` | Param (derived: `stockix-{slug}-mysql`) |
| `STOCKIX_TENANT_APP_ROOT` | Param (finance repo path) |
| `BASE_URL` | Param (`{scheme}://{slug}.{rootDomain}`) |
| `DB_CLIENT` | **Hardcoded** `mysql` |
| `DB_HOST` | **Hardcoded** `mysql` |
| `DB_USER` | **Hardcoded** `stockix_tenant` |
| `DB_PASSWORD` | **Generated** (random hex, persisted encrypted in platform DB) |
| `DB_ROOT_PASSWORD` | **Generated** |
| `DB_CHARSET` | **Hardcoded** `utf8` |
| `SYSTEM_DB_*` | **Hardcoded** hosts/users/clients; password from generated |
| `SYSTEM_DB_NAME` | **Hardcoded** `stockix_system` |
| `TENANT_DB_*` | **Hardcoded** hosts/users; **Hardcoded** `TENANT_DB_NAME_PERFIX=stockix_tenant_` (typo preserved) |
| `JWT_SECRET` | **Generated** per tenant |
| `MONGODB_DATABASE_URL` | **Hardcoded** `mongodb://mongo/stockix` |
| `PUBLIC_PROXY_PORT` | **Generated** (allocated port) |
| `PUBLIC_PROXY_SSL_PORT` | **Hardcoded** `443` |
| `SIGNUP_DISABLED` | **Hardcoded** `true` — **does not read root `apiConfig`** |
| `SIGNUP_ALLOWED_DOMAINS` | **Hardcoded** empty string |
| `SIGNUP_ALLOWED_EMAILS` | Param (`input.adminEmail` at provision) |
| `MAIL_*` (6 vars) | **Hardcoded** empty strings |
| `S3_*` | From **`process.env.S3_*`** on worker host, else defaults in `provision-runtime.ts` |
| `AGENDASH_AUTH_USER` | **Hardcoded** `agendash` in runtime, passed as param |
| `AGENDASH_AUTH_PASSWORD` | **Generated** |
| `INTERNAL_API_SECRET` | **`apiConfig.internalApiSecret`** (root: unset → dev fallback to `WORKER_SECRET`) |
| `REACT_APP_STOCKIX_API_URL` | Param (often empty) |
| `REACT_APP_STOCKIX_TENANT_ID` | Param |

### Read from `apiConfig` / root `.env`?

| Reads root? | Variables |
|-------------|-----------|
| **Yes** | `INTERNAL_API_SECRET` (via `apiConfig.internalApiSecret`), S3 vars (via worker `process.env`, which loaded root dotenv) |
| **No** | `SIGNUP_DISABLED`, `SIGNUP_ALLOWED_*`, DB names, `DB_USER`, mail defaults, `MONGODB_DATABASE_URL`, `PUBLIC_PROXY_SSL_PORT`, most DB topology |

### Generated (random / allocated)

- `jwtSecret`, `dbPassword`, `dbRootPassword`, `agendashPassword`
- `publicProxyPort` (platform DB port allocation)
- `mysqlVolumeName`, `baseUrl` (deterministic from slug + config)

---

## BLOCK 3 — `provision-runtime.ts` and `org-provision-runtime.ts`

### `provision-runtime.ts` — duplicate `composeEnv` object

Besides writing `tenant-env.ts` file, it passes a **second** env map to Docker (`composeEnv`, lines ~312–354) that **mirrors** the file plus extras:

| Hardcoded in `composeEnv` | Should come from config? |
|---------------------------|--------------------------|
| `DB_CLIENT=mysql`, `DB_HOST=mysql` | Acceptable defaults for this stack |
| `DB_USER=stockix_tenant` | Acceptable |
| `SYSTEM_DB_NAME=stockix_system` | Acceptable (product constant) |
| `TENANT_DB_NAME_PERFIX=stockix_tenant_` | Typo; should align with `TENANT_DB_NAME_PREFIX` |
| `SIGNUP_DISABLED: "true"` | **Should read** `env.SIGNUP_DISABLED` / root policy |
| `SIGNUP_ALLOWED_DOMAINS: ""` | **Should read** root |
| `SIGNUP_ALLOWED_EMAILS: input.adminEmail` | Intentional for bootstrap allowlist |
| `MAIL_*: ""` | Could read root `MAIL_*` when set |
| `PUBLIC_PROXY_SSL_PORT: "443"` | OK for prod-shaped stack |
| `mongoUrlPersisted = "mongodb://mongo/stockix"` | Hardcoded (line 238) |
| `agendashUser = "agendash"` | Hardcoded |
| S3 defaults: `us-east-1`, `local`, `http://localhost:9000`, `stockix-local` | Read from root when unset — **partially** done |

### `org-provision-runtime.ts`

- **No tenant `.env` writes.**
- **No compose env.**
- Hardcoded / implicit: `http://localhost:${apiConfig.port}` for control-plane PATCH; uses Finance HTTP APIs (`/api/auth/register`, signin, switch-tenant, internal attach).
- Warning-only if `INTERNAL_API_SECRET` missing (same as tenant provision attach-user).

---

## BLOCK 4 — `docker-compose.yml` hardcoding

### Hardcoded in compose (not `${VAR}`)

| Location | Value | Notes |
|----------|-------|-------|
| `nginx` build args | `SERVER_PROXY_PORT=3000`, `WEB_SSL=false`, `SELF_SIGNED=false` | |
| `server` env | `NEW_RELIC_ENABLED=false`, `NEW_RELIC_APP_NAME=stockix-local` | |
| `server` env | `DB_HOST=mysql` | |
| `server` env | `MONGODB_DATABASE_URL=mongodb://mongo/stockix` | Duplicates tenant file |
| `server` ports | `127.0.0.1::3000` | Random host port |
| `mongo` image | `mongo:5.0` | |
| `mysql` expose | `3306` | |
| `redis` expose | `6379` | |
| Migration wait | `mysql:3306` | |
| Security | `read_only: true`, `no-new-privileges:true` | |

### `${VAR}` references and expected source

| Variable | Set in tenant `.env`? | Default in compose |
|----------|----------------------|-------------------|
| `STOCKIX_TENANT_APP_ROOT` | Yes | — |
| `PUBLIC_PROXY_PORT` | Yes | — |
| `MAIL_*` | Yes (empty) | `:-` empty |
| `REDIS_HOST` | **No** | `redis` |
| `REDIS_PORT` | **No** | `6379` |
| `QUEUE_HOST` / `QUEUE_PORT` | **No** | `redis` / `6379` |
| `S3_*` | Yes | some `:-` empty |
| `S3_FORCE_PATH_STYLE` | **No** | `false` |
| `DB_USER`, `DB_PASSWORD`, `DB_CHARSET` | Yes | — |
| `SYSTEM_DB_NAME` | Yes | — |
| `TENANT_DB_NAME_PREFIX` | **Only via typo key** `TENANT_DB_NAME_PERFIX` | fallback chain |
| `JWT_SECRET` | Yes | — |
| `BASE_URL` | Yes | — |
| `AGENDASH_*` | Yes | — |
| `SIGNUP_*` | Yes | domains `:-` empty |
| `INTERNAL_API_SECRET` | Yes | — |
| `MYSQL_VOLUME_NAME` | Yes | `${COMPOSE_PROJECT_NAME}_mysql` |
| `COMPOSE_PROJECT_NAME` | **composeEnv only**, not in `.env` file body | |

### Referenced but never set in tenant `.env` (rely on compose defaults)

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- `QUEUE_HOST`, `QUEUE_PORT`
- `S3_FORCE_PATH_STYLE`
- `SIGNUP_EMAIL_CONFIRMATION` (not in compose; Finance-only)

**Risk:** Low for Redis/queue (defaults match stack). Medium if you need non-default Redis without editing compose.

---

## BLOCK 5 — `packages/config/src/index.ts`

### Every `env.*` key (exported object)

`DATABASE_URL`, `DB_WAIT_TIMEOUT_MS`, `PORT`, `PLATFORM_API_SECRET`, `DASHBOARD_URL`, `BOOTSTRAP_*`, `ROOT_DOMAIN`, `PUBLIC_BASE_URL_SCHEME`, `MAX_TENANT_PORT`, `STOCKIX_TENANT_APP_ROOT`, `REPO_ROOT`, `TENANT_ENV_ROOT`, `TRAEFIK_*`, `TENANT_INTERNAL_HOST`, `CORS_ORIGINS`, `SESSION_SECRET`, `LICENSE_SIGNING_SECRET`, `AUTH_TOKEN_SECRET`, `ALLOW_BOOTSTRAP_LOGIN`, `PLATFORM_ADMIN_*`, `NEXT_PUBLIC_STOCKIX_*`, `SECURITY_*`, `STOCKIX_API_URL`, `PROVISION_*`, `OWNER_ID`, `PROVISION_ADMIN_EMAIL`, `POSTGRES_*`, `ACME_EMAIL`, `CF_DNS_API_TOKEN`, `STOCKIX_REPO`, `NODE_ENV`, `HOSTNAME`, `PLAYWRIGHT_TEST_BASE_URL`, `SMOKE_OWNER_ID`, `SIGNUP_*`, `BROWSER_WS_ENDPOINT`, `METRICS_*`, `MONOREPO_VERSION`, `PUBLIC_URL`, `WORKER_SECRET`, `INTERNAL_API_SECRET`, `WORKER_JOB_*`, legacy `DB_*` / `SYSTEM_DB_*` / `TENANT_DB_*`, `MAIL_*`, `DEPLOYMENT_SECRET_KEY`, `MONGODB_DATABASE_URL`, `AGENDA_*`, `AGENDASH_*`, `EASY_SMS_TOKEN`, `JWT_SECRET`, `BASE_URL`, `npm_package_*`

### Defaults (representative)

| Key | Default if unset |
|-----|----------------|
| `PORT` | `4000` |
| `WORKER_SECRET` | `dev-worker-secret` |
| `PROVISION_ADMIN_EMAIL` | `admin@localhost` |
| `NODE_ENV` | `development` |
| `MAX_TENANT_PORT` | `4999` |
| `SIGNUP_DISABLED` | `undefined` (no default boolean) |
| Most legacy `DB_*` | `undefined` |

### Required (throw) — profile-based via `apiConfig.validateRequiredEnv()`

**staging / production:** `DATABASE_URL`, `PLATFORM_API_SECRET`, `WORKER_SECRET`, `SESSION_SECRET`, `DASHBOARD_URL`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY`, `LICENSE_SIGNING_SECRET`

**development / test:** none enforced at validate time (lazy `readRequiredString` on getters still applies when accessed).

### Loaded but **never used** to drive tenant provisioning

| Key | Issue |
|-----|-------|
| `env.SIGNUP_DISABLED` | Read into `env` object; **no `apiConfig` getter**; worker **ignores** and hardcodes `true` |
| `env.SIGNUP_ALLOWED_DOMAINS` | Same |
| `env.SIGNUP_ALLOWED_EMAILS` | Same (tenant uses `input.adminEmail` only) |
| `env.JWT_SECRET` | Platform reads it; **tenant JWT is separately generated** — root value never applied to Finance containers |
| Most `DB_*` / `TENANT_DB_*` on root | Empty in your `.env`; **misleading** “legacy Stockix runtime” block |

### Used by scripts / secondary consumers

`PROVISION_ADMIN_EMAIL`, `SMOKE_OWNER_ID`, `PLAYWRIGHT_TEST_BASE_URL`, `OWNER_ID`, `METRICS_*`

---

## BLOCK 6 — Cross-layer duplication

### `SIGNUP_DISABLED`

| Location | Value on this machine |
|----------|---------------------|
| Root `.env` | `true` |
| Finance `.env` | N/A |
| Tenant `test/.env` | `true` |
| `tenant-env.ts` | **Hardcoded** `true` |
| `provision-runtime.ts` composeEnv | **Hardcoded** `"true"` |
| `packages/config` | Read, **unused by worker** |
| Finance server runtime | From tenant env → `signupRestrictions.disabled` |

**Consistent for disabled flag?** Yes (`true`), but **not wired** — root changes do not affect new provisions’ allowlist logic.

**Allowlist inconsistency:** Root `SIGNUP_ALLOWED_EMAILS=` (empty); tenant `test` has `test@gmail...`; provisioner always sets allowlist to **admin email**.

### `JWT_SECRET`

| Location | Notes |
|----------|-------|
| Root `.env` | `7682b3e5...` (static local) |
| Tenant `.env` | **Different** per tenant (`efcf21a6...` for test) |
| Worker | Generates fresh per provision |

**Consistent?** **No — by design** (tenant must differ). **Confusing** because same variable name.

### `INTERNAL_API_SECRET`

| Location | Notes |
|----------|-------|
| Root `.env` | **Not set** |
| `apiConfig.internalApiSecret` | Falls back to `WORKER_SECRET` in dev |
| Tenant `test/.env` | Same prefix as `WORKER_SECRET` |
| Finance server | `INTERNAL_API_SECRET` env var |

**Consistent in dev?** Yes (via fallback). **Production risk:** must set explicitly on root + tenant.

### `DB_PASSWORD`

| Root | Empty |
| Tenant | Generated per stack |
| Platform DB | Encrypted in `tenant_deployments` |

**Consistent?** N/A — different databases (Postgres vs MySQL).

### `WORKER_SECRET`

| Root | Set |
| API / worker | `apiConfig.workerSecret` |
| Tenant | Not stored; `INTERNAL_API_SECRET` mirrors it in dev |

**Consistent?** Yes for internal auth in dev.

### File reference list (source TS, excluding build artifacts)

**SIGNUP_DISABLED:** `packages/config`, `tenant-env.ts`, `provision-runtime.ts`, `docker-compose.yml`, Finance `signup-restrictions.ts`, `signup.ts` (duplicate), `.env.example` files, CI workflows.

**JWT_SECRET:** `packages/config`, `tenant-env.ts`, `provision-runtime.ts`, `docker-compose.yml`, Finance `jwt` config, server `.env.example`.

**INTERNAL_API_SECRET:** `packages/config`, `tenant-env.ts`, `provision-runtime.ts`, `org-provision-runtime.ts`, Finance Internal guard, server `.env.example`.

---

## BLOCK 7 — Hardcoded values that should not be

### Signup (critical)

```
tenant-env.ts:50        SIGNUP_DISABLED=true
provision-runtime.ts:336 SIGNUP_DISABLED: "true"
```

Root `env.SIGNUP_DISABLED` is **never consulted**.

### DB / product constants (acceptable but duplicated)

- `stockix_system`, `stockix_tenant`, `stockix_tenant_` prefix — hardcoded in worker + tenant file
- Legacy Finance e2e still uses `bigcapital_system` / `bigcapital` in `services/stockix-finance/.github/workflows/e2e.yml` — **naming drift**

### Ports (in compose / stack, not tenant-env)

- `3306`, `6379`, `27017` — service expose + healthchecks
- `PUBLIC_PROXY_SSL_PORT=443` in tenant file only (not passed to server container)

### Mail

- All `MAIL_*` written as empty — intentional for local; no propagation from root `MAIL_*`

### Finance duplicate config modules

- `signup.ts` (`registerAs('signup')`) — **no `configService.get('signup')` usage found**
- `signup-restrictions.ts` — **actually used** by Auth signup + meta
- `signup.ts` uses `=== 'true'` only; `signup-restrictions` uses `parseBoolean` (`true`/`1`) — latent inconsistency if `signup` were ever used

### S3 (worker)

```ts
const s3Region = process.env.S3_REGION ?? "us-east-1";
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID ?? "local";
// ...
```

Acceptable local defaults; should be documented, not silent.

---

## BLOCK 8 — Compose `${VAR}` vs `tenant-env.ts` output

### In `docker-compose.yml` server service but **not** in tenant-env file

| Variable | Mitigation |
|----------|------------|
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Compose defaults |
| `QUEUE_HOST`, `QUEUE_PORT` | Compose defaults |
| `S3_FORCE_PATH_STYLE` | Default `false` |
| `COMPOSE_PROJECT_NAME` | Passed via `composeEnv` at invoke time |

### In tenant-env file but **not** passed to server container env

| Variable | Used by |
|----------|---------|
| `DB_ROOT_PASSWORD` | `mysql` service only |
| `PUBLIC_PROXY_SSL_PORT` | Unused in compose snippet |
| `DB_CLIENT`, full `SYSTEM_DB_*` block | `database_migration` + file completeness |
| `REACT_APP_*` | Webapp image build / not runtime env in this compose |

---

## BLOCK 9 — Ideal 3-layer structure (verify vs propose)

### Layer 1 — ROOT `.env` (platform only)

**Should be here:** `DATABASE_URL`, `PLATFORM_API_SECRET`, `WORKER_SECRET`, `SESSION_SECRET`, `AUTH_TOKEN_SECRET`, `DEPLOYMENT_SECRET_KEY`, `LICENSE_SIGNING_SECRET`, `DASHBOARD_URL`, `CORS_ORIGINS`, `ROOT_DOMAIN`, Traefik/provision paths, `INTERNAL_API_SECRET` (explicit in prod), **platform policy defaults** (`SIGNUP_DISABLED`, `SIGNUP_ALLOWED_*`), shared S3/mail defaults for provisioner to copy.

**Should NOT be here (or should be clearly marked “ignored by runtime”):**

- Per-tenant `JWT_SECRET` (your file has one — **misleading**)
- Empty `DB_HOST` / `DB_PASSWORD` legacy block unless used
- `BASE_URL`, `PUBLIC_PROXY_PORT`, `MONGODB_DATABASE_URL` (tenant-stack only)
- `MYSQL_VOLUME_NAME`

**Current lie:** `.env.example` header says *“CANONICAL ENV SCHEMA — single source of truth for all services”* — **false** for Finance Docker tenants.

### Layer 2 — WORKER (reads root, writes tenant `.env`)

**Should read from root:** `SIGNUP_*`, `MAIL_*`, S3 defaults, `INTERNAL_API_SECRET`, `STOCKIX_TENANT_APP_ROOT`, domain/scheme, optional global mail.

**Should generate:** per-tenant `JWT_SECRET`, MySQL passwords, Agendash password, port allocation.

**Acceptable hardcode:** `DB_HOST=mysql`, service names, `stockix_system` DB name, compose project naming.

**Currently hardcoded but should use root:** `SIGNUP_DISABLED`, `SIGNUP_ALLOWED_DOMAINS`, empty mail block.

**Structural smell:** Same values written to **both** `buildTenantComposeEnvBody()` **and** `composeEnv` object — two sources that can drift.

### Layer 3 — TENANT `.env`

**Should be here:** Everything `docker compose --env-file` needs for that slug: secrets, ports, `BASE_URL`, signup policy, S3, mail, `INTERNAL_API_SECRET`, `STOCKIX_TENANT_APP_ROOT`.

**Should NOT be here:** Platform `DATABASE_URL`, `PLATFORM_API_SECRET`, dashboard session secrets.

**Missing (optional):** `SIGNUP_EMAIL_CONFIRMATION`, explicit `REDIS_*` if overriding defaults, `INTERNAL_API_SECRET` rotation docs.

---

## FINAL REPORT

### Duplications (same var, multiple places, different semantics)

| Variable | Root .env | Finance .env | Tenant .env | Worker hardcode | Consistent? |
|----------|-----------|--------------|-------------|-----------------|-------------|
| `SIGNUP_DISABLED` | `true` | N/A | `true` | `true` (ignores root) | Flag yes; **wiring no** |
| `SIGNUP_ALLOWED_EMAILS` | empty | N/A | admin/test email | `input.adminEmail` | **No** |
| `JWT_SECRET` | static | example only | per-tenant random | generated | **No** (names collide) |
| `INTERNAL_API_SECRET` | unset→WORKER | example | WORKER prefix | `apiConfig` | Dev yes; prod must set |
| `WORKER_SECRET` | set | N/A | N/A | N/A | OK |
| `SYSTEM_DB_NAME` | `stockix_system` | N/A | `stockix_system` | hardcoded | Yes |
| `MONGODB_DATABASE_URL` | set in root | N/A | `mongodb://mongo/stockix` | hardcoded | Same string, duplicated |
| Signup config module | N/A | N/A | N/A | N/A | **`signup` + `signupRestrictions`** duplicate in Finance |

### Hardcoded values that should come from config

| Location | Hardcoded value | Should be |
|----------|-----------------|-----------|
| `tenant-env.ts:50` | `SIGNUP_DISABLED=true` | `apiConfig` / root `SIGNUP_DISABLED` |
| `provision-runtime.ts:336-338` | signup trio | Same + `SIGNUP_ALLOWED_EMAILS` policy from root |
| `tenant-env.ts:53-59` | empty `MAIL_*` | Root `MAIL_*` when provided |
| `provision-runtime.ts:239` | `agendash` user | Root or constant in config |
| `tenant-env.ts:47` | mongo URL | Shared constant (OK) |
| `.env.example` header | “single source of truth” | Honest 3-layer docs |

### Variables referenced but never set

| Variable | Used in | Set in | Risk |
|----------|---------|--------|------|
| `REDIS_*`, `QUEUE_*` | compose | compose defaults only | Low locally |
| `S3_FORCE_PATH_STYLE` | compose | default `false` | Low |
| `INTERNAL_API_SECRET` | compose / Finance | root unset in prod | **High** if fallback disabled |
| `env.SIGNUP_*` in `@repo/config` | nowhere in worker | root | **Policy drift** |
| `signup` namespace (Finance) | registered only | — | Dead config |

### Missing from tenant `.env` (should be there)

| Variable | Why needed | Currently from |
|----------|------------|----------------|
| `SIGNUP_EMAIL_CONFIRMATION` | Finance signup flow | Finance default `false` only |
| Explicit `TENANT_DB_NAME_PREFIX` | Avoid typo reliance | Typo `PERFIX` only |
| `INTERNAL_API_SECRET` (prod) | Internal API auth | Often dev fallback only |

### Structural issues

| Issue | Severity | Fix |
|-------|----------|-----|
| Root `.env` claimed canonical but tenants use separate files | **High** | Document 3 layers; fix `.env.example` header |
| Worker ignores `env.SIGNUP_*` from root | **High** | Provisioner reads `apiConfig` when building tenant env |
| Duplicate `composeEnv` + tenant file write | **Medium** | Single builder function output used for both |
| `JWT_SECRET` name on platform vs tenant | **Medium** | Rename platform key or remove from root |
| Finance `signup.ts` duplicate of `signup-restrictions` | **Low** | Remove unused module |
| Root legacy empty `DB_*` block | **Low** | Move to `docs/` or tenant-only example |
| `TENANT_DB_NAME_PERFIX` typo | **Low** | Write both keys for compatibility |
| `bigcapital_*` in Finance CI vs `stockix_*` in provisioner | **Low** | Align test env naming |

---

## OVERALL VERDICT

| Question | Answer |
|----------|--------|
| Hardcoded values needing fix | **~8–12** meaningful (signup policy, mail propagation, duplicate compose map, docs lie, dead signup module) |
| Duplications | **~6** variable families with split ownership; **2** parallel signup config implementations in Finance |
| Is 3-layer structure sound? | **Conceptually yes** (platform / provisioner / tenant). **Implementation no** — root is not the policy source for tenants. |
| **ONE most important fix** | **Make the worker read platform signup (and mail) policy from `@repo/config` when generating tenant `.env`, and stop hardcoding `SIGNUP_DISABLED=true` in two places.** That turns root `.env` into the real policy source without merging per-tenant secrets. |

---

## Appendix — Who loads what (quick reference)

```
Root .env
  └─► @repo/config ─► apps/api, apps/dashboard, infra/worker (Node)

Worker provision
  └─► writes ~/.stockix/tenants/{slug}/.env
  └─► docker compose --env-file that path
        └─► Finance server (process.env.SIGNUP_* , JWT_*, etc.)
        └─► Finance webapp container (minimal runtime env)

Finance pnpm dev (no Docker)
  └─► packages/server/.env only (NOT root)
```

**Audit method:** Static read of listed files + masked inspection of local `.env` and `~/.stockix/tenants/test/.env`. Re-run after provisioning changes to validate live containers (`docker exec … printenv`).
