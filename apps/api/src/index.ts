import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { serve } from "@hono/node-server";
import { createDb } from "@repo/db";

const apiDir = path.join(fileURLToPath(new URL("..", import.meta.url)));
loadEnv({ path: path.join(apiDir, ".env") });
// Gitignored overrides for local dev (wins over machine-level DATABASE_URL).
loadEnv({ path: path.join(apiDir, ".env.local"), override: true });
import { owners, tenantDeployments, tenants, tenantProvisionEvents } from "@repo/db/schema";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  getProvisionJob,
  setProvisionJob,
} from "./provision-jobs.js";
import { subscribeProvision } from "./provision-bus.js";
import { deprovisionTenant, provisionTenant } from "./provisioner.js";
import {
  createProvisionTracer,
  type ProvisionEventPayload,
} from "./provision-trace.js";

const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl ? createDb(databaseUrl) : null;

function rowToProvisionPayload(
  row: typeof tenantProvisionEvents.$inferSelect,
): ProvisionEventPayload {
  return {
    id: row.id,
    correlationId: row.correlationId,
    slug: row.slug ?? null,
    tenantId: row.tenantId ?? null,
    deploymentId: row.deploymentId ?? null,
    phase: row.phase,
    level: row.level,
    message: row.message,
    meta: row.meta ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadProvisionEventsJson(correlationId: string) {
  if (!db) return [];
  const rows = await db
    .select({
      id: tenantProvisionEvents.id,
      phase: tenantProvisionEvents.phase,
      level: tenantProvisionEvents.level,
      message: tenantProvisionEvents.message,
      meta: tenantProvisionEvents.meta,
      createdAt: tenantProvisionEvents.createdAt,
    })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .orderBy(
      asc(tenantProvisionEvents.createdAt),
      asc(tenantProvisionEvents.id),
    )
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    phase: r.phase,
    level: r.level,
    message: r.message,
    meta: r.meta ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/owners", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const rows = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
    })
    .from(owners);
  return c.json({ owners: rows });
});

app.get("/tenants", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const rows = await db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      adminEmail: tenants.adminEmail,
      deploymentStatus: tenantDeployments.status,
      internalPort: tenantDeployments.internalPort,
      composeProject: tenantDeployments.composeProjectName,
      lastError: tenantDeployments.lastError,
      registrationCompletedAt: tenantDeployments.registrationCompletedAt,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id));

  return c.json({ tenants: rows });
});

app.delete("/tenants/:tenantId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const tenantId = c.req.param("tenantId");
  const parsed = z.string().uuid().safeParse(tenantId);
  if (!parsed.success) {
    return c.json({ error: "tenantId must be a UUID" }, 400);
  }
  const removeVolumes =
    c.req.query("volumes") === "1" || c.req.query("volumes") === "true";
  const result = await deprovisionTenant(db, parsed.data, {
    removeVolumes,
    log: (m) => console.log(`[deprovision] ${m}`),
  });
  if (!result.ok) {
    return c.json({ error: result.message }, 404);
  }
  return c.json({
    deleted: true,
    slug: result.slug,
    composeProject: result.composeProject,
    docker: result.docker,
  });
});

const provisionBody = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase DNS-like"),
  name: z.string().min(1),
  owner_id: z.string().uuid(),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1),
  admin_last_name: z.string().min(1),
});

