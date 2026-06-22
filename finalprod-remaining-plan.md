# Stockix — Remaining Implementation Plan
## P2-02 · P2-03 · P3-02 · P3-03 · P3-04

**Date:** 2026-06-22  
**Based on:** Live codebase audit of current state  
**Audience:** Engineering team

---

## How to Read This

Each section is self-contained. It opens with what exists today (verified against the codebase), followed by the exact gap, then a step-by-step implementation. No guesswork — every file path, function name, and pattern below is confirmed to exist.

---

## P2-02 — Legacy API Route Removal (Hard Deadline: 2026-09-15)

### Current State

`apps/api/src/routes/register-control-plane-routes.ts:62`:
```typescript
// Legacy routes — kept for backward compatibility until 2026-09-20
registerVersionedRoutes(app, db);   // ← unversioned mount, must be deleted
```

`apps/api/src/middleware/known-api-paths.ts:31–44`:
```typescript
const LEGACY_VERSIONED_PREFIXES = [
  "/owners", "/admin/", "/audit-log", "/api-keys", "/tenants",
  "/search", "/plans", "/licenses", "/fingerprints/", "/notifications",
  "/pos/", "/pms/",
];
```

`SUNSET_DATE = "Sat, 20 Sep 2026 00:00:00 GMT"` is set in the router.

**11 unversioned path prefixes** are still being served. Every response to these paths gets `Deprecation: true` + `Sunset: Sat, 20 Sep 2026` headers appended automatically by the deprecation middleware.

### The Gap

Sunset date is **2026-09-20** — 89 days from audit. All unversioned routes must be removed **before** that date or the headers become false promises. Target removal: **2026-09-15** (5-day safety buffer).

**Unknown:** which callers still hit unversioned paths. This must be audited before deletion.

### Implementation

---

**Step 1 — Caller audit via access logs (do first, takes 1–2 days of log collection)**

Add a temporary structured log entry to the deprecation middleware that records the calling client:

```typescript
// register-control-plane-routes.ts:46
app.use("*", async (c, next) => {
  await next();
  const path = c.req.path;
  if (!path.startsWith("/v1") && isLegacyVersionedPath(path)) {
    c.header("Deprecation", "true");
    c.header("Sunset", SUNSET_DATE);
    c.header("Link", `</v1${path}>; rel="successor-version"`);
    // ADD: structured log for caller tracking
    logger.warn("legacy_path_hit", {
      path,
      method: c.req.method,
      userAgent: c.req.header("user-agent") ?? "unknown",
      origin: c.req.header("origin") ?? "unknown",
    });
  }
});
```

Deploy to staging and let it run for 48 hours. Pull the logs:
```bash
# On staging server:
docker service logs stockix_api 2>&1 | grep "legacy_path_hit" | jq -r '.path' | sort | uniq -c | sort -rn
```

**Any path with > 0 hits must be migrated to /v1 before deletion.**

---

**Step 2 — Dashboard audit**

Dashboard API calls go through Next.js route handlers in `apps/dashboard/app/api/`. Check each for unversioned paths:

```bash
grep -rn "fetch\|apiClient\|stockixFetch" apps/dashboard/ --include="*.ts" --include="*.tsx" \
  | grep -v "node_modules" \
  | grep -vE '"/api/|/v1/|/auth|/public|/health' \
  | grep -E '"/(owners|admin|audit-log|api-keys|tenants|search|plans|licenses|notifications|pos/|pms/)' \
  | head -40
```

For every hit, update the URL from `/path` to `/v1/path`.

---

**Step 3 — POS backend audit**

```bash
grep -rn "stockixApi\|control.*plane\|platform.*api\|STOCKIX_API" apps/pos-backend/ \
  --include="*.js" --include="*.ts" \
  | grep -vE "/v1/|/auth|/health" \
  | grep -E "/(owners|tenants|licenses|plans|notifications)" \
  | head -20
```

---

**Step 4 — Remove legacy route mount**

After confirming zero legacy hits in logs, make the deletion:

`apps/api/src/routes/register-control-plane-routes.ts` — delete 2 lines:
```typescript
// DELETE these two lines:
  // Legacy routes — kept for backward compatibility until 2026-09-20
  registerVersionedRoutes(app, db);
```

`apps/api/src/middleware/known-api-paths.ts` — delete `LEGACY_VERSIONED_PREFIXES` and `isLegacyVersionedPath`:
```typescript
// DELETE entirely:
const LEGACY_VERSIONED_PREFIXES = [...];
export function isLegacyVersionedPath(path: string): boolean { ... }
```

