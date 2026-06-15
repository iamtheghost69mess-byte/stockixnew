# Stockix Provisioning — Full Audit & Fix Plan

## 1. Provisioning Call Chain (end-to-end map)

Below is the complete end-to-end trace of a tenant provisioning request from the UI interaction to worker execution:

1. **Frontend Trigger**
   - **File**: [tenants-page-content.tsx](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/apps/dashboard/app/%28dashboard%29/tenants/_components/tenants-page-content.tsx)
   - **Function**: `provision(...)` starting at line 733.
   - **Action**: User clicks the provision button in the wizard. The client triggers a `POST` request to `/api/tenants`.
   - **Payload**: JSON containing `slug`, `name`, `owner_id`, `admin_email`, `admin_first_name`, `admin_last_name`, `plan_slug`, `modules`, `assign_existing_license_id`.

2. **Next.js BFF Route Forwarding**
   - **File**: [route.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/apps/dashboard/app/api/tenants/route.ts)
   - **Function**: `POST(req)` starting at line 34.
   - **Action**: Receives request, reads payload, and forwards it to the control-plane API via `apiFetch("/tenants", ...)` defined in [api-client.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/apps/dashboard/lib/api-client.ts).
   - **Transformations**: Appends the secret platform authorization header (`Authorization: Bearer <PLATFORM_API_SECRET>`), injects correlation IDs (`x-request-id` and `x-correlation-id`), and generates an `Idempotency-Key` header.

3. **Control-plane API Route Handler**
   - **File**: [tenants.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/apps/api/src/routes/tenants.ts)
   - **Endpoint**: `app.post("/tenants", ...)` (registered via Hono router in `registerTenantRoutes`).
   - **Action**: 
     - Validates payload using Zod.
     - Checks database to verify if the slug is taken. If taken by a failed or half-provisioned tenant, it cleans up (scrubs) the database transactionally across `tenantProvisionEvents`, `adminAuditLog`, `tenantDeployments`, `tenantLifecycleJobs`, and `tenants`.
     - Generates a unique `correlationId` using `randomUUID()`.
     - Records a preflight event to the `tenant_provision_events` table using `createProvisionTracer(...)`.
     - Inserts a job row into the `tenant_lifecycle_jobs` table via `insertTenantJob(...)` with `type: "tenant.provision"`, `status: "pending"`, and the payload.
     - Returns a `202 Accepted` response with the `jobId` and `correlationId`.

4. **Client-side Waiting & Monitoring**
   - **File**: [tenants-page-content.tsx](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/apps/dashboard/app/%28dashboard%29/tenants/_components/tenants-page-content.tsx)
   - **Action**: The UI transitions to the `"provisioning"` phase.
     - It opens a Server-Sent Events (SSE) stream to `/api/tenants/provision-stream/:correlationId` to receive real-time trace events.
     - It polls `/api/tenants/provision-status/:correlationId` every 2000ms as a fallback and to detect job completion.

5. **Worker Polling and Claiming**
   - **File**: [worker.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/infra/worker-service/src/worker.ts)
   - **Loop**: `workerPollLoop(db, loopId)` executes repeatedly.
   - **Action**: The worker issues a `POST` request to `/internal/jobs/claim` to check for work.
   - **Control-plane Claiming Route**: Inside `apps/api/src/routes/internal.ts`, the Hono route `app.post("/internal/jobs/claim", ...)` claims the oldest `pending` job by updating its status to `running`, generating a `claimToken`, setting `claimedAt`/`claimedBy`, and returning the claimed job row.

6. **Worker Provisioner Execution**
   - **File**: [worker.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/infra/worker-service/src/worker.ts) -> [provisioner.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/infra/worker-service/domain/provisioner.ts)
   - **Action**: Worker claims the job, launches a background heartbeat loop to touch the job's `claimedAt` timestamp, and invokes `runProvisionJob(db, job)`.
   - **Sub-calls**: Calls `provisionTenant(...)` in `provisioner.ts` which:
     - Creates MySQL database schemas on the shared MySQL server.
     - Registers a new tenant user and syncs user credentials via ProxySQL.
     - Spawns the tenant's individual Docker Compose services.
     - Configures reverse proxy mappings via Traefik.
     - Seeds the database and retrieves the bootstrap password.

---

## 2. Current Break Point

The current hang at `"Submitting to control plane…"` is caused by a port conflict and lack of timeouts in the readiness path:

* **The Host/WSL2 Port Conflict**: Docker Desktop runs containers inside a WSL2 virtual machine. Port mappings (e.g. Redis `6379`) are exposed to the Windows host. However, WSL2 runs `wslhost.exe` on the host, which binds to `127.0.0.1:6379` to proxy connections into the WSL2 VM. Because the Node.js API server runs directly on the host and targets `127.0.0.1:6379`, its connection requests are intercepted by the WSL2 proxy. The TCP socket connection completes, but the proxy hangs indefinitely because no service within WSL2 is actively processing the port-forwarded traffic.
* **Unbounded Redis Ping**: The control-plane Hono API readiness endpoint `/ready` (in `apps/api/src/routes/public.ts`) checks Redis health by calling `redisClient.ping()`. Because this call is not wrapped in a timeout, it blocks the Node.js event loop/Hono handler indefinitely when the connection hangs.
* **Orchestrator Hang**: The API server becomes completely unresponsive. The worker cannot proceed because it is waiting on `waitForApiReady()` to ping `/ready`. The Next.js BFF request is blocked, and after 90 seconds, the client-side fetch throws: `"Provision request timed out after 90s. The control-plane API may be hung"`.

---

