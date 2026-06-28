# Layer 1 Network Architecture Audit

## 1. Shared Overlay Network — Find the definition
**Network Name**: `stockix_public`

* `infra/deploy/swarm-init.sh`
  * Exact lines (197-201): 
    ```bash
    if docker network inspect stockix_public >/dev/null 2>&1; then
      info "stockix_public: exists"
    else
      docker network create --driver overlay --label com.stockix.managed=true stockix_public
    fi
    ```
  * Definition: Created explicitly via `docker network create`.
* `infra/prod/docker-compose.yml`
  * Exact lines (803-804):
    ```yaml
      stockix_public:
        name: stockix_public
    ```
  * Definition: Defined inline at the bottom of the Compose file.
* `scripts/dev-stockix.mjs`
  * Exact line (232): `ensureDockerNetwork("stockix_public");`
  * Definition: Created inline via shell execution helper.

---

## 2. Per-Tenant Compose Stacks — Find how they attach to networks
**File 1**: `infra/tenant-stack/docker-compose.yml` (Finance)
* Networks Defined: `stockix-shared`, `stockix_public`
* `stockix_public` as `external: true`?: Yes (lines 166-169)
* Tenant Services Attachment: `server` container attaches to both `stockix-shared` and `stockix_public`.

**File 2**: `infra/pos-tenant-stack/docker-compose.yml` (POS)
* Networks Defined: `stockix-shared`, `stockix_public`
* `stockix_public` as `external: true`?: Yes (lines 175-177)
* Tenant Services Attachment: `pos-backend` and `pos-frontend` attach to `stockix_public`. Workers only attach to `stockix-shared`.

**File 3**: `infra/pms-tenant-stack/docker-compose.yml` (PMS)
* Networks Defined: `stockix_public`, `pms_internal`
* `stockix_public` as `external: true`?: Yes (lines 60-62)
* Tenant Services Attachment: `pms-frontend` attaches to `stockix_public` and `pms_internal`. `pms-api` attaches ONLY to `pms_internal`.

---

## 3. Localhost / 127.0.0.1 Leaks — Full scan

