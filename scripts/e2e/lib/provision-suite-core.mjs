/**
 * Core API client, journal/SSE assertions, and provision polling for E2E suite.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
import { env, moduleGatingConfig } from "@repo/config";
import { execa } from "execa";

export const API = env.STOCKIX_API_URL.replace(/\/$/, "");
export const POLL_MS = env.PROVISION_POLL_MS;
export const MAX_MS = env.PROVISION_MAX_MS;

export const FINANCE_JOURNAL_OPS = [
  "docker.data_step",
  "docker.migration_step",
  "docker.app_step",
  "docker.network_connect",
  "tenant.health_check",
  "edge.publish",
  "tenant.bootstrap_admin",
  "tenant.build_organization",
  "tenant.activate_warehouses",
];

export const POS_JOURNAL_OPS = ["pos.bootstrap_organization", "pos.schema_migration"];
export const COMBINED_EXTRA_OPS = ["tenant.seed_pos_defaults", "tenant.wire_pos_integration"];

export class SuiteError extends Error {
  constructor(message, ctx = {}) {
    super(message);
    this.name = "SuiteError";
    this.ctx = ctx;
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function slugToMysqlSafe(slug) {
  return slug.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 28);
}

export function tenantMysqlNames(slug) {
  const safe = slugToMysqlSafe(slug);
  const prefix = `stockix_${safe}_`;
  return {
    systemDb: `${prefix}system`,
    orgDbPattern: `${prefix}%`,
    dbPrefix: prefix,
    tenantUser: `tenant_${safe}`,
  };
}

/** Escape `_` / `%` for MySQL LIKE (slug underscores are not wildcards). */
export function mysqlLikePatternEscape(value) {
  return value.replace(/\\/g, "\\\\").replace(/_/g, "\\_").replace(/%/g, "\\%");
}

export function bootstrapAdminPassword(slug) {
  const raw = process.env.DEPLOYMENT_SECRET_KEY?.trim();
  if (!raw || raw.length < 32) throw new SuiteError("DEPLOYMENT_SECRET_KEY missing or too short in .env");
  const hmacKey = createHash("sha256").update(raw).digest();
  return createHmac("sha256", hmacKey).update(`bootstrap:${slug}`, "utf8").digest("base64url");
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new SuiteError(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, {
      label,
      expected,
      actual,
    });
  }
}

export function assertTruthy(value, label) {
  if (!value) throw new SuiteError(`${label}: expected truthy, got ${JSON.stringify(value)}`, { label, value });
}

export function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new SuiteError(`${label}: expected to include ${JSON.stringify(needle)}`, {
      label,
      needle,
      haystack: typeof haystack === "string" ? haystack.slice(0, 500) : haystack,
    });
  }
}

export async function readJson(res) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return { _raw: t };
  }
}