`apps/api/src/routes/register-control-plane-routes.ts` — delete the deprecation middleware block (lines 45–54 current):
```typescript
// DELETE the entire middleware block:
app.use("*", async (c, next) => {
  await next();
  const path = c.req.path;
  if (!path.startsWith("/v1") && isLegacyVersionedPath(path)) { ... }
});
```

Also delete `SUNSET_DATE` constant (it is now unused).

---

**Step 5 — Remove legacy paths from KNOWN_PATH_PREFIXES**

`known-api-paths.ts` KNOWN_PATH_PREFIXES no longer needs to list the legacy prefixes separately — `/v1/` covers all of them. Remove the now-redundant entries:

```typescript
// These are no longer needed since /v1/* covers them:
// Remove: "/owners", "/admin/", "/audit-log", "/api-keys", "/tenants",
//         "/search", "/plans", "/licenses", "/fingerprints/",
//         "/notifications", "/pos/", "/pms/"
const KNOWN_PATH_PREFIXES = [
  "/health",
  "/ready",
  "/public/",
  "/auth",
  "/webhooks/",
  "/internal/jobs",
  "/internal/organizations",
  "/internal/product-token",
  "/v1/",
] as const;
```

---

**Step 6 — Run CI guards**

```bash
pnpm run check:routes
pnpm run check:known-paths
pnpm run check:tenant-scope
pnpm run check:api-structure
pnpm build
pnpm test
```

All must pass.

---

**Step 7 — Staged rollout**

1. Deploy to **staging** 2026-09-10. Watch for 404s in the Grafana API dashboard for 48 hours.
2. Deploy to **production** 2026-09-15. Keep staging deployed — if a client hits a 404, can diagnose against staging logs.

---

### Files Changed
| File | Change |
|------|--------|
| `apps/api/src/routes/register-control-plane-routes.ts` | Delete legacy mount + deprecation middleware |
| `apps/api/src/middleware/known-api-paths.ts` | Delete `LEGACY_VERSIONED_PREFIXES`, `isLegacyVersionedPath`, slim `KNOWN_PATH_PREFIXES` |
| `apps/dashboard/app/api/**/*.ts` | Any URLs updated from `/path` → `/v1/path` |
| `apps/pos-backend/**/*.js` | Any URLs updated |

### Acceptance Criteria
- `grep -r "isLegacyVersionedPath" apps/api/src/` returns zero hits
- No `Deprecation: true` header on any production response
- Zero 404s attributable to route removal in the 48h post-deploy window
- All CI guards pass

---

## P2-03 — Dev-as-Prod Local Mirror

### Current State

`infra/dev/docker-compose.yml` runs **Postgres + Redis only** (39 lines). The entire control plane (api, dashboard, infra-worker, Traefik, MySQL) is absent. Developers cannot:
- Run a full provision locally
- Test Traefik routing rules before pushing to staging
- Reproduce Finance stack behavior
- Work without hitting the shared staging environment

### The Gap

No full-stack local compose file exists. Creating one requires careful handling of:
1. Docker socket mounting (infra-worker needs it for tenant provisioning)
2. MySQL for Finance tenant databases
3. Traefik routing on `*.localhost`
4. Environment variable wiring without touching production `.env`

### Implementation

---

**Step 1 — Create `infra/dev/docker-compose.full.yml`**

This file is a **Compose override** — run alongside the existing minimal compose:

```bash
# Minimal (current — Postgres + Redis only):
docker compose -f infra/dev/docker-compose.yml up -d

# Full stack (new — add all services):
docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml up -d
```