* `apps/api/src/pos-proxy.ts`
  * Line 70: `base = requireEnv("POS_PLATFORM_BASE_URL", "http://localhost:8010");`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/api/src/pos-public-url.ts`
  * Line 6: `return publicConfig.stockixLocalTenantHost || "127.0.0.1";`
  * Line 19: `if (rootDomain === "localhost") {`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/api/src/routes/internal.ts`
  * Line 1716: `const host = process.env.STOCKIX_FINANCE_INTERNAL_HOST || "127.0.0.1";`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/api/src/routes/pms-proxy-http.ts`
  * Line 35: `baseUrl: requireEnv("PMS_BASE_URL", "http://localhost:3003"),`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/api/src/routes/pos-proxy-http.ts`
  * Line 552: `base = requireEnv("POS_PLATFORM_BASE_URL", "http://localhost:8010");`
  * Line 554: `frontendUrl = requireEnv("POS_FRONTEND_URL", "http://localhost:3001");`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/api/src/finance-license.client.ts`
  * Line 170: `const host = requireEnv("STOCKIX_FINANCE_INTERNAL_HOST", "127.0.0.1");`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/api/src/pms-proxy.ts`
  * Line 6: `return requireEnv("PMS_BASE_URL", "http://localhost:3003");`
  * Classification: Container Runtime Code (CRITICAL)
* `services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.ts`
  * Line 28: `origins.add('http://127.0.0.1:${proxyPort}');`
  * Line 29: `origins.add('http://localhost:${proxyPort}');`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/dashboard/lib/tenant-url.ts`
  * Line 8: `if (publicRootDomain === "localhost" && port != null) {`
  * Classification: Container Runtime Code (CRITICAL)
* `apps/api/scripts/provision-smoke.mjs`
  * Line 136: `http://127.0.0.1:${port}`
  * Classification: Dev-Only Config (LOW)
* `apps/api/scripts/provision-module-matrix.mjs`
  * Line 426: `` `http://127.0.0.1:${port}/api/ping/` ``
  * Classification: Dev-Only Config (LOW)

---

## 4. Swarm Shared Services — Check network attachment

In `infra/prod/docker-compose.yml`:
* `socket-proxy`: `socket_proxy_network` (NOT attached to `stockix_public`)
* `traefik`: `stockix_public`, `stockix_internal`, `socket_proxy_network`
* `postgres`: `stockix_internal` (NOT attached to `stockix_public`)
* `postgres-exporter`: `stockix_internal` (NOT attached to `stockix_public`)
* `pgbouncer`: `stockix_internal` (NOT attached to `stockix_public`)
* `control-plane-redis`: `stockix_internal` (NOT attached to `stockix_public`)
* `api`: `stockix_internal`, `stockix_public`
* `api-bullmq`: `stockix_internal` (NOT attached to `stockix_public`)
* `dashboard`: `stockix_public`, `stockix_internal`
* `infra-worker`: `stockix_internal`, `socket_proxy_network`, `stockix-shared` (NOT attached to `stockix_public`)
* `node-exporter`: `stockix_internal` (NOT attached to `stockix_public`)
* `redis-exporter`: `stockix_internal` (NOT attached to `stockix_public`)
* `prometheus`: `stockix_internal` (NOT attached to `stockix_public`)
* `alertmanager`: `stockix_internal`, `stockix_public`
* `tempo`: `stockix_internal` (NOT attached to `stockix_public`)
* `grafana`: `stockix_internal`, `stockix_public`
* `db-backup`: `stockix_internal`, `stockix-shared` (NOT attached to `stockix_public`)

---

## 5. Host-Bound Port Leaks — Full scan

* `infra/prod/docker-compose.yml`
  * Line 176 (traefik): `- "127.0.0.1:8080:8080"`
  * Line 255 (postgres): `- "127.0.0.1:54330:5432"`
* `infra/tenant-stack/docker-compose.yml`
  * Line 126 (server): `- "127.0.0.1:${PUBLIC_PROXY_PORT}:3000"`
* `infra/pos-tenant-stack/docker-compose.yml`
  * Line 56 (pos-backend): `- "127.0.0.1:${POS_HOST_PORT:-8010}:8010"`
  * Line 159 (pos-frontend): `- "127.0.0.1:${POS_FRONTEND_HOST_PORT:-3001}:3000"`
* `infra/pms-tenant-stack/docker-compose.yml`
  * Line 17 (pms-frontend): `- "127.0.0.1:${PMS_FRONTEND_HOST_PORT:-3004}:3000"`
  * Line 48 (pms-api): `- "127.0.0.1:${PMS_HOST_PORT:-3003}:3003"`

---

## 6. Traefik Routing — How tenant traffic is routed

* **Traefik Providers:** Uses Swarm (`--providers.swarm=true`). It does not use `--providers.docker`.
* **Per-Tenant Traefik Labels:** None of the per-tenant containers have Traefik labels (`traefik.enable=true`, `routers`, etc.). They rely on host-bound ports and the Traefik file provider/gateway proxying.
* **Network Watched:** Traefik is configured to watch `stockix_public` via `--providers.swarm.network=stockix_public`.

---

## 7. Summary Table

| Issue | File | Severity | Notes |
|-------|------|----------|-------|
| Inline network creation script | `infra/deploy/swarm-init.sh` | LOW | Creates `stockix_public` directly via shell script. |
| Mixed Swarm/Compose Network | `infra/prod/docker-compose.yml` | HIGH | `stockix_public` defined natively instead of `external: true` despite Swarm execution. |
| Tenant stack networks | `infra/tenant-stack/docker-compose.yml` | HIGH | Attaches `stockix_public` properly as `external: true` but leaks host bounds. |
| Fallback URL loopback leak | `apps/api/src/pos-proxy.ts` | CRITICAL | Fallback to `http://localhost:8010` in container runtime. |
| Host resolution loopback leak | `apps/api/src/pos-public-url.ts` | CRITICAL | Resolves to `127.0.0.1` and matches `localhost` at runtime. |
| Internal Finance host leak | `apps/api/src/routes/internal.ts` | CRITICAL | `STOCKIX_FINANCE_INTERNAL_HOST` falls back to `127.0.0.1`. |
| PMS Proxy URL leak | `apps/api/src/routes/pms-proxy-http.ts` | CRITICAL | Fallback to `http://localhost:3003` inside container. |
| POS proxy URL leak | `apps/api/src/routes/pos-proxy-http.ts` | CRITICAL | Fallbacks to `localhost:8010` and `localhost:3001` inside container. |
| Client host leak | `apps/api/src/finance-license.client.ts` | CRITICAL | Fallbacks to `127.0.0.1` for internal host API calls. |
| PMS internal proxy leak | `apps/api/src/pms-proxy.ts` | CRITICAL | Fallback to `http://localhost:3003` for API routes. |
| Socket origin loopback leak | `socket-allowed-origins.ts` | CRITICAL | Checks for origins from `127.0.0.1` and `localhost` natively. |
| Tenant Domain loopback leak | `apps/dashboard/lib/tenant-url.ts` | CRITICAL | Specific fallback rendering matching `localhost` logic. |
| Dev smoke testing loopback | `apps/api/scripts/provision-smoke.mjs` | LOW | Uses loopback inside test script. |
| Dev matrix loopback | `apps/api/scripts/provision-module-matrix.mjs` | LOW | Uses loopback inside CLI script. |
| Traefik Host-bound port | `infra/prod/docker-compose.yml` | HIGH | Traefik leaks `- "127.0.0.1:8080:8080"`. |
| Postgres Host-bound port | `infra/prod/docker-compose.yml` | HIGH | DB leaks `- "127.0.0.1:54330:5432"`. |
| Finance tenant Host-bound port | `infra/tenant-stack/docker-compose.yml` | HIGH | `- "127.0.0.1:${PUBLIC_PROXY_PORT}:3000"` bypasses Swarm. |
| POS backend Host-bound port | `infra/pos-tenant-stack/docker-compose.yml` | HIGH | `- "127.0.0.1:${POS_HOST_PORT:-8010}:8010"` bypasses Swarm. |
| POS frontend Host-bound port | `infra/pos-tenant-stack/docker-compose.yml` | HIGH | `- "127.0.0.1:${POS_FRONTEND_HOST_PORT:-3001}:3000"` bypasses Swarm. |
| PMS frontend Host-bound port | `infra/pms-tenant-stack/docker-compose.yml` | HIGH | `- "127.0.0.1:${PMS_FRONTEND_HOST_PORT:-3004}:3000"` bypasses Swarm. |
| PMS API Host-bound port | `infra/pms-tenant-stack/docker-compose.yml` | HIGH | `- "127.0.0.1:${PMS_HOST_PORT:-3003}:3003"` bypasses Swarm. |
| Missing Tenant Traefik Labels | Per-Tenant Compose Files | CRITICAL | No dynamic Traefik labels; routing relies on static host-gateway. |