export function createApiClient(authHeadersRef) {
  async function api(method, path, body, extraHeaders = {}) {
    const headers = { Accept: "application/json", ...authHeadersRef.current, ...extraHeaders };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const routePath = path.split("?")[0];
    if (["POST", "PATCH", "DELETE"].includes(method.toUpperCase()) && /^\/(tenants|owners)/.test(routePath)) {
      headers["Idempotency-Key"] = randomUUID();
    }
    const url = path.startsWith("http") ? path : `${API}${path.startsWith("/") ? "" : "/"}${path}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    return { ok: res.ok, status: res.status, data: await readJson(res), headers: res.headers };
  }
  return { api };
}

export async function resolveAuth(authHeadersRef) {
  const platformSecret = env.PLATFORM_API_SECRET ?? "";
  if (platformSecret) {
    authHeadersRef.current = { Authorization: `Bearer ${platformSecret}` };
    return "platform_api_secret";
  }
  const email = process.env.PLATFORM_ADMIN_EMAIL ?? "";
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  if (!email || !password) throw new SuiteError("Set PLATFORM_API_SECRET or PLATFORM_ADMIN_EMAIL/PASSWORD");
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer local-dev" },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new SuiteError(`POST /auth/login → HTTP ${res.status}`, body);
  const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
  const session = setCookies.map(String).find((line) => line.startsWith("stockix-session="));
  if (!session) throw new SuiteError("Login OK but stockix-session cookie missing");
  authHeadersRef.current = { Cookie: session.split(";")[0], Authorization: "Bearer local-dev" };
  return "login";
}

export async function loginAsOwner(email, password, authHeadersRef) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer local-dev" },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new SuiteError(`Login failed for ${email}: HTTP ${res.status}`, body);
  const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
  const session = setCookies.map(String).find((line) => line.startsWith("stockix-session="));
  if (!session) throw new SuiteError(`Login OK for ${email} but no session cookie`);
  authHeadersRef.current = { Cookie: session.split(";")[0], Authorization: "Bearer local-dev" };
}

export async function resolveOwnerId(api) {
  if (env.OWNER_ID) return env.OWNER_ID;
  const res = await api("GET", "/owners");
  if (!res.ok) throw new SuiteError(`GET /owners → HTTP ${res.status}`, res.data);
  const owners = res.data?.owners ?? [];
  if (!owners.length) throw new SuiteError("No owners — run pnpm db:seed:local");
  return owners[0].id;
}

export function journalOpsFromEvents(events) {
  const ops = [];
  for (const e of events ?? []) {
    if (e?.phase !== "journal") continue;
    const key = e?.meta?.operationKey;
    if (key && !ops.includes(key)) ops.push(key);
  }
  return ops;
}

export function assertJournalOpsInOrder(events, requiredOps, { allowOptional = [] } = {}) {
  const completed = journalOpsFromEvents(events);
  let idx = 0;
  for (const op of requiredOps) {
    const pos = completed.indexOf(op, idx);
    if (pos < 0) {
      throw new SuiteError(
        `Missing journal operationKey "${op}" (expected: ${requiredOps.join(" → ")}; actual: ${completed.join(" → ")})`,
        { requiredOps, completed, events: events?.slice(-20) },
      );
    }
    idx = pos + 1;
  }
  for (const op of completed) {
    if (!requiredOps.includes(op) && !allowOptional.includes(op)) {
      throw new SuiteError(`Unexpected journal operationKey "${op}" in success path`, { completed });
    }
  }
  const journalErrors = (events ?? []).filter(
    (e) => e.level === "error" && (e.phase === "journal" || e.meta?.operationKey),
  );
  if (journalErrors.length) throw new SuiteError("Journal error events on success path", { journalErrors });
}

export function assertNoRollbackEvents(events) {
  const rollback = (events ?? []).filter(
    (e) => e.phase === "rollback" || String(e.message ?? "").toLowerCase().includes("rollback"),
  );
  if (rollback.length) throw new SuiteError("Rollback events present on success path", { rollback });
}

function parseSseChunk(buffer) {
  const out = { event: "message", data: "" };
  for (const line of buffer.split("\n")) {
    if (line.startsWith("event:")) out.event = line.slice(6).trim();
    else if (line.startsWith("data:")) out.data += line.slice(5).trim();
  }
  return out;
}

export async function collectProvisionStream(correlationId, authHeadersRef, maxMs = MAX_MS) {
  const provisionEvents = [];
  let doneEvent = null;
  const controller = new AbortController();
  const headers = { Accept: "text/event-stream", ...authHeadersRef.current };
  const url = `${API}/tenants/provision-stream/${correlationId}`;

  const streamTask = (async () => {
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const parsed = parseSseChunk(part);
          if (parsed.event === "provision" && parsed.data) {
            try {
              provisionEvents.push(JSON.parse(parsed.data));
            } catch {
              provisionEvents.push({ _raw: parsed.data });
            }
          } else if (parsed.event === "done" && parsed.data) {
            try {
              doneEvent = JSON.parse(parsed.data);
            } catch {
              doneEvent = { _raw: parsed.data };
            }
          }
        }
        if (doneEvent) break;
      }
    } catch (err) {
      if (!controller.signal.aborted) throw err;
    }
  })();

  const deadline = Date.now() + maxMs;
  let finalStatus = null;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const res = await fetch(`${API}/tenants/provision-status/${correlationId}`, { headers: authHeadersRef.current });
    const body = await readJson(res);
    if (res.status === 404) break;
    finalStatus = body.status;
    if (finalStatus === "complete" || finalStatus === "failed") {
      await sleep(1500);
      break;
    }
  }
  controller.abort();
  await streamTask.catch(() => undefined);
  return { provisionEvents, doneEvent, finalStatus };
}

export async function pollProvision(api, correlationId, maxMs = MAX_MS) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const res = await api("GET", `/tenants/provision-status/${correlationId}`);
    if (res.status === 404) throw new SuiteError("provision-status 404", res.data);
    if (!res.ok) throw new SuiteError(`provision-status HTTP ${res.status}`, res.data);
    if (res.data.status === "failed") return { ok: false, body: res.data };
    if (res.data.status === "complete") return { ok: true, body: res.data };
  }
  throw new SuiteError(`Provision timeout after ${maxMs}ms`, { correlationId });
}

export async function createProvision(api, { slug, name, ownerId, modules, adminEmail }) {
  const res = await api("POST", "/tenants", {
    slug,
    name,
    owner_id: ownerId,
    admin_email: adminEmail ?? env.PROVISION_ADMIN_EMAIL,
    admin_first_name: "E2E",
    admin_last_name: "Provision",
    plan_slug: "starter",
    modules,
  });
  if (res.status !== 202 || !res.data?.correlationId) {
    throw new SuiteError(`POST /tenants expected 202`, { status: res.status, body: res.data });
  }
  return res.data;
}

export async function getTenant(api, tenantId) {
  const res = await api("GET", `/tenants/${tenantId}`);
  if (!res.ok) throw new SuiteError(`GET /tenants/${tenantId} → ${res.status}`, res.data);
  return res.data.tenant;
}

export function logProvisionTraceOnFailure(events) {
  console.error("\n--- provision event trace (last 40) ---");
  for (const e of (events ?? []).slice(-40)) console.error(JSON.stringify(e));
  console.error("--- end trace ---\n");
}

export function moduleGatingEnabled() {
  return moduleGatingConfig.enabled;
}

export async function preflight(authHeadersRef, infraChecks) {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new SuiteError(`API unhealthy at ${API}`);
  await resolveAuth(authHeadersRef);
  await execa("docker", ["info"], { stdio: "pipe" });
  if (infraChecks?.assertHostInfraReachable) {
    await infraChecks.assertHostInfraReachable();
  }
  if (!process.env.SHARED_MYSQL_ROOT_PASSWORD) {
    throw new SuiteError("SHARED_MYSQL_ROOT_PASSWORD required for E2E infra checks");
  }
  if (!moduleGatingEnabled()) {
    console.warn("[e2e] PROVISION_MODULE_GATING=0 — POS-only scenario will still provision Finance");
  }
}