```yaml
# infra/dev/docker-compose.full.yml
# Full local development stack — mirrors production topology.
# Requires: Docker Desktop with host.docker.internal support, or Linux with /var/run/docker.sock.
# Usage: docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml up -d

services:
  traefik:
    image: traefik:v3
    restart: unless-stopped
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--log.level=WARN"
    ports:
      - "80:80"
      - "8090:8080"   # Traefik dashboard at http://localhost:8090
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - stockix_dev_public

  api:
    image: ${API_IMAGE:-stockix-api:dev}
    build:
      context: ../..
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      mysql:
        condition: service_healthy
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/stockix_platform
      CONTROL_PLANE_REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-jwt-secret-not-for-production
      ROOT_DOMAIN: localhost
      DASHBOARD_URL: http://dashboard.localhost
      PORT: "4000"
      WORKER_SECRET: dev-worker-secret
      RESEND_API_KEY: ${RESEND_API_KEY:-re_test_placeholder}
      SHARED_MYSQL_HOST: mysql
      SHARED_MYSQL_ROOT_PASSWORD: devpassword
      MYSQL_PROXY_HOST: mysql
      MYSQL_PROXY_PORT: "3306"
    networks:
      - stockix_dev_internal
      - stockix_dev_public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api-dev.rule=Host(`api.localhost`)"
      - "traefik.http.routers.api-dev.entrypoints=web"
      - "traefik.http.services.api-dev.loadbalancer.server.port=4000"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:4000/health 2>/dev/null | grep -q ok || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  dashboard:
    image: ${DASHBOARD_IMAGE:-stockix-dashboard:dev}
    build:
      context: ../..
      dockerfile: apps/dashboard/Dockerfile
      args:
        NEXT_PUBLIC_STOCKIX_API_URL: http://api.localhost
        NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN: localhost
        NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME: http
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: "3000"
      NEXTAUTH_URL: http://dashboard.localhost
      NEXTAUTH_SECRET: dev-nextauth-secret
      STOCKIX_API_INTERNAL_URL: http://api:4000
    networks:
      - stockix_dev_internal
      - stockix_dev_public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard-dev.rule=Host(`dashboard.localhost`)"
      - "traefik.http.routers.dashboard-dev.entrypoints=web"
      - "traefik.http.services.dashboard-dev.loadbalancer.server.port=3000"

  infra-worker:
    build:
      context: ../..
      dockerfile: infra/worker-service/Dockerfile
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/stockix_platform
      CONTROL_PLANE_REDIS_URL: redis://redis:6379
      API_HOST: api
      WORKER_SECRET: dev-worker-secret
      SHARED_MYSQL_HOST: mysql
      SHARED_MYSQL_ROOT_PASSWORD: devpassword
      TENANT_ENV_ROOT: /opt/tenants
      DOCKER_HOST: unix:///var/run/docker.sock
      WORKER_CONCURRENCY: "1"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - tenant_envs_dev:/opt/tenants
    networks:
      - stockix_dev_internal

  mysql:
    image: mysql:8
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: devpassword
      MYSQL_ROOT_HOST: "%"
    command:
      - --max_connections=200
      - --innodb_buffer_pool_size=128M
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    ports:
      - "33060:3306"
    volumes:
      - mysql_dev_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-pdevpassword"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 30s
    networks:
      - stockix_dev_internal

networks:
  stockix_dev_internal:
    name: stockix_dev_internal
  stockix_dev_public:
    name: stockix_dev_public

volumes:
  mysql_dev_data:
  tenant_envs_dev:
```

---

**Step 2 — Add convenience scripts to root `package.json`**

```json
"scripts": {
  "dev:minimal": "docker compose -f infra/dev/docker-compose.yml up -d",
  "dev:full": "docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml up -d",
  "dev:full:down": "docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml down",
  "dev:full:logs": "docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml logs -f api infra-worker",
  "dev:full:build": "docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml build"
}
```

---

**Step 3 — Create `infra/dev/.env.full.example`**

```bash
# Copy to infra/dev/.env.full and fill in:
# cp infra/dev/.env.full.example infra/dev/.env.full

# Optional: use real Resend key for email testing in dev
RESEND_API_KEY=re_your_key_here

# Override built images (leave blank to use local builds)
API_IMAGE=
DASHBOARD_IMAGE=
```

Add `infra/dev/.env.full` to `.gitignore`.

---

**Step 4 — Add `/etc/hosts` entries to the developer setup guide**

For Traefik routing on `*.localhost` to work, developers on Linux need nothing (`.localhost` resolves to 127.0.0.1 natively). On macOS/Windows:

```bash
# Add to /etc/hosts (macOS) or C:\Windows\System32\drivers\etc\hosts (Windows)
127.0.0.1  api.localhost
127.0.0.1  dashboard.localhost
```

Add this to `README.md` or `docs/local-dev.md`.

---

**Step 5 — Verify the full stack boots**

```bash
# Build images locally
pnpm dev:full:build

# Start full stack
pnpm dev:full

# Run DB migrations
docker exec -it $(docker ps -q -f name=api) node dist/scripts/migrate.js

# Smoke test
curl -s http://api.localhost/health | jq .          # → {"status":"ok"}
curl -I http://dashboard.localhost                   # → 200 OK
```

---

### Files Created/Changed
| File | Change |
|------|--------|
| `infra/dev/docker-compose.full.yml` | New — full local stack |
| `infra/dev/.env.full.example` | New — local env template |
| `package.json` | Add `dev:full`, `dev:full:down`, `dev:full:logs`, `dev:full:build` scripts |
| `.gitignore` | Add `infra/dev/.env.full` |

