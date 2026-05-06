import { randomUUID } from "node:crypto";
import { execa } from "execa";
import { apiConfig } from "@repo/config";
import {
  createDb,
} from "@repo/db";
import {
  adminAuditLog,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import {
  deprovisionTenant,
  provisionTenant,
} from "../domain/provisioner.js";

const workerId = `infra-worker-${randomUUID()}`;
const pollMs = 1500;
const apiBaseUrl = `http://localhost:${apiConfig.port}`;

type ClaimedJob = {
  id: string;
  type: string;
  tenantId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
};

async function claimNextJob(): Promise<ClaimedJob | null> {
  const secret = apiConfig.platformApiSecret;
  const res = await fetch(`${apiBaseUrl}/internal/jobs/claim`, {
    method: "POST",
    headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
  });
  if (!res.ok) throw new Error(`claim_failed:${res.status}`);
  const body = (await res.json()) as { job?: ClaimedJob | null };
  return body.job ?? null;
}

async function markJobComplete(jobId: string): Promise<void> {
  const secret = apiConfig.platformApiSecret;
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/complete`, {
    method: "POST",
    headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
  });
  if (!res.ok) throw new Error(`complete_failed:${res.status}`);
}

async function markJobFailure(jobId: string, message: string): Promise<void> {
  const secret = apiConfig.platformApiSecret;
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/fail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ error: message }),
  });
  if (!res.ok) throw new Error(`fail_failed:${res.status}`);
}

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

async function loop() {
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for infra worker");
  }
  const db = createDb(databaseUrl);
  console.log(`[worker] started as ${workerId}`);
  while (true) {
    const job = await claimNextJob().catch((error) => {
      console.error(`[worker] claim error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!job) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    try {
      const handler = handlers[job.type as keyof typeof handlers] as (db: ReturnType<typeof createDb>, job: typeof job) => Promise<void>;
      await handler(db, job);
      await markJobComplete(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker][${job.id}] failed: ${message}`);
      await markJobFailure(job.id, message);
    }
  }
}

void loop();
