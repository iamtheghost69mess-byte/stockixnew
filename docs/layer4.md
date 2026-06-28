# Layer 4 Provisioning State Machine Audit

## 1. Main Provisioning Entry Point

- **File Path**: `infra/worker-service/src/worker.ts`
- **Total Line Count**: 1671 lines
- **Job Name / Queue Name**: **NO BULLMQ USED**. Stockix uses a custom HTTP polling loop that calls `${apiBaseUrl}/internal/jobs/claim` to fetch jobs from the `tenant_lifecycle_jobs` Postgres table.
- **Global Timeout**: `apiConfig.workerJobExecutionTimeoutMs`
- **Try/Catch at Top Level**: Yes. Provisioning is wrapped in `try/catch` and `guardNoConcurrentProvision` to avoid race conditions.

<details><summary>First 100 Lines of worker.ts</summary>

```typescript
import './env'; // Boot validation — must be first
import * as Sentry from "@sentry/node";
import http from "node:http";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { logger } from "./lib/logger.js";

let workerControlPlaneRedis: Redis | null = null;

function getWorkerRedisClient(): Redis | null {
  const url = apiConfig.controlPlaneRedisUrl;
  if (!url) return null;
  if (!workerControlPlaneRedis) {
    workerControlPlaneRedis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 2000,
    });
    workerControlPlaneRedis.on("error", (err: Error) => {
      logger.warn("Worker control plane Redis connection error", { err: err.message });
    });
  }
  return workerControlPlaneRedis;
}

if (apiConfig.sentryDsn?.trim()) {
  Sentry.init({
    dsn: apiConfig.sentryDsn,
    environment: apiConfig.sentryEnvironment ?? apiConfig.nodeEnv ?? "development",
    release: apiConfig.releaseVersion,
    tracesSampleRate: 0.1,
    integrations: [Sentry.httpIntegration()],
  });
} else if (apiConfig.nodeEnv === "production") {
  logger.warn(
    "SENTRY_DSN not configured — errors will not be tracked in Sentry. " +
      "Set SENTRY_DSN in infra/prod/.env to enable production error monitoring.",
    { event: "sentry_dsn_missing_startup" },
  );
}
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { apiConfig } from "@repo/config";
import {
  createDb,
} from "@repo/db";
import {
  adminAuditLog,
  tenantLifecycleJobs,
  tenantProvisionEvents,
  tenantDeployments,
  tenants,
  licenses,
  deadLetterJobs,
  owners,
  organizations,
} from "@repo/db/schema";
import { and, eq, sql, isNotNull, lte, gte } from "drizzle-orm";
import {
  initEmailLogging,
  processLicenseExpiryFollowUp,
  syncFinanceLicenseForStockixTenant,
  sendMail,
  sendModuleAddedEmail,
  sendModuleRemovedEmail,
} from "@repo/platform-worker-shared";
import { z } from "zod";
import { checkRequiredTenantImages } from "../domain/provisioning/check-tenant-images.js";
import {
  resolveProvisionJobOutcome,
  type ProvisionJobOutcome,
} from "../domain/provisioning/provision-outcome-rules.js";
import {
  assertNoConcurrentTenantLifecycleJob,
  shutdownAdvisoryLockClient,
  withTenantLifecycleAdvisoryLock,
} from "../domain/provisioning/provision-lock.js";
import {
  deprovisionTenant,
  provisionTenant,
} from "../domain/provisioner.js";
import { scrubTenantRuntimeArtifacts } from "../domain/scrub-tenant-artifacts.js";
import { executeOrgProvisionRuntime } from "./org-provision-runtime.js";
import { executeAddModuleRuntime } from "./provision-runtime.js";
import { stopFinanceStack, stopModuleStack } from "./module-stacks.js";
import { composeProjectName as resolveComposeProjectName } from "../domain/provisioning/compose-project-name.js";
import { deprovisionChatwootAccount } from "./chatwoot-provision.js";

const workerId = `infra-worker-${randomUUID()}`;
const pollMs = Math.max(
  250,
  parseInt(process.env.PROVISION_POLL_MS ?? String(apiConfig.provisionPollMs), 10) || apiConfig.provisionPollMs,
);
const POLL_INTERVAL_MS = pollMs;
```
</details>

---

## 2. Map Every Provisioning Step

Extracted from `infra/worker-service/src/provision-runtime.ts`.
The system uses an append-only event-sourcing model ("Journal State") with `!hasOp("step_name")` blocks to prevent re-execution of completed steps.