### Acceptance Criteria
- `pnpm dev:full` starts cleanly with no port conflicts on a clean machine
- `curl http://api.localhost/health` returns `{"status":"ok"}`
- `curl http://dashboard.localhost` returns HTTP 200
- Triggering a new-tenant provision job from the dashboard UI completes successfully and creates a MySQL database on the local `mysql` container
- `pnpm dev:full:down` removes all containers, networks, and dev volumes cleanly

---

## P3-02 — Shared UI Library Consolidation (POS Frontend)

### Current State

`apps/pos-frontend2/src/components/ui/` contains **shadcn/ui component copies** — locally forked versions of `Button`, `Input`, `Select`, `Table`, `Skeleton`, etc. These are imported via `@/components/ui/button`, `@/components/ui/input`, etc.

`@repo/ui-core` has **48 components** including `button.tsx`, `input.tsx`, `select.tsx`, `table.tsx`, `skeleton.tsx` and more — identical in origin (both are shadcn/ui).

`@repo/ui-shared` exports `MetaForm` and `MetaTable`, which themselves import from `@repo/ui-core`.

POS uses `@tanstack/react-table` for `data-table.tsx` (custom, not in ui-core).

Finance is Blueprint.js — **do not touch in this sprint**.

### The Gap

POS frontend maintains local copies of components that already exist in `@repo/ui-core`. When a component is updated in `@repo/ui-core` (e.g., button variant, accessibility fix), POS does not receive the update.

### Implementation Strategy

**Phase A** (this sprint): Replace `@/components/ui/*` local copies with `@repo/ui-core` imports.  
**Phase B** (next sprint): Extend `@repo/ui-core` with the `DataTable` (tanstack-react-table powered) that both dashboard and POS need.  
**Phase C** (long-term): Finance migration — tracked separately, very high risk.

---

**Step 1 — Add `@repo/ui-core` as a dependency of POS frontend**

`apps/pos-frontend2/package.json`:
```json
"dependencies": {
  "@repo/ui-core": "workspace:*",
  ...
}
```

Run `pnpm install` to link.

---

**Step 2 — Audit which local components are exact shadcn copies**

```bash
# List all local /ui/ files
ls apps/pos-frontend2/src/components/ui/

# Compare each to ui-core equivalent
diff apps/pos-frontend2/src/components/ui/button.tsx packages/ui-core/src/button.tsx
```

For each component in `@/components/ui/`: if it exists identically in `@repo/ui-core`, mark it for replacement. If it has POS-specific modifications (custom props, extra variants), extend ui-core instead of forking.

---

**Step 3 — Replace local imports component by component**

Start with the lowest-risk, most-used primitives. Replace in this order (each is one search-replace across all POS files):

| Order | Local import | Replace with |
|-------|-------------|--------------|
| 1 | `@/components/ui/button` | `@repo/ui-core/button` |
| 2 | `@/components/ui/input` | `@repo/ui-core/input` |
| 3 | `@/components/ui/label` | `@repo/ui-core/label` |
| 4 | `@/components/ui/badge` | `@repo/ui-core/badge` |
| 5 | `@/components/ui/skeleton` | `@repo/ui-core/skeleton` |
| 6 | `@/components/ui/separator` | `@repo/ui-core/separator` |
| 7 | `@/components/ui/card` | `@repo/ui-core/card` |
| 8 | `@/components/ui/table` | `@repo/ui-core/table` |
| 9 | `@/components/ui/select` | `@repo/ui-core/select` |
| 10 | `@/components/ui/dialog` | `@repo/ui-core/dialog` |
| 11 | `@/components/ui/dropdown-menu` | `@repo/ui-core/dropdown-menu` |
| 12 | `@/components/ui/tabs` | `@repo/ui-core/tabs` |
| 13 | `@/components/ui/checkbox` | `@repo/ui-core/checkbox` |
| 14 | `@/components/ui/tooltip` | `@repo/ui-core/tooltip` |
| 15 | `@/components/ui/avatar` | `@repo/ui-core/avatar` |

After each replacement batch: `pnpm --filter pos-frontend2 typecheck && pnpm --filter pos-frontend2 build`.

---

**Step 4 — Move the `DataTable` into `@repo/ui-core`**

`apps/pos-frontend2/src/components/shared/data-table.tsx` is a tanstack-react-table powered component with pagination, search, and sorting. The dashboard's `pos-resource-table.tsx` likely implements similar functionality. This belongs in `@repo/ui-core` as a shared primitive.

Create `packages/ui-core/src/data-table.tsx`:
```typescript
// Adapted from apps/pos-frontend2/src/components/shared/data-table.tsx
// Generic tanstack-react-table DataTable with built-in pagination + search
import { type ColumnDef, ... } from "@tanstack/react-table";
// ... (paste and generify the existing POS data-table implementation)
```

