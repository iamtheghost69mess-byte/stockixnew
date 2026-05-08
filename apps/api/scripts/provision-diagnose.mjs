/**
 * Provision diagnostic runner.
 *
 * Goal: pinpoint where provisioning hangs (queue, worker claim, docker bring-up,
 * health check, bootstrap admin, completion).
 *
 * Usage:
 *   pnpm --filter api provision-diagnose
 *   pnpm --filter api provision-diagnose -- --slug my-slug --admin-email me@example.com
 *   pnpm --filter api provision-diagnose -- --correlation-id <id>
 *
 * Optional args:
 *   --slug <value>             default diag-<timestamp>
 *   --name <value>             default "Provision diagnose <slug>"
 *   --owner-id <uuid>          default first owner from GET /owners
 *   --admin-email <email>      default from PROVISION_ADMIN_EMAIL env
 *   --admin-first <value>      default "Diag"
 *   --admin-last <value>       default "Runner"
 *   --correlation-id <id>      monitor an existing job only (no create)
 *   --poll-ms <n>              default PROVISION_POLL_MS or 2000
 *   --max-ms <n>               default PROVISION_MAX_MS or 2700000 (45m)
 *   --stale-ms <n>             default 120000 (2m no progress => hang suspect)
 */

import { execa } from "execa";
import { env } from "@repo/config";

const API = env.STOCKIX_API_URL.replace(/\/$/, "");
const argv = process.argv.slice(2);

function argValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const POLL_MS = toInt(argValue("--poll-ms"), Number(env.PROVISION_POLL_MS || 2000));
const MAX_MS = toInt(argValue("--max-ms"), Number(env.PROVISION_MAX_MS || 45 * 60 * 1000));
const STALE_MS = toInt(argValue("--stale-ms"), 120_000);
const AUTH_BEARER = argValue("--auth-bearer") ?? process.env.PROVISION_AUTH_BEARER ?? "";
const AUTH_COOKIE = argValue("--cookie") ?? process.env.PROVISION_COOKIE ?? "";

function requestHeaders(extra = {}) {
  return {
    ...(AUTH_BEARER ? { Authorization: `Bearer ${AUTH_BEARER}` } : {}),
    ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
    ...extra,
  };
}

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readJson(res) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return { _raw: t };
  }
}

function nowIso() {
  return new Date().toISOString();
}

function out(...args) {
  console.log(`[${nowIso()}]`, ...args);
}

function fail(msg, extra) {
  console.error(`\n❌ ${msg}`);
  if (extra != null) {
    console.error(
      typeof extra === "string" ? extra : JSON.stringify(extra, null, 2),
    );
  }
  process.exit(1);
}

async function getOwners() {
  const res = await fetch(`${API}/owners`, {
    headers: requestHeaders(),
  });
  const body = await readJson(res);
  if (!res.ok) {
    fail(
      `GET /owners -> ${res.status} (pass --owner-id or set OWNER_ID for protected environments)`,
      body,
    );
  }
  return Array.isArray(body.owners) ? body.owners : [];
}

async function createProvisionJob(input) {
  const res = await fetch(`${API}/tenants`, {
    method: "POST",
    headers: requestHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": requestId(),
      "x-request-id": requestId(),
      "x-correlation-id": requestId(),
    }),
    body: JSON.stringify(input),
  });
  const body = await readJson(res);
  if (res.status !== 202 || !body.accepted || !body.correlationId) {
    fail("POST /tenants expected HTTP 202 accepted", { status: res.status, body });
  }
  return body;
}

async function getProvisionStatus(correlationId) {
  const res = await fetch(`${API}/tenants/provision-status/${correlationId}`, {
    headers: requestHeaders(),
  });
  const body = await readJson(res);
  return { res, body };
}

async function dockerProjectSnapshot(project) {
  try {
    const { stdout } = await execa("docker", [
      "ps",
      "-a",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--format",
      "{{.Names}}|{{.Status}}|{{.Image}}",
    ]);
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((row) => {
        const [name = "", status = "", image = ""] = row.split("|");
        return { name, status, image };
      });
  } catch (error) {
    return [
      {
        name: "(docker command failed)",
        status: error instanceof Error ? error.message : String(error),
        image: "",
      },
    ];
  }
}

async function dockerServerHostPort(project) {
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      project,
      "port",
      "server",
      "3000",
    ]);
    const trimmed = stdout.trim();
    const match = trimmed.match(/:(\d+)\s*$/);
    if (!match?.[1]) return null;
    return Number(match[1]);
  } catch {
    return null;
  }
}