## 3. All Known Bugs Found During Audit

1. **Unbounded Redis Ping in `/ready`**
   - **Location**: [public.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/apps/api/src/routes/public.ts#L55)
   - **Impact**: Any connection delay or host port mapping conflict on Redis causes the API server to hang indefinitely, blocking all other endpoints.

2. **Stale Dev Worker Rebuild Verification**
   - **Location**: [dev-stockix.mjs](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/scripts/dev-stockix.mjs#L246-L273)
   - **Impact**: The script only compares the modified time of `src/worker.ts` against the compiled `worker.js` bundle. If files under `infra/worker-service/domain/` (such as `provisioner.ts`) are updated, the script fails to detect that the worker is stale, leaving the worker running an old bundle unless `STOCKIX_DEV_FORCE_BUILD=1` is manually supplied.

3. **Fragile Container ID Regex Filtering**
   - **Location**: [provisioner.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/infra/worker-service/domain/provisioner.ts#L248)
   - **Impact**: `getComposeContainerName` executes `docker compose ps -q service` and expects a clean hex container ID. In newer Docker Compose V2 environments, `ps -q` can output the full container name (e.g. `stockix-shared-stockix-redis-1`) containing hyphens. The strict hex-only check `/^[a-f0-9]{12,64}$/i` filters out these valid names and returns `null`, breaking Redis flushing and ProxySQL sync fallbacks.

4. **BFF Client Fetch Timeout Limitations**
   - **Location**: [api-connection.ts](file:///c:/Users/Jad/Desktop/stokcix/stockixnew/apps/dashboard/lib/api-connection.ts)
   - **Impact**: Relying solely on `AbortSignal.timeout()` is unreliable in Node.js when dealing with hung sockets that remain open but transmit no data. A manual `setTimeout` abort trigger is needed to guarantee cancellation.

---

## 4. Shared Docker Architecture

The Stockix platform uses a hybrid multi-tenant approach with shared backing services and isolated application runtimes:

* **Shared vs. Per-Tenant Containers**:
  * **Shared Infrastructure**:
    * `stockix-mysql`: Holds all tenant databases (`stockix_<slug>_finance` and `stockix_<slug>_system`).
    * `stockix-mysql-proxy`: ProxySQL instance managing connections and routing to `stockix-mysql`.
    * `stockix-mongo`: Shared Mongo instances utilizing replica set `rs0` for transaction capabilities.
    * `stockix-redis`: Shared caching and job queues.
  * **Per-Tenant Infrastructure**:
    * Spawns separate compose projects named `stockix-<tenant_slug>` containing the Next.js `stockix-server` instance.
* **Worker Connectivity**:
  * **Production**: Worker and containers run in the same Docker network bridge and connect directly using container hostnames (e.g. `stockix-redis:6379`).
  * **Development**: The worker runs on the host machine and accesses shared containers using published localhost ports (e.g. `127.0.0.1:3306`, `127.0.0.1:27017`) mapped via Docker Compose.
* **Name Resolution**:
  * Environmental host mappings are populated at dev startup (e.g. `WORKER_SHARED_MYSQL_HOST` is mapped to `127.0.0.1` for host access, but container-to-container targets map to internal hosts like `stockix-mysql`).

---

## 5. Dev vs Production Gaps

* **Network Exposure**: In development, the worker runs directly on the Windows host. This makes it susceptible to local port collisions (such as the WSL2 Redis proxy conflict). In production, the worker runs inside the isolated bridge network, bypassing host proxy layers.
* **ProxySQL Administration**: In dev, the worker might fail to connect to ProxySQL port `6032` if it is not published to the host, forcing a fallback to `docker exec` which depends on fragile container name lookup scripts. In production, ProxySQL is reachable via direct TCP over the container network.

---

## 6. Fix Plan

Below are the recommended file-by-file changes required to resolve all diagnosed issues:

### 1. `apps/api/src/routes/public.ts`
* Wrap the `redisClient.ping()` check inside a promise race with a 2-second timeout:
```typescript
const pingPromise = redisClient.ping();
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error("Redis ping timeout")), 2000)
);
const pong = await Promise.race([pingPromise, timeoutPromise]);
```

### 2. `infra/worker-service/domain/provisioner.ts`
* Update the regex inside `getComposeContainerName` to allow alphanumeric characters, hyphens, and underscores to match container names returned by modern Docker compose:
```diff
- .find((line) => /^[a-f0-9]{12,64}$/i.test(line));
+ .find((line) => /^[a-f0-9_--]{12,64}$/i.test(line));
```

### 3. `scripts/dev-stockix.mjs`
* Expand `workerStale` logic to check modified times of all `.ts` files in the `infra/worker-service` directory (especially the `domain/` directory) rather than just the single `src/worker.ts` file.

### 4. `.env` / Redis Config
* Reconfigure control-plane Redis to map to a different host port in development (e.g. `63790`) to completely bypass the default WSL2 proxy port binding collision.

---

## 7. What Must Never Be Broken Again

* **One-Time Passwords In-Memory-Only Limit**: One-time admin passwords generated during provisioning must only exist in temporary in-memory stores (`provisionPasswordCache`). They must **never** be saved to persistent database tables or printed in logs.
* **Fail-Fast Provisioning**: Jobs of type `tenant.provision`, `organization.provision`, or `add_module` must never be retried automatically by the worker. A half-failed database migration or container state must fail immediately to allow clean scrubs.
* **Lifecycle Isolation via Advisory Locks**: The worker must always wrap provisioning and deprovisioning steps in `withTenantLifecycleAdvisoryLock` to prevent concurrent operations on the same tenant.
