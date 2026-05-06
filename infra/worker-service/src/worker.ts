import { randomUUID } from "node:crypto";
import { execa } from "execa";
import { apiConfig } from "@repo/config";
import {
  createDb,
} from "@repo/db";
import {
  adminAuditLog,
  tenantDeployments,
  tenants,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  deprovisionTenant,
  provisionTenant,
} from "../domain/provisioner.js";

const workerId = `infra-worker-${randomUUID()}`;
const pollMs = 1500;
const apiBaseUrl = `http://localhost:${apiConfig.port}`;
const requestTimeoutMs = 10_000;
let shuttingDown = false;

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function emitWorkerMetric(name: string, value: number, tags: Record<string, string | number>) {
  const endpoint = apiConfig.metricsEndpoint;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiConfig.metricsAuthToken ? { Authorization: `Bearer ${apiConfig.metricsAuthToken}` } : {}),
    },
    body: JSON.stringify({
      source: "worker",
      workerId,
      name,
      value,
      tags,
      ts: new Date().toISOString(),
    }),
    signal: timeoutSignal(requestTimeoutMs),
  }).catch(() => undefined);
}

type ClaimedJob = {
  id: string;
  type: string;
  tenantId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
};

async function claimNextJob(): Promise<ClaimedJob | null> {
  const secret = apiConfig.platformApiSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ workerId }),
    signal: timeoutSignal(requestTimeoutMs),
  });
  if (!res.ok) throw new Error(`claim_failed:${res.status}`);
  const body = (await res.json()) as { job?: ClaimedJob | null };
  return body.job ?? null;
}

async function markJobComplete(jobId: string): Promise<void> {
  const secret = apiConfig.platformApiSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ workerId }),
    signal: timeoutSignal(requestTimeoutMs),
  });
  if (!res.ok) throw new Error(`complete_failed:${res.status}`);
}

async function markJobFailure(jobId: string, message: string): Promise<void> {
  const secret = apiConfig.platformApiSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/fail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ error: message, workerId }),
    signal: timeoutSignal(requestTimeoutMs),
  });
  if (!res.ok) throw new Error(`fail_failed:${res.status}`);
}

const provisionPayloadSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  ownerId: z.string().uuid(),
  adminEmail: z.string().email(),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().min(1),
});

async function runProvisionJob(db: ReturnType<typeof createDb>, job: {
  id: string;
  correlationId: string | null;
  payload: Record<string, unknown>;
}) {
  const payload = provisionPayloadSchema.parse(job.payload);
  const result = await provisionTenant(
    db,
    {
      slug: payload.slug,
      name: payload.name,
      ownerId: payload.ownerId,
      adminEmail: payload.adminEmail,
      adminFirstName: payload.adminFirstName,
      adminLastName: payload.adminLastName,
    },
    (m) => console.log(`[worker][${job.id}] ${m}`),
    job.correlationId ?? randomUUID(),
  );
  if (!result.ok) {
    throw new Error(result.message);
  }
  await db.insert(adminAuditLog).values({
    actorId: String(payload.ownerId ?? ""),
    action: "tenant.create",
    targetTenantId: result.tenantId,
    ipAddress: workerId,
    userAgent: "infra-worker",
    metadata: { mode: "job_worker", jobId: job.id },
  }).catch(() => undefined);
}

async function runDeprovisionJob(db: ReturnType<typeof createDb>, job: {
  id: string;
  tenantId: string | null;
  payload: Record<string, unknown>;
}) {
  if (!job.tenantId) throw new Error("tenantId is required");
  const removeVolumes = job.payload.removeVolumes === true;
  const result = await deprovisionTenant(db, job.tenantId, {
    removeVolumes,
    log: (m) => console.log(`[worker][${job.id}] ${m}`),
  });
  if (!result.ok) throw new Error(result.message);
}

async function runTenantLifecycleCommand(
  db: ReturnType<typeof createDb>,
  job: { tenantId: string | null; id: string },
  command: string,
) {
  if (!job.tenantId) throw new Error("tenantId is required");
  const rows = await db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      composeProjectName: tenantDeployments.composeProjectName,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, job.tenantId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.composeProjectName) {
    throw new Error("tenant_not_found");
  }
  await execa("docker", ["compose", "-p", row.composeProjectName, command], {
    timeout: 60_000,
  });
}

const handlers = {
  "tenant.provision": runProvisionJob,
  "tenant.deprovision": runDeprovisionJob,
  "tenant.lifecycle": (
    db: ReturnType<typeof createDb>,
    job: { tenantId: string | null; id: string; payload: Record<string, unknown> },
  ) => runTenantLifecycleCommand(
    db,
    job,
    String(job.payload.command ?? ""),
  ),
} as const;

type JobHandler = (db: ReturnType<typeof createDb>, job: ClaimedJob) => Promise<void>;

async function loop() {
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for infra worker");
  }
  const db = createDb(databaseUrl);
  console.log(JSON.stringify({ level: "info", type: "worker_start", workerId }));
  while (!shuttingDown) {
    const job = await claimNextJob().catch((error) => {
      console.error(`[worker] claim error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!job) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    try {
      const handler = handlers[job.type as keyof typeof handlers] as JobHandler | undefined;
      if (!handler) {
        throw new Error(`unsupported_job_type:${job.type}`);
      }
      await handler(db, job);
      await markJobComplete(job.id);
      await emitWorkerMetric("worker.job.success", 1, { jobType: job.type });
      console.log(
        JSON.stringify({
          level: "info",
          type: "worker_job_result",
          workerId,
          jobId: job.id,
          jobType: job.type,
          status: "success",
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker][${job.id}] failed: ${message}`);
      try {
        await markJobFailure(job.id, message);
        await emitWorkerMetric("worker.job.failure", 1, { jobType: job.type });
        console.log(
          JSON.stringify({
            level: "error",
            type: "worker_job_result",
            workerId,
            jobId: job.id,
            jobType: job.type,
            status: "failed",
            error: message,
          }),
        );
      } catch (reportError) {
        console.error(
          `[worker][${job.id}] failed to report failure: ${reportError instanceof Error ? reportError.message : String(reportError)}`,
        );
      }
    }
  }
}

process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGTERM", workerId }));
});
process.on("SIGINT", () => {
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGINT", workerId }));
});

void loop();