Export from `packages/ui-core/src/index.ts`:
```typescript
export { DataTable, type DataTableProps } from "./data-table.js";
```

Then replace `apps/pos-frontend2/src/components/shared/data-table.tsx` with:
```typescript
export { DataTable } from "@repo/ui-core/data-table";
```

And add `@tanstack/react-table` as a peer dependency of `@repo/ui-core`.

---

**Step 5 — Delete the now-empty local /ui/ directory**

After all replacements and a passing build + typecheck:
```bash
rm -rf apps/pos-frontend2/src/components/ui/
```

Any remaining import errors are components that need POS-specific treatment — handle individually.

---

### Files Changed
| File | Change |
|------|--------|
| `apps/pos-frontend2/package.json` | Add `@repo/ui-core: workspace:*` |
| `apps/pos-frontend2/src/**/*.tsx` | Replace `@/components/ui/*` → `@repo/ui-core/*` |
| `apps/pos-frontend2/src/components/ui/` | Deleted |
| `packages/ui-core/src/data-table.tsx` | New — shared DataTable |
| `packages/ui-core/src/index.ts` | Export DataTable |
| `packages/ui-core/package.json` | Add `@tanstack/react-table` as peer dep |

### Acceptance Criteria
- `ls apps/pos-frontend2/src/components/ui/` returns "No such file or directory"
- `pnpm --filter pos-frontend2 build` succeeds with zero errors
- `pnpm --filter pos-frontend2 typecheck` passes
- All POS dashboard pages render correctly in the browser (visual regression check)
- Changing `button.tsx` in `@repo/ui-core` reflects in POS after rebuild (no local override)

---

## P3-03 — Meta-Driven UI Expansion (Dashboard)

### Current State

**MetaTable API** (verified `packages/ui-shared/src/meta-table.tsx`):
```typescript
interface MetaTableColumn { key: string; label: string; renderCell?: (value, row) => ReactNode; }
interface MetaTableProps  { columns: MetaTableColumn[]; data: any[]; }
```
Current limitations: **no pagination, no loading state, no empty state, no search, no sorting**.

**MetaForm API** (verified `packages/ui-shared/src/meta-form.tsx`):
```typescript
interface MetaFormProps { schema: FormDefinition; onSubmit: (data) => void; defaultValues?: any; }
```
Current limitations: **no async validation, no dependent fields, no error messages from API**.

**Dashboard pages with hand-rolled table patterns** (verified):
- `audit-log/page.tsx` — **498 lines** — hand-rolled `Table` + pagination + filter + fetch
- `email-logs/page.tsx` — similar pattern (~200 lines)
- `owners/page.tsx` — uses `_components/owners-page-content.tsx`
- `plans/page.tsx` — uses `_components/plans-page-content.tsx`
- `api-keys/page.tsx` — already uses `MetaTable` ✅ (the only current user)

**The problem:** MetaTable is too primitive to replace the hand-rolled tables. Before expanding adoption, MetaTable must be extended.

### Implementation

---

**Step 1 — Extend MetaTable with essential features**

`packages/ui-shared/src/meta-table.tsx` — rewrite to support the features the hand-rolled tables already have:

```typescript
export interface MetaTableColumn<TRow = any> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  renderCell?: (value: any, row: TRow) => React.ReactNode;
}

export interface MetaTableProps<TRow = any> {
  columns: MetaTableColumn<TRow>[];
  data: TRow[];
  // Loading / empty states
  isLoading?: boolean;
  emptyMessage?: string;
  // Pagination
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  // Search
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  // Row actions
  onRowClick?: (row: TRow) => void;
  rowActions?: (row: TRow) => React.ReactNode;
  // Toolbar slot (filters, create button, etc.)
  toolbar?: React.ReactNode;
}
```

The implementation renders:
1. Toolbar row (search input + `toolbar` slot)
2. Table with `Skeleton` rows while `isLoading`
3. Empty state when `data.length === 0`
4. Pagination controls when `totalPages > 1`

---

**Step 2 — Extend MetaForm with server error support**

`packages/ui-shared/src/meta-form.tsx` — add:
```typescript
export interface MetaFormProps {
  schema: FormDefinition;
  onSubmit: (data: any) => Promise<void> | void;
  defaultValues?: any;
  isLoading?: boolean;           // disables submit button + shows spinner
  serverError?: string | null;   // shows API error below form
  submitLabel?: string;          // default: "Save"
}
```

---

**Step 3 — Migrate `audit-log/page.tsx` (498 lines → ~50 lines)**

