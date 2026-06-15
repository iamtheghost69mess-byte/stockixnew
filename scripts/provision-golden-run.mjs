import { randomUUID } from "node:crypto";
import { createDb } from "@repo/db";
import { owners, tenantDeployments, tenantLifecycleJobs, tenantProvisionEvents, tenants } from "@repo/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { loadRootEnv } from "./load-root-env.mjs";

loadRootEnv(import.meta.url);

const apiUrl = (process.env.STOCKIX_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL;
const authTokenSecret = process.env.AUTH_TOKEN_SECRET ?? process.env.SESSION_SECRET;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!authTokenSecret) throw new Error("AUTH_TOKEN_SECRET (or SESSION_SECRET) is required");

const db = createDb(databaseUrl);

function toB64(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function signSessionToken(payload) {
  const body = JSON.stringify({ ...payload, iat: Date.now() });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authTokenSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${toB64(body)}.${Buffer.from(new Uint8Array(sig)).toString("base64url")}`;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function main() {
  const [owner] = await db
    .select({
      id: owners.id,
      email: owners.email,
      name: owners.name,
      role: owners.role,
      sessionVersion: owners.sessionVersion,
    })
    .from(owners)
    .where(eq(owners.status, "active"))
    .orderBy(asc(owners.createdAt))
    .limit(1);
  if (!owner) throw new Error("No active owner found");

  const sessionToken = await signSessionToken({
    sub: owner.id,
    role: owner.role ?? "super_admin",
    email: owner.email,
    name: owner.name ?? "Owner",
    sessionVersion: owner.sessionVersion ?? 1,
  });

  const slug = `golden-${Date.now().toString(36)}`;
  const createRes = await fetch(`${apiUrl}/tenants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      slug,
      name: `Golden ${slug}`,
      ownerId: owner.id,
      adminEmail: `admin+${slug}@localhost.test`,
      adminFirstName: "Golden",
      adminLastName: "Run",
    }),
  });
  const createJson = await readJson(createRes);
  if (createRes.status !== 202 || !createJson.correlationId) {
    throw new Error(`Provision request failed: ${createRes.status} ${JSON.stringify(createJson)}`);
  }

  const correlationId = createJson.correlationId;
  const deadline = Date.now() + 15 * 60 * 1000;
  let statusJson = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusRes = await fetch(`${apiUrl}/tenants/provision-status/${correlationId}`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    statusJson = await readJson(statusRes);
    if (statusJson?.status === "complete" || statusJson?.status === "failed") break;
  }

  if (!statusJson || statusJson.status !== "complete") {
    throw new Error(`Provision did not complete: ${JSON.stringify(statusJson)}`);
  }

  const phases = await db
    .select({
      phase: tenantProvisionEvents.phase,
      event: tenantProvisionEvents.message,
    })
    .from(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.correlationId, correlationId))
    .orderBy(asc(tenantProvisionEvents.createdAt));
  const [job] = await db
    .select({
      status: tenantLifecycleJobs.status,
      lastError: tenantLifecycleJobs.lastError,
    })
    .from(tenantLifecycleJobs)
    .where(eq(tenantLifecycleJobs.correlationId, correlationId))
    .orderBy(desc(tenantLifecycleJobs.createdAt))
    .limit(1);
  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  const [deployment] = tenant
    ? await db
        .select({
          status: tenantDeployments.status,
          internalPort: tenantDeployments.internalPort,
        })
        .from(tenantDeployments)
        .where(eq(tenantDeployments.tenantId, tenant.id))
        .limit(1)
    : [];

  const phaseKeys = new Set(phases.map((p) => p.phase));
  const result = {
    slug,
    correlationId,
    provisionStatus: statusJson.status,
    oneTimePasswordPresent: Boolean(statusJson.oneTimeAdminPassword),
    jobStatus: job?.status ?? null,
    jobLastError: job?.lastError ?? null,
    tenantStatus: tenant?.status ?? null,
    deploymentStatus: deployment?.status ?? null,
    internalPort: deployment?.internalPort ?? null,
    gates: {
      preflightCleanup: phaseKeys.has("preflight.cleanup"),
      dockerDataStep: phases.some((p) => p.phase === "journal" && String(p.event).includes("Data services")),
      dockerMigrationStep: phases.some((p) => p.phase === "journal" && String(p.event).includes("Migration")),
      dockerAppStep: phases.some((p) => p.phase === "journal" && String(p.event).includes("Application")),
      bootstrap: phases.some((p) => p.phase === "journal" && String(p.event).includes("bootstrap admin")),
      edgePublish: phases.some((p) => p.phase === "journal" && String(p.event).includes("Traefik edge publish")),
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

await main();
