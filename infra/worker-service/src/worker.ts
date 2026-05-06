import { randomUUID } from "node:crypto";
import { execa } from "execa";
import { apiConfig } from "@repo/config";
import {
  createDb,
  getTenantJobById,
  updateTenantJob,
} from "@repo/db";
import {
  adminAuditLog,
  tenantLifecycleJobs,
  tenantDeployments,
  tenants,
} from "@repo/db/schema";
import { asc, eq } from "drizzle-orm";
import {
  deprovisionTenant,
  provisionTenant,
} from "../domain/provisioner.js";

const workerId = `infra-worker-${randomUUID()}`;
const pollMs = 1500;

async function runProvisionJob(db: ReturnType<typeof createDb>, job: {
  id: string;
  correlationId: string | null;
  payload: Record<string, unknown>;
}) {
  const payload = job.payload;
  const result = await provisionTenant(
    db,
    {
      slug: String(payload.slug ?? ""),
      name: String(payload.name ?? ""),
      ownerId: String(payload.ownerId ?? ""),
      adminEmail: String(payload.adminEmail ?? ""),
      adminFirstName: String(payload.adminFirstName ?? ""),
      adminLastName: String(payload.adminLastName ?? ""),
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
  const removeVolumes = Boolean(job.payload.removeVolumes);
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
  status: string,
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
  await db.update(tenants).set({ status }).where(eq(tenants.id, row.tenantId));
  await db
    .update(tenantDeployments)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, row.tenantId));
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
    String(job.payload.status ?? ""),
  ),
} as const;

async function markJobSuccess(db: ReturnType<typeof createDb>, jobId: string) {
  await updateTenantJob(db, jobId, {
    status: "completed",
    completedAt: new Date(),
    lastError: null,
  });
}

async function markJobFailure(db: ReturnType<typeof createDb>, jobId: string, message: string) {
  await updateTenantJob(db, jobId, {
    status: "failed",
    lastError: message.slice(0, 4000),
  });
}

async function loop() {
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for infra worker");
  }
  const db = createDb(databaseUrl);
  console.log(`[worker] started as ${workerId}`);
  while (true) {
    const [pending] = await db
      .select({ id: tenantLifecycleJobs.id })
      .from(tenantLifecycleJobs)
      .where(eq(tenantLifecycleJobs.status, "pending"))
      .orderBy(asc(tenantLifecycleJobs.createdAt))
      .limit(1);
    if (!pending) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    await updateTenantJob(db, pending.id, { status: "running" });
    const job = await getTenantJobById(db, pending.id);
    if (!job) continue;
    try {
      const handler = handlers[job.type as keyof typeof handlers] as (db: ReturnType<typeof createDb>, job: typeof job) => Promise<void>;
      await handler(db, job);
      await markJobSuccess(db, job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker][${job.id}] failed: ${message}`);
      await markJobFailure(db, job.id, message);
    }
  }
}

void loop();