This is the highest-value target — 498 lines of hand-rolled table logic becomes a schema definition + MetaTable.

Current pattern in `audit-log/page.tsx`:
```typescript
const [logs, setLogs] = useState([]);
const [page, setPage] = useState(1);
const [loading, setLoading] = useState(true);
const load = useCallback(async () => { ... fetch ... }, [page, filter]);
// 200 lines of JSX with <Table><TableHeader>...
```

Target pattern after migration:
```typescript
// audit-log/page.tsx — after migration
const COLUMNS: MetaTableColumn<AuditLogRow>[] = [
  { key: "action",    label: "Action" },
  { key: "actorId",   label: "Actor" },
  { key: "createdAt", label: "When", renderCell: (v) => formatDistanceToNow(new Date(v)) },
  { key: "ipAddress", label: "IP" },
];

export default function AuditLogPage() {
  const { data, page, totalPages, loading, search, setPage, setSearch } = useAuditLog();
  return (
    <MetaTable
      columns={COLUMNS}
      data={data}
      isLoading={loading}
      emptyMessage="No audit log entries"
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      searchValue={search}
      searchPlaceholder="Filter by action or actor…"
      onSearchChange={setSearch}
    />
  );
}
```

Extract the fetch logic into `hooks/use-audit-log.ts` — a custom hook that encapsulates the `fetch`, `useState`, `useCallback` pattern.

---

**Step 4 — Migration priority order**

| Page | Lines today | Effort | Value |
|------|------------|--------|-------|
| `audit-log/page.tsx` | 498 | 4h | Highest — largest file, most complex |
| `email-logs/page.tsx` | ~200 | 2h | Same pattern as audit-log |
| `owners/` | ~150 | 2h | CRUD list |
| `plans/` | ~150 | 2h | Read-only list |
| `licenses/` | ~200 | 3h | List + badge column |

**Total estimated effort:** 13h across 2 developers.

---

**Step 5 — Add snapshot tests for each schema definition**

For each migrated page, add a test that imports the column definition and asserts its shape — prevents accidental regression when the schema is changed:

```typescript
// audit-log/audit-log-columns.test.ts
import { COLUMNS } from "./audit-log-columns";

it("has required columns", () => {
  expect(COLUMNS.map(c => c.key)).toContain("action");
  expect(COLUMNS.map(c => c.key)).toContain("createdAt");
});

it("renders relative time in createdAt cell", () => {
  const col = COLUMNS.find(c => c.key === "createdAt")!;
  const result = col.renderCell!("2026-01-01T00:00:00Z", {});
  expect(typeof result).toBe("string");
});
```

---

### Files Created/Changed
| File | Change |
|------|--------|
| `packages/ui-shared/src/meta-table.tsx` | Extend with pagination, loading, search, empty state, toolbar |
| `packages/ui-shared/src/meta-form.tsx` | Extend with isLoading, serverError, submitLabel |
| `apps/dashboard/app/(dashboard)/audit-log/page.tsx` | Migrate from hand-rolled → MetaTable (498 → ~50 lines) |
| `apps/dashboard/app/(dashboard)/audit-log/hooks/use-audit-log.ts` | New — extracted fetch hook |
| `apps/dashboard/app/(dashboard)/email-logs/page.tsx` | Migrate |
| `apps/dashboard/app/(dashboard)/email-logs/hooks/use-email-logs.ts` | New |
| `apps/dashboard/app/(dashboard)/owners/_components/owners-page-content.tsx` | Migrate |
| `apps/dashboard/app/(dashboard)/plans/_components/plans-page-content.tsx` | Migrate |
| `apps/dashboard/app/(dashboard)/licenses/_components/licenses-page-content.tsx` | Migrate |

### Acceptance Criteria
- `audit-log/page.tsx` is under 100 lines
- All 5 migrated pages render identically to the current hand-rolled versions
- Pagination works on each page
- Search filters the displayed data
- `pnpm --filter dashboard typecheck` passes
- MetaTable snapshot tests pass

---

## P3-04 — MySQL Read Replicas (Trigger: 50+ active tenants or P95 report > 3s)

### Current State

**Key finding:** ProxySQL is **already in the infrastructure**. The prod compose references:
```
MYSQL_PROXY_HOST: ${MYSQL_PROXY_HOST:-stockix-mysql-proxy}
MYSQL_PROXY_PORT: ${MYSQL_PROXY_PORT:-6033}
```

The worker already monitors ProxySQL connections:
```typescript
// worker.ts:1548 — already implemented
const proxysqlStatsUrl = process.env.PROXYSQL_STATS_URL;
const pct = (data.active / data.max) * 100;
proxysqlConnectionsPct.set(pct);
```