app.post("/tenants", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }

  let body: z.infer<typeof provisionBody>;
  try {
    body = provisionBody.parse(await c.req.json());
  } catch (e) {
    return c.json(
      { error: "invalid_body", detail: e instanceof z.ZodError ? e.flatten() : String(e) },
      400,
    );
  }

  const ownerOk = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.id, body.owner_id))
    .limit(1);
  if (ownerOk.length === 0) {
    return c.json({ error: "owner_id does not exist" }, 400);
  }

  const slugTaken = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, body.slug))
    .limit(1);
  if (slugTaken.length > 0) {
    return c.json(
      { error: `Tenant slug already exists: ${body.slug}` },
      409,
    );
  }

  const correlationId = randomUUID();
  const log = (m: string) => {
    console.log(JSON.stringify({ level: "info", correlationId, message: m }));
  };

  const acceptTrace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: body.slug }),
    log,
  );
  await acceptTrace.event(
    "api",
    "HTTP 202 — provisioning accepted; background worker will start",
  );

  setProvisionJob(correlationId, { status: "queued" });

  void (async () => {
    setProvisionJob(correlationId, { status: "running" });
    try {
      const result = await provisionTenant(
        db,
        {
          slug: body.slug,
          name: body.name,
          ownerId: body.owner_id,
          adminEmail: body.admin_email,
          adminFirstName: body.admin_first_name,
          adminLastName: body.admin_last_name,
        },
        log,
        correlationId,
      );

      if (!result.ok) {
        setProvisionJob(correlationId, {
          status: "failed",
          message: result.message,
          cause: result.cause,
          correlationId,
        });
        return;
      }

      setProvisionJob(correlationId, { status: "succeeded", result });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      setProvisionJob(correlationId, {
        status: "failed",
        message,
        cause: String(err),
        correlationId,
      });
    }
  })().catch((e) => {
    console.error(JSON.stringify({ level: "error", correlationId, message: String(e) }));
  });

  return c.json(
    {
      accepted: true,
      correlationId,
      admin_email: body.admin_email,
      poll: `/tenants/provision-status/${correlationId}`,
      stream: `/tenants/provision-stream/${correlationId}`,
      message:
        "Provisioning started in the background. First Docker run can take many minutes (image pulls, MySQL, migrations). Poll provision-status until status is complete or failed.",
      note:
        "Save oneTimeAdminPassword from the status response when complete — it is not stored in Stockix.",
    },
    202,
  );
});

app.get("/tenants/provision-status/:correlationId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const correlationId = c.req.param("correlationId");
  const job = getProvisionJob(correlationId);
  const events = await loadProvisionEventsJson(correlationId);

  if (!job) {
    if (events.length === 0) {
      return c.json(
        {
          error: "unknown_or_expired_job",
          message:
            "No job for this id (expired ~15m after completion, or the API process restarted).",
        },
        404,
      );
    }
    const last = events[events.length - 1]!;
    if (last.phase === "complete") {
      return c.json({
        status: "complete",
        correlationId,
        events,
        oneTimeAdminPassword: null,
        note:
          "In-memory job expired — one-time password was only in the earlier status response. Check BigCapital reset flows or reprovision. Trace is still available in `events`.",
      });
    }
    if (last.phase === "failed") {
      return c.json({
        status: "failed",
        correlationId,
        error: last.message,
        cause:
          last.meta && typeof last.meta === "object" && "cause" in last.meta
            ? String((last.meta as { cause?: unknown }).cause)
            : undefined,
        events,
      });
    }
    return c.json({
      status: "running",
      correlationId,
      message:
        "In-memory job missing (API restart?) — live updates may be stale; see `events` for the persisted trace.",
      events,
    });
  }

  if (job.status === "queued" || job.status === "running") {
    return c.json({ status: job.status, correlationId, events });
  }

  if (job.status === "succeeded") {
    const r = job.result;
    return c.json({
      status: "complete",
      correlationId,
      tenantId: r.tenantId,
      deploymentId: r.deploymentId,
      composeProjectName: r.composeProjectName,
      internalPort: r.internalPort,
      baseUrl: r.baseUrl,
      oneTimeAdminPassword: r.oneTimeAdminPassword,
      events,
      note:
        "BigCapital login API field is `crediential` (typo) if you call /api/auth/login.",
    });
  }

  return c.json({
    status: "failed",
    correlationId,
    error: job.message,
    cause: job.cause,
    events,
  });
});

app.get("/tenants/provision-stream/:correlationId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not configured" }, 503);
  }
  const correlationId = c.req.param("correlationId");
  const job = getProvisionJob(correlationId);
  const anyRow = await db
    .select({ id: tenantProvisionEvents.id })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .limit(1);

  if (!job && anyRow.length === 0) {
    return c.json(
      {
        error: "unknown_or_expired_job",
        message:
          "No in-memory job and no provision trace for this correlation id.",
      },
      404,
    );
  }

  return streamSSE(c, async (stream) => {
    const sent = new Set<string>();
    const forward = async (payload: ProvisionEventPayload) => {
      if (sent.has(payload.id)) return;
      sent.add(payload.id);
      await stream.writeSSE({
        event: "provision",
        data: JSON.stringify(payload),
      });
    };

    const unsub = subscribeProvision(correlationId, (p) => {
      void forward(p);
    });

    const rows = await db
      .select()
      .from(tenantProvisionEvents)
      .where(eq(tenantProvisionEvents.correlationId, correlationId))
      .orderBy(
        asc(tenantProvisionEvents.createdAt),
        asc(tenantProvisionEvents.id),
      );

    for (const row of rows) {
      await forward(rowToProvisionPayload(row));
    }

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        unsub();
        resolve();
      });
    });
  });
});

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