async function verifyProvisionedEndpoint(project) {
  const hostPort = await dockerServerHostPort(project);
  if (!hostPort) {
    fail("Provision completed but server host port is not resolvable", { composeProject: project });
  }
  const pingUrl = `http://127.0.0.1:${hostPort}/api/ping/`;
  out(`Verifying tenant endpoint: ${pingUrl}`);
  let lastError = "unknown";
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(pingUrl, { signal: AbortSignal.timeout(5_000) });
      const text = await res.text();
      if (res.ok) {
        out(`Endpoint reachable (HTTP ${res.status})`);
        return { pingUrl, status: res.status, bodyPreview: text.slice(0, 300) };
      }
      lastError = `HTTP ${res.status} ${text.slice(0, 200)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  fail("Provision completed but endpoint is not reachable", {
    composeProject: project,
    pingUrl,
    lastError,
  });
}

function eventKey(e) {
  return `${e.id ?? ""}:${e.createdAt ?? ""}:${e.phase ?? ""}:${e.message ?? ""}`;
}

async function main() {
  out("Provision diagnose starting");
  out(`API=${API}`);
  out(`POLL_MS=${POLL_MS} MAX_MS=${MAX_MS} STALE_MS=${STALE_MS}`);

  const correlationArg = argValue("--correlation-id");
  let slug = argValue("--slug");
  let correlationId = correlationArg;

  if (!correlationId) {
    let ownerId = argValue("--owner-id") ?? env.OWNER_ID;
    if (!ownerId) {
      const owners = await getOwners();
      if (owners.length === 0) {
        fail("No owners found. Seed DB first: pnpm --filter @repo/db db:seed:local");
      }
      ownerId = owners[0].id;
    }
    slug = slug ?? `diag-${Date.now().toString(36)}`;
    const name = argValue("--name") ?? `Provision diagnose ${slug}`;
    const adminEmail = argValue("--admin-email") ?? env.PROVISION_ADMIN_EMAIL;
    if (!adminEmail) {
      fail("Missing admin email. Set PROVISION_ADMIN_EMAIL or pass --admin-email");
    }
    const body = {
      slug,
      name,
      owner_id: ownerId,
      admin_email: adminEmail,
      admin_first_name: argValue("--admin-first") ?? "Diag",
      admin_last_name: argValue("--admin-last") ?? "Runner",
    };
    out("Creating provision job", body);
    const accepted = await createProvisionJob(body);
    correlationId = accepted.correlationId;
    out(`Accepted correlationId=${correlationId}`);
  } else {
    out(`Monitoring existing correlationId=${correlationId}`);
  }

  const seen = new Set();
  const start = Date.now();
  let lastProgressAt = Date.now();
  let lastStatus = "unknown";
  let composeProject = slug ? `stockix-${slug}` : null;
  let lastEventSummary = "none";

  while (Date.now() - start < MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const { res, body } = await getProvisionStatus(correlationId);

    if (res.status === 404) {
      fail("Status endpoint returned 404 (unknown/expired correlation)", body);
    }
    if (!res.ok) {
      fail(`Status endpoint HTTP ${res.status}`, body);
    }

    const status = typeof body.status === "string" ? body.status : "unknown";
    const events = Array.isArray(body.events) ? body.events : [];
    const fresh = [];
    for (const e of events) {
      const key = eventKey(e);
      if (!seen.has(key)) {
        seen.add(key);
        fresh.push(e);
      }
    }

    if (status !== lastStatus) {
      out(`status: ${lastStatus} -> ${status}`);
      lastStatus = status;
      lastProgressAt = Date.now();
    }

    if (fresh.length > 0) {
      lastProgressAt = Date.now();
      for (const e of fresh) {
        if (e?.meta && typeof e.meta === "object" && typeof e.meta.composeProjectName === "string") {
          composeProject = e.meta.composeProjectName;
        }
        const row = `${e.createdAt ?? "?"} [${e.phase ?? "?"}] [${e.level ?? "?"}] ${e.message ?? ""}`;
        lastEventSummary = row;
        out(row);
      }
    }

    if (status === "complete") {
      out("Provision completed.");
      if (body.oneTimeAdminPassword) {
        out("One-time admin password is present in final status payload.");
      } else {
        out("One-time admin password missing/null in final payload.");
      }
      if (composeProject) {
        const endpoint = await verifyProvisionedEndpoint(composeProject);
        out("Endpoint verification passed", endpoint);
      } else {
        fail("Provision completed but compose project is unknown for endpoint verification");
      }
      return;
    }

    if (status === "failed") {
      fail("Provision failed", {
        correlationId,
        error: body.error,
        cause: body.cause,
        lastEvent: lastEventSummary,
        totalEvents: events.length,
      });
    }

    const idleMs = Date.now() - lastProgressAt;
    if (idleMs >= STALE_MS && (status === "running" || status === "queued")) {
      const docker = composeProject ? await dockerProjectSnapshot(composeProject) : [];
      fail("Provision appears hung (stale progress threshold reached)", {
        correlationId,
        status,
        idleMs,
        composeProject,
        lastEvent: lastEventSummary,
        dockerContainers: docker,
        hint: "If dockerContainers is empty, hang is likely before/inside compose startup. If containers exist, hang is likely health/migration/bootstrap.",
      });
    }

    process.stdout.write(
      `... status=${status} events=${events.length} idle=${Math.floor(idleMs / 1000)}s            \r`,
    );
  }

  fail(`Timeout after ${MAX_MS}ms`, {
    correlationId,
    lastStatus,
    lastEvent: lastEventSummary,
  });
}

main().catch((e) => {
  fail("Unhandled script error", e instanceof Error ? e.message : String(e));
});