This means the **routing layer already exists**. Adding a read replica is adding a MySQL container + configuring ProxySQL to route reads to it.

### The Gap

1. `stockix-mysql-proxy` is referenced but the service is **not declared** in `infra/shared/docker-compose.yml` — ProxySQL is not yet deployed.
2. No MySQL replica container is provisioned.
3. Finance Knex config uses `SHARED_MYSQL_HOST` directly — no read/write split in the connection layer.

### When to Implement

**Do not start this work until:**
- Active tenant count exceeds **50**, OR
- P95 Finance report generation time exceeds **3 seconds** (visible in Grafana), OR
- ProxySQL connection pool approaches 80% utilization (alerts already configured)

---

### Implementation

**Step 1 — Deploy ProxySQL in `infra/shared/docker-compose.yml`**

Add the ProxySQL service (currently referenced but undeclared):

```yaml
# infra/shared/docker-compose.yml — add:
  stockix-mysql-proxy:
    image: proxysql/proxysql:2.6
    restart: unless-stopped
    volumes:
      - ./proxysql/proxysql.cnf:/etc/proxysql.cnf:ro
      - proxysql_data:/var/lib/proxysql
    ports:
      - "6033:6033"    # MySQL protocol (clients connect here)
      - "6032:6032"    # ProxySQL admin interface
    networks:
      - stockix_shared
    depends_on:
      stockix-mysql:
        condition: service_healthy
```

---

**Step 2 — Create ProxySQL config `infra/shared/proxysql/proxysql.cnf`**

```ini
datadir="/var/lib/proxysql"

admin_variables=
{
  admin_credentials="admin:adminpassword"
  mysql_ifaces="0.0.0.0:6032"
}

mysql_variables=
{
  threads=4
  max_connections=2048
  default_query_delay=0
  default_query_timeout=36000000
  have_compress=true
  poll_timeout=2000
  interfaces="0.0.0.0:6033;/tmp/proxysql.sock"
  default_schema="information_schema"
  stacksize=1048576
  server_version="8.0.33"
  connect_timeout_server=3000
  monitor_username="proxysql_monitor"
  monitor_password="monitorpassword"
  monitor_history=600000
  monitor_connect_interval=60000
  monitor_ping_interval=10000
  ping_interval_server_msec=120000
  ping_timeout_server=500
  commands_stats=true
  sessions_sort=true
  connect_retries_on_failure=10
}

mysql_servers=
(
  {
    address="stockix-mysql"
    port=3306
    hostgroup=0        # write group
    status="ONLINE"
    weight=1
    compression=0
    max_connections=200
  },
  {
    address="stockix-mysql-replica"
    port=3306
    hostgroup=1        # read group
    status="ONLINE"
    weight=1
    compression=0
    max_connections=500
  }
)

mysql_users=
(
  {
    username="proxysql_app"
    password="apppassword"
    default_hostgroup=0     # writes go to primary by default
    active=1
  }
)

mysql_query_rules=
(
  {
    rule_id=1
    active=1
    match_pattern="^SELECT"
    destination_hostgroup=1   # route SELECTs to replica
    apply=1
    comment="Read traffic to replica"
  },
  {
    rule_id=2
    active=1
    match_pattern="^SELECT.*FOR UPDATE"
    destination_hostgroup=0   # SELECT FOR UPDATE stays on primary
    apply=1
    comment="Locking reads stay on primary"
  }
)
```

---

**Step 3 — Add MySQL replica service**

```yaml
# infra/shared/docker-compose.yml — add alongside stockix-mysql:
  stockix-mysql-replica:
    image: mysql:8
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${SHARED_MYSQL_ROOT_PASSWORD}
    command:
      - --server-id=2
      - --log_bin=mysql-bin
      - --binlog_format=ROW
      - --relay_log=relay-bin
      - --read_only=1
      - --skip_name_resolve
      - --max_connections=500
      - --innodb_buffer_pool_size=512M
    volumes:
      - mysql_replica_data:/var/lib/mysql
    networks:
      - stockix_shared
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${SHARED_MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    depends_on:
      stockix-mysql:
        condition: service_healthy
```

---

**Step 4 — Enable binary logging on the primary**

Add to the existing `stockix-mysql` service command:
```yaml
command:
  - --server-id=1
  - --log_bin=mysql-bin
  - --binlog_format=ROW
  - --binlog_do_db=  # empty = replicate all dbs
  - --max_connections=1000
  - --innodb_buffer_pool_size=256M
```

---

**Step 5 — Bootstrap replication (one-time, on server)**