1. `docker.data_step`: Runs `docker compose up stockix-mysql-proxy stockix-mongo -d`. Timeout: Yes. Idempotent: Yes. Persisted: Yes.
2. `docker.migration_step`: Runs `docker compose up stockix-finance-server -d`. Timeout: Yes. Idempotent: Yes. Persisted: Yes.
3. `docker.app_step`: Runs `docker compose up -d` for all remaining app containers. Timeout: Yes. Idempotent: Yes. Persisted: Yes.
4. `docker.network_connect`: Connects containers to external Traefik networks. Timeout: No. Idempotent: Yes. Persisted: Yes.
5. `tenant.health_check`: Checks Finance and POS health endpoints. Timeout: Yes. Idempotent: Yes. Persisted: Yes.
6. `edge.publish`: Writes Traefik YAML router files for DNS routing. Timeout: No. Idempotent: Yes. Persisted: Yes.
7. `tenant.bootstrap_admin`: Calls Finance API to create the bootstrap admin account. Timeout: No. Idempotent: Yes (API returns 200 if already exists). Persisted: Yes.
8. `tenant.fetch_org_settings`: Fetches Finance default settings and JWT. Timeout: No. Idempotent: Yes. Persisted: Yes.
9. `tenant.build_organization`: Initializes the Bigcapital organization payload. Timeout: No. Idempotent: Yes. Persisted: Yes.
10. `tenant.complete_setup_wizard`: Finalizes Finance wizard to lock initialization. Timeout: No. Idempotent: No (fails if already locked). Persisted: Yes.
11. `tenant.activate_warehouses`: Seeds and enables Bigcapital warehouses. Timeout: No. Idempotent: Yes. Persisted: Yes.
12. `tenant.seed_pos_defaults`: Writes POS locations, tax settings, and credentials into Mongo. Timeout: No. Idempotent: No (can create duplicates if Mongo isn't guarded). Persisted: Yes.
13. `add_module.accounting_stack` / `add_module.finance_welcome_email`: Sends welcome emails. Timeout: No. Idempotent: No (sends twice). Persisted: Yes.

---

## 3. Find All Side Effects That Are NOT Idempotent

| File Path + Line | Exact Operation | Guard / Idempotent | Impact on Retry |
|------------------|----------------|--------------------|----------------|
| `infra/worker-service/src/provision-runtime.ts:2089` | `await sendFinanceWelcomeEmail({...})` | `!hasOp` journal state | **HIGH**: If worker crashes *after* sending email but *before* saving journal state, the user receives multiple welcome emails. |
| `infra/worker-service/domain/provisioner.ts:192` | `registerMysqlUserInProxySql` | Checked via `verifyProxySqlTenantLogin` | **LOW**: Catches if already exists, mostly safe. |
| `infra/worker-service/src/chatwoot-provision.ts:73` | `provisionChatwootAccount` | Custom API call check | **MEDIUM**: Safe if API is idempotent, but duplicate network calls occur. |
| `infra/worker-service/src/provision-runtime.ts:1528` | `completeFinanceSetupWizard` | `!hasOp` journal state | **HIGH**: The Finance API prevents duplicate wizard completions. If it crashes after API call but before journal save, retry fails with HTTP 400. |
| `infra/worker-service/src/provision-runtime.ts:1663` | `seedFinancePosDefaults` | `!hasOp` journal state | **HIGH**: Will insert duplicate walk-in customers and locations in Mongo if run twice. |

---

## 4. Find the Dead Letter / Retry Configuration

Configuration is found in `tenantLifecycleJobs` schema and worker constants:

- **Attempts Setting**: `attempts` defaults to `0`, increments on each failure.
- **Max Attempts**: `max_attempts` defaults to `5`.
- **Backoff Strategy**: Fixed polling backoff handled by the worker loop sleeping. No exponential backoff natively seen in DB schema.
- **Global Timeout**: `WORKER_JOB_EXECUTION_TIMEOUT_MS` (dynamically injected via `apiConfig.workerJobExecutionTimeoutMs`).
- **Dead Letter Queue**: Yes. Schema defines `deadLetterJobs` table (`dead_letter_jobs` in PG). Jobs move here when `attempts >= max_attempts`.
- **Tenant State After Failure**: If a job fails after all attempts, the tenant status remains stuck in `provisioning` or falls back to `failed` depending on the outcome rules in `provision-outcome-rules.ts`.

---

## 5. Find Any Existing State Persistence

The codebase uses an event-sourcing mechanism called a **Provision Journal**:
- **What is saved**: `phase`, `level`, `message`, and `meta: { operationKey: "..." }`.
- **When is it saved**: **AFTER** an action completes successfully.
- **Used to skip**: Yes. `loadProvisionJournalState(db, correlationId)` extracts all `operationKey`s into a `Set` named `completedOps`. `hasOp(key)` guards every step.
- **Database Tables Used**: `tenantProvisionEvents` (logs steps), `tenantDeployments` (stores final URLs/credentials).

---

## 6. Find the Tenant Status / Lifecycle Schema

```typescript
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "restrict" }),
    adminEmail: text("admin_email").notNull(),
    adminFirstName: text("admin_first_name").notNull(),
    adminLastName: text("admin_last_name").notNull(),
    // provisioning | active | partial | failed | suspended | stopped
    status: text("status").notNull().default("active"),
    planSlug: text("plan_slug").notNull().default("starter"),
    modules: text("modules").notNull().default('["accounting"]'),
    chatwootAccountId: text("chatwoot_account_id"),
    organizationNumber: varchar("organization_number", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const tenantDeployments = pgTable(
  "tenant_deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    composeProjectName: text("compose_project_name").notNull(),
    internalPort: integer("internal_port").notNull(),
    mysqlPassword: text("mysql_password").notNull(),
    mysqlRootPassword: text("mysql_root_password").notNull(),
    jwtSecret: text("jwt_secret").notNull(),
    mongoUrl: text("mongo_url").notNull(),
    lastError: text("last_error"),
    partialFailureKind: text("partial_failure_kind"),
    registrationCompletedAt: timestamp("registration_completed_at", { withTimezone: true }),
    financeTenantId: integer("finance_tenant_id"),
    financeDefaultWarehouseId: integer("finance_default_warehouse_id"),
    financeWalkInCustomerId: integer("finance_walk_in_customer_id"),
    financeCashAccountId: integer("finance_cash_account_id"),
    financeCardAccountId: integer("finance_card_account_id"),
    posOrganizationId: text("pos_organization_id"),
    posUrl: text("pos_url"),
    financeAdminPassword: text("finance_admin_password"),
    financeDefaultBranchId: integer("finance_default_branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);
```

---

## 7. Map the Current Retry Behavior

When a provisioning job crashes at step 3 of 8 (e.g. `docker.app_step`):

1. **Which steps re-execute on retry**:
   - `docker.data_step` and `docker.migration_step` are SKIPPED because `hasOp` returns true (their events were persisted).
   - `docker.app_step` is RE-EXECUTED because the crash occurred before its completion event was written to `tenantProvisionEvents`.
2. **Which side effects fire twice**:
   - Docker Compose `up` runs again for `app_step`. This is safe (idempotent).
   - If the crash happened *after* the wizard was completed but *before* the journal write, `tenant.complete_setup_wizard` fires twice.
3. **What state the tenant ends up in**:
   - If a non-idempotent API (like the Finance wizard or Chatwoot) throws a 400 Bad Request on the second attempt, the job fails again.
   - The job will exhaust its 5 attempts and move to `dead_letter_jobs`.
   - The tenant `status` remains stuck as `provisioning` or becomes `partial`.
4. **Whether the tenant is recoverable**:
   - **No, without manual intervention.** Because the journal is strictly append-only post-completion, if an API call succeeds but the worker dies before logging it, the retry will permanently fail due to API validation rules rejecting duplicate creation.

---

## 8. Summary Table

| Step | Action | Has Timeout | Idempotent | State Persisted | Risk on Retry |
|---|---|---|---|---|---|
| 1 | `docker.data_step` | Yes | Yes | Yes (After) | LOW |
| 2 | `docker.migration_step` | Yes | Yes | Yes (After) | LOW |
| 3 | `docker.app_step` | Yes | Yes | Yes (After) | LOW |
| 4 | `docker.network_connect` | No | Yes | Yes (After) | LOW |
| 5 | `tenant.health_check` | Yes | Yes | Yes (After) | LOW |
| 6 | `edge.publish` | No | Yes | Yes (After) | LOW |
| 7 | `tenant.bootstrap_admin` | No | Yes | Yes (After) | LOW |
| 8 | `tenant.fetch_org_settings` | No | Yes | Yes (After) | LOW |
| 9 | `tenant.build_organization` | No | Yes | Yes (After) | LOW |
| 10 | `tenant.complete_setup_wizard` | No | No | Yes (After) | HIGH |
| 11 | `tenant.activate_warehouses` | No | Yes | Yes (After) | LOW |
| 12 | `tenant.seed_pos_defaults` | No | No | Yes (After) | HIGH |
| 13 | `add_module.finance_welcome_email`| No | No | Yes (After) | HIGH |