```bash
# On the production server, after both containers are running:

# 1. Create replication user on primary
docker exec stockix-mysql mysql -uroot -p${SHARED_MYSQL_ROOT_PASSWORD} -e "
  CREATE USER IF NOT EXISTS 'replicator'@'%' IDENTIFIED BY 'replpassword';
  GRANT REPLICATION SLAVE ON *.* TO 'replicator'@'%';
  FLUSH PRIVILEGES;
"

# 2. Get primary position
docker exec stockix-mysql mysql -uroot -p${SHARED_MYSQL_ROOT_PASSWORD} -e "SHOW MASTER STATUS\G"
# Note File and Position values

# 3. Configure replica
docker exec stockix-mysql-replica mysql -uroot -p${SHARED_MYSQL_ROOT_PASSWORD} -e "
  CHANGE MASTER TO
    MASTER_HOST='stockix-mysql',
    MASTER_USER='replicator',
    MASTER_PASSWORD='replpassword',
    MASTER_LOG_FILE='<File from step 2>',
    MASTER_LOG_POS=<Position from step 2>;
  START SLAVE;
"

# 4. Verify
docker exec stockix-mysql-replica mysql -uroot -p${SHARED_MYSQL_ROOT_PASSWORD} -e "SHOW SLAVE STATUS\G" \
  | grep -E "Seconds_Behind_Master|Slave_IO_Running|Slave_SQL_Running"
# Should show: Seconds_Behind_Master: 0, both Running: Yes
```

---

**Step 6 — Update Finance app connection to use ProxySQL**

Each Finance tenant's `.env` is provisioned with `SHARED_MYSQL_HOST`. Update the provisioning logic in `apps/api/src/domain/provisioner.ts` (or wherever tenant env files are written) to write `MYSQL_PROXY_HOST` instead:

```typescript
// Before:
MYSQL_HOST=stockix-mysql
MYSQL_PORT=3306

// After:
MYSQL_HOST=${MYSQL_PROXY_HOST}   // → stockix-mysql-proxy
MYSQL_PORT=${MYSQL_PROXY_PORT}   // → 6033
```

ProxySQL handles the read/write split transparently — Finance's Knex connection needs no changes.

---

**Step 7 — Add ProxySQL replica lag alert**

`infra/prod/alerts.yml` — add:
```yaml
- alert: MySQLReplicaLagging
  expr: mysql_slave_status_seconds_behind_master > 30
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "MySQL replica is lagging > 30 seconds"
    description: "Finance reports may return stale data. Check replica status."

- alert: MySQLReplicaDown
  expr: mysql_slave_status_slave_sql_running == 0 or mysql_slave_status_slave_io_running == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "MySQL replica SQL or IO thread stopped"
```

---

### Files Created/Changed
| File | Change |
|------|--------|
| `infra/shared/docker-compose.yml` | Add `stockix-mysql-proxy` + `stockix-mysql-replica` |
| `infra/shared/proxysql/proxysql.cnf` | New — ProxySQL routing config |
| `infra/prod/alerts.yml` | Add replica lag + down alerts |
| `apps/api/src/domain/provisioner.ts` | Write `MYSQL_PROXY_HOST`/`PORT` to tenant env instead of direct host |
| Bootstrap script | One-time replication setup on production server |

### Acceptance Criteria
- `SHOW SLAVE STATUS\G` shows `Seconds_Behind_Master: 0` under normal load
- A read-heavy report (Balance Sheet with 1000 journal entries) executes against the replica — confirm via ProxySQL admin: `SELECT * FROM stats_mysql_query_rules` shows read traffic routing to hostgroup 1
- Killing the replica: Finance writes continue working (ProxySQL fails back to primary for reads)
- P95 Finance report generation time drops by > 40% under 50-tenant concurrent load test
- `BackupNotRunInLast26Hours` alert does NOT fire (backups still hit primary, not replica)

---

## Summary Table

| Item | Deadline | Effort | Owner | Gate |
|------|----------|--------|-------|------|
| P2-02 — Legacy route removal | 2026-09-15 | 1 day | Backend | Log audit first — no deletion without zero hits |
| P2-03 — Dev-as-prod mirror | Sprint 2 | 1 day | DevOps/Backend | Docker socket access on dev machines |
| P3-02 — POS UI consolidation | Sprint 3 | 2 days | Frontend | POS typecheck + build pass |
| P3-03 — MetaTable expansion | Sprint 3 | 2 days | Frontend | 5 pages migrated; audit-log < 100 lines |
| P3-04 — MySQL replicas | At 50 tenants | 1 day code + server ops | Backend/DevOps | Replica lag < 5s sustained; no backup regressions |
