import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { allocateTenantPort, TenantPortExhaustedError } from "@repo/db";
import {
  tenantDeployments,
  tenantProvisionEvents,
  tenants,
} from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { stat } from "node:fs/promises";
import { execa } from "execa";

import { defaultTenantEnvRoot } from "./env-paths.js";
import { getRepoRoot } from "./repo-root.js";
import {
  createProvisionTracer,
  type ProvisionTracer,
} from "./provision-trace.js";
import { getProvisionConfig } from "./provision-config.js";
import type { ProvisionRuntimeConfig } from "./provision-config.js";

/** Plaintext today; replace with envelope/KMS encryption before production traffic. */
function persistSecret(plaintext: string): string {
  return plaintext;
}

function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

function bootstrapPassword(): string {
  const s = randomBytes(18).toString("base64url");
  return s.length >= 12 ? s.slice(0, 24) : `${s}Aa1!extra`;
}

export type ProvisionInput = {
  slug: string;
  name: string;
  ownerId: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
};

export type ProvisionResult =
  | {
      ok: true;
      tenantId: string;
      deploymentId: string;
      composeProjectName: string;
      internalPort: number;
      baseUrl: string;
      /** Shown once — BigCapital admin login (not stored in Stockix Postgres). */
      oneTimeAdminPassword: string;
    }
  | { ok: false; message: string; cause?: string };

function composeProjectName(slug: string): string {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

async function writeTenantEnvFile(
  dir: string,
  contents: string,
): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = join(dir, ".env");
  const tmp = join(dir, ".env.tmp");
  await writeFile(tmp, contents, { mode: 0o600 });
  await rename(tmp, target);
  return target;
}

function buildEnvFile(params: {
  bigcapitalRoot: string;
  baseUrl: string;
  jwtSecret: string;
  dbPassword: string;
  dbRootPassword: string;
  publicProxyPort: number;
  signupAllowedEmails: string;
  agendashUser: string;
  agendashPassword: string;
}): string {
  const lines: string[] = [
    `BIGCAPITAL_ROOT=${params.bigcapitalRoot}`,
    `BASE_URL=${params.baseUrl}`,
    `DB_HOST=mysql`,
    `DB_USER=bigcapital`,
    `DB_PASSWORD=${params.dbPassword}`,
    `DB_ROOT_PASSWORD=${params.dbRootPassword}`,
    `DB_CHARSET=utf8`,
    `SYSTEM_DB_NAME=bigcapital_system`,
    `TENANT_DB_NAME_PERFIX=bigcapital_tenant_`,
    `JWT_SECRET=${params.jwtSecret}`,
    `MONGODB_DATABASE_URL=mongodb://mongo/bigcapital`,
    `PUBLIC_PROXY_PORT=${params.publicProxyPort}`,
    `PUBLIC_PROXY_SSL_PORT=443`,
    `SIGNUP_DISABLED=true`,
    `SIGNUP_ALLOWED_DOMAINS=`,
    `SIGNUP_ALLOWED_EMAILS=${params.signupAllowedEmails}`,
    `MAIL_HOST=`,
    `MAIL_USERNAME=`,
    `MAIL_PASSWORD=`,
    `MAIL_PORT=`,
    `MAIL_SECURE=`,
    `MAIL_FROM_NAME=`,
    `MAIL_FROM_ADDRESS=`,
    `AGENDASH_AUTH_USER=${params.agendashUser}`,
    `AGENDASH_AUTH_PASSWORD=${params.agendashPassword}`,
  ];
  return `${lines.join("\n")}\n`;
}

function formatExecaFailure(
  e: unknown,
  context: string,
): string {
  if (e && typeof e === "object") {
    const x = e as Record<string, unknown>;
    const exit = x.exitCode;
    const lines: string[] = [context];
    if (exit != null) lines.push(`exit code: ${String(exit)}`);
    if (typeof x.shortMessage === "string" && x.shortMessage)
      lines.push(x.shortMessage);
    else if (typeof x.message === "string" && x.message) lines.push(x.message);
    if (typeof x.stderr === "string" && x.stderr.trim())
      lines.push(`--- stderr ---\n${x.stderr.trim()}`);
    if (typeof x.stdout === "string" && x.stdout.trim())
      lines.push(`--- stdout ---\n${x.stdout.trim()}`);
    if (lines.length > 1) return lines.join("\n\n").slice(0, 12_000);
  }
  return `${context}\n\n${String(e)}`.slice(0, 12_000);
}

/**
 * Node/undici reports network failures as `TypeError: fetch failed` with the
 * real reason in `error.cause` (e.g. ECONNREFUSED). Surface the full chain for traces.
 */
function unwrapFetchError(e: unknown): { chain: string; errnoCode?: string } {
  const segments: string[] = [];
  let errnoCode: string | undefined;
  let cur: unknown = e;
  for (let depth = 0; cur != null && depth < 10; depth++) {
    if (cur instanceof Error) {
      const ne = cur as NodeJS.ErrnoException;
      if (typeof ne.code === "string") errnoCode = ne.code;
      const piece =
        ne.code != null && !ne.message.includes(String(ne.code))
          ? `${ne.message} [${ne.code}]`
          : ne.message;
      if (piece) segments.push(piece);
      cur = ne.cause;
    } else {
      segments.push(String(cur));
      break;
    }
  }
  const chain = segments.filter(Boolean).join(" → ") || String(e);
  return { chain, errnoCode };
}

function hintForPingFailure(
  errnoCode: string | undefined,
  pingUrl: string,
  lastDetail: string,
): string {
  let port: string | undefined;
  try {
    port = new URL(pingUrl).port || undefined;
  } catch {
    /* ignore */
  }
  const lower = lastDetail.toLowerCase();

  /* Undici: peer closed socket before a full HTTP response — common while nginx/app starts or reloads. */
  if (
    errnoCode === "UND_ERR_SOCKET" ||
    lower.includes("other side closed") ||
    lower.includes("und_err_socket")
  ) {
    return `Transient during startup: the host accepted TCP then closed before HTTP finished (${errnoCode ?? "socket"}). Normal while nginx/server bind or reload. If this never turns into ECONNREFUSED→healthy within a few minutes, check docker compose logs (nginx, server).`;
  }

  if (
    errnoCode === "ECONNRESET" ||
    lower.includes("econnreset") ||
    lower.includes("connection reset")
  ) {
    return `Connection reset — common briefly while containers settle. Same as above if it persists indefinitely.`;
  }

  if (errnoCode === "ECONNREFUSED") {
    return port
      ? `ECONNREFUSED: nothing is listening on host port ${port} yet (nginx/containers still starting) or the publish mapping failed. Verify with: docker compose ps for this project; curl -v ${pingUrl}`
      : `ECONNREFUSED: target not accepting connections yet. Verify containers are up and ports published: docker compose ps; curl -v ${pingUrl}`;
  }
  if (errnoCode === "ETIMEDOUT" || errnoCode === "UND_ERR_CONNECT_TIMEOUT") {
    return `Connection timed out reaching ${pingUrl} — firewall, Docker networking, or service overloaded.`;
  }
  if (errnoCode === "ENOTFOUND" || errnoCode === "EAI_AGAIN") {
    return `DNS/hostname resolution failed for ${pingUrl}.`;
  }
  return `Ping failed — full chain is in the trace; check Docker logs for nginx/server and host port mapping.`;
}

async function dockerCompose(
  composeFile: string,
  project: string,
  envFile: string,
  composeEnv: Record<string, string>,
  composeArgs: string[],
  timeoutMs: number,
): Promise<void> {
  const env = { ...process.env, ...composeEnv };
  const label = `docker compose -p ${project} ${composeArgs.join(" ")}`;
  try {
    await execa(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "-p",
        project,
        "--env-file",
        envFile,
        ...composeArgs,
      ],
      { env, stdio: "pipe", timeout: timeoutMs },
    );
  } catch (e) {
    throw new Error(formatExecaFailure(e, label));
  }
}

async function timedPhase(
  trace: ProvisionTracer,
  phaseKey: string,
  humanLabel: string,
  fn: () => Promise<void>,
): Promise<void> {
  const t0 = Date.now();
  await fn();
  const durationMs = Date.now() - t0;
  await trace.event(
    "timing",
    `${humanLabel} completed in ${durationMs}ms`,
    { meta: { phase: phaseKey, durationMs } },
  );
}

function healthPollIntervalMs(
  attempt: number,
  cfg: ProvisionRuntimeConfig,
): number {
  return attempt <= cfg.healthFastPollAttempts
    ? cfg.healthPollMinMs
    : cfg.healthPollMaxMs;
}

async function waitForBigCapitalReady(
  internalBaseUrl: string,
  cfg: ProvisionRuntimeConfig,
  log: (m: string) => void,
  trace?: ProvisionTracer,
): Promise<void> {
  const timeoutMs = cfg.healthTimeoutMs;
  const url = `${internalBaseUrl}/api/ping/`;
  const deadline = Date.now() + timeoutMs;
  const waitStarted = Date.now();
  let attempt = 0;
  let lastDetail = "";
  let lastErrno: string | undefined;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(cfg.healthFetchTimeoutMs),
      });
      if (res.ok) {
        log(`bigcapital healthy at ${url} (attempt ${attempt})`);
        await trace?.event("health", "BigCapital /api/ping is healthy", {
          meta: {
            attempt,
            url,
            waitDurationMs: Date.now() - waitStarted,
            pollMinMs: cfg.healthPollMinMs,
            pollMaxMs: cfg.healthPollMaxMs,
            fastAttempts: cfg.healthFastPollAttempts,
          },
        });
        return;
      }
      lastDetail = `HTTP ${res.status}`;
      lastErrno = undefined;
      log(`ping not ok: ${res.status} (attempt ${attempt})`);
    } catch (e) {
      const { chain, errnoCode } = unwrapFetchError(e);
      lastDetail = chain;
      lastErrno = errnoCode;
      log(`ping error attempt ${attempt}: ${chain}`);
    }
    if (attempt === 1 || attempt % 10 === 0) {
      const remainingMs = Math.max(0, deadline - Date.now());
      const hint = hintForPingFailure(lastErrno, url, lastDetail);
      await trace?.event(
        "health",
        `Still waiting for /api/ping (attempt ${attempt}, ~${Math.round(remainingMs / 1000)}s left) — last: ${lastDetail.slice(0, 280)}`,
        {
          meta: {
            attempt,
            url,
            errnoCode: lastErrno,
            lastDetail: lastDetail.slice(0, 2000),
            hint,
            nextPollInMs: healthPollIntervalMs(attempt + 1, cfg),
          },
        },
      );
    }
    const sleepMs = healthPollIntervalMs(attempt, cfg);
    await new Promise((r) => setTimeout(r, sleepMs));
  }
  throw new Error(
    `BigCapital did not become ready within ${timeoutMs}ms (last: ${lastDetail || "no detail"})${lastErrno ? ` [${lastErrno}]` : ""}`,
  );
}

async function registerAdmin(params: {
  internalBaseUrl: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  log: (m: string) => void;
  trace?: ProvisionTracer;
  fetchTimeoutMs: number;
}): Promise<void> {
  const url = `${params.internalBaseUrl}/api/auth/register`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      first_name: params.firstName,
      last_name: params.lastName,
      email: params.email,
      password: params.password,
    }),
    signal: AbortSignal.timeout(params.fetchTimeoutMs),
  });
  const text = await res.text();
  if (res.ok) {
    params.log("BigCapital POST /api/auth/register succeeded");
    await params.trace?.event(
      "auth",
      "BigCapital admin registration succeeded",
      { meta: { email: params.email } },
    );
    return;
  }
  const lower = text.toLowerCase();
  if (
    res.status === 400 ||
    res.status === 422 ||
    res.status === 409 ||
    lower.includes("already") ||
    lower.includes("exists") ||
    lower.includes("registered")
  ) {
    params.log(
      "BigCapital register rejected as duplicate — treating bootstrap as idempotent",
    );
    await params.trace?.event(
      "auth",
      "Register skipped (admin already exists — idempotent)",
      { level: "warn", meta: { httpStatus: res.status } },
    );
    return;
  }
  throw new Error(
    `register failed: HTTP ${res.status} ${text.slice(0, 500)}`,
  );
}

/**
 * BigCapital `POST /api/auth/login` validates **`crediential`** (typo), not `credential`.
 * Any login client must send `{ crediential: email, password }` or auth fails.
 */

export async function provisionTenant(
  db: PostgresJsDatabase<typeof dbSchema>,
  input: ProvisionInput,
  log: (m: string) => void,
  correlationId: string,
): Promise<ProvisionResult> {
  let tenantId: string | undefined;
  let deploymentId: string | undefined;
  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({
      slug: input.slug,
      tenantId,
      deploymentId,
    }),
    log,
  );

  const repoRoot = getRepoRoot();
  const composeFile = join(repoRoot, "infra/tenant-stack/docker-compose.yml");
  const bigcapitalRoot =
    process.env.BIGCAPITAL_ROOT?.trim() || join(repoRoot, "services/bigcapital");
  const rootDomain =
    process.env.ROOT_DOMAIN?.trim() || "example.com";
  const publicScheme =
    process.env.PUBLIC_BASE_URL_SCHEME?.trim().toLowerCase() === "http"
      ? "http"
      : "https";
  const maxPort = Number(process.env.MAX_TENANT_PORT ?? "4999");
  if (!Number.isFinite(maxPort)) {
    await trace.event("validate", "MAX_TENANT_PORT must be a number", {
      level: "error",
    });
    return { ok: false, message: "MAX_TENANT_PORT must be a number" };
  }

  const tenantEnvRoot = defaultTenantEnvRoot();
  const project = composeProjectName(input.slug);
  const baseUrl = `${publicScheme}://${input.slug}.${rootDomain}`;

  let port: number | undefined;
  let oneTimeAdminPassword: string | undefined;

  try {
    const cfg = getProvisionConfig();
    const provisionStartedAt = Date.now();

    await trace.event("run", "Provisioner started", {
      meta: {
        project,
        baseUrl,
        bigcapitalRoot,
        tuning: {
          healthTimeoutMs: cfg.healthTimeoutMs,
          healthPollMinMs: cfg.healthPollMinMs,
          healthPollMaxMs: cfg.healthPollMaxMs,
          healthFastPollAttempts: cfg.healthFastPollAttempts,
          dockerComposeTimeoutMs: cfg.dockerComposeTimeoutMs,
          migrationMaxAttempts: cfg.migrationMaxAttempts,
          registerFetchTimeoutMs: cfg.registerFetchTimeoutMs,
        },
      },
    });

    const existing = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1);
    if (existing.length > 0) {
      await trace.event("validate", `Tenant slug already exists: ${input.slug}`, {
        level: "error",
      });
      return {
        ok: false,
        message: `Tenant slug already exists: ${input.slug}`,
      };
    }

    await timedPhase(
      trace,
      "prepare_dirs",
      "Prepare BigCapital host directories",
      async () => {
        await mkdir(join(bigcapitalRoot, "data/logs/nginx"), {
          recursive: true,
        });
        await mkdir(join(bigcapitalRoot, "docker/certbot/certs"), {
          recursive: true,
        });
      },
    );

    oneTimeAdminPassword = bootstrapPassword();
    const jwtSecret = persistSecret(randomSecret(32));
    const dbPassword = persistSecret(randomSecret(16));
    const dbRootPassword = persistSecret(randomSecret(16));
    const mongoUrlPersisted = "mongodb://mongo/bigcapital";
    const agendashUser = "agendash";
    const agendashPassword = persistSecret(randomSecret(12));

    const tDb = Date.now();
    await trace.event("database", "Allocating port and inserting tenant + deployment rows");

    await db.transaction(async (tx) => {
      const allocated = await allocateTenantPort(tx, maxPort);
      port = allocated;

      const [tRow] = await tx
        .insert(tenants)
        .values({
          slug: input.slug,
          name: input.name,
          ownerId: input.ownerId,
          adminEmail: input.adminEmail,
          adminFirstName: input.adminFirstName,
          adminLastName: input.adminLastName,
        })
        .returning({ id: tenants.id });

      if (!tRow) throw new Error("insert tenant returned no id");

      tenantId = tRow.id;

      const [dRow] = await tx
        .insert(tenantDeployments)
        .values({
          tenantId,
          status: "provisioning",
          composeProjectName: project,
          internalPort: allocated,
          mysqlPassword: dbPassword,
          mysqlRootPassword: dbRootPassword,
          jwtSecret,
          mongoUrl: mongoUrlPersisted,
        })
        .returning({ id: tenantDeployments.id });

      if (!dRow) throw new Error("insert deployment returned no id");
      deploymentId = dRow.id;
    });

    if (
      tenantId === undefined ||
      deploymentId === undefined ||
      port === undefined ||
      oneTimeAdminPassword === undefined
    ) {
      throw new Error("internal: missing tenant, deployment, or port after transaction");
    }

    await trace.event(
      "database",
      "Stockix rows committed (tenant, deployment, port)",
      {
        meta: {
          tenantId,
          deploymentId,
          port,
          project,
          durationMs: Date.now() - tDb,
        },
      },
    );

    const envBody = buildEnvFile({
      bigcapitalRoot,
      baseUrl,
      jwtSecret,
      dbPassword,
      dbRootPassword,
      publicProxyPort: port,
      signupAllowedEmails: input.adminEmail,
      agendashUser,
      agendashPassword,
    });

    const envPath = await writeTenantEnvFile(
      join(tenantEnvRoot, input.slug),
      envBody,
    );
    await trace.event("env", "Wrote tenant .env for Docker Compose", {
      meta: { envPath },
    });

    const composeEnv = { BIGCAPITAL_ROOT: bigcapitalRoot };
    const dTimeout = cfg.dockerComposeTimeoutMs;

    await timedPhase(
      trace,
      "compose_data_services",
      "Compose data services (mysql, mongo, redis)",
      async () => {
        await dockerCompose(
          composeFile,
          project,
          envPath,
          composeEnv,
          ["up", "-d", "mysql", "mongo", "redis"],
          dTimeout,
        );
      },
    );

    let migrated = false;
    let lastMigrationError = "";
    const tMigrate = Date.now();
    const maxMig = cfg.migrationMaxAttempts;
    for (let i = 0; i < maxMig; i++) {
      try {
        log(`database_migration attempt ${i + 1}`);
        await trace.event("migrate", `Running database_migration (attempt ${i + 1})`);
        await dockerCompose(
          composeFile,
          project,
          envPath,
          composeEnv,
          ["run", "--rm", "database_migration"],
          dTimeout,
        );
        migrated = true;
        await trace.event("migrate", "database_migration finished successfully", {
          meta: {
            attempt: i + 1,
            totalMigrationPhaseMs: Date.now() - tMigrate,
          },
        });
        break;
      } catch (e) {
        lastMigrationError = String(e);
        log(`migration failed (retry): ${lastMigrationError}`);
        await trace.event(
          "migrate",
          `database_migration failed, will retry: ${lastMigrationError.slice(0, 800)}`,
          {
            level: "warn",
            meta: { attempt: i + 1, fullError: lastMigrationError.slice(0, 4000) },
          },
        );
        await new Promise((r) => setTimeout(r, cfg.migrationRetryDelayMs));
      }
    }
    if (!migrated) {
      await trace.event(
        "failed",
        `database_migration did not succeed after ${maxMig} attempts. Last error: ${lastMigrationError.slice(0, 1200)}`,
        {
          level: "error",
          meta: {
            lastMigrationError: lastMigrationError.slice(0, 8000),
            totalMigrationPhaseMs: Date.now() - tMigrate,
          },
        },
      );
      throw new Error(
        `database_migration did not succeed. Last: ${lastMigrationError.slice(0, 2000)}`,
      );
    }

    await timedPhase(
      trace,
      "compose_full_stack",
      "Compose full application stack",
      async () => {
        await dockerCompose(
          composeFile,
          project,
          envPath,
          composeEnv,
          ["up", "-d"],
          dTimeout,
        );
      },
    );

    const internalUrl = `http://127.0.0.1:${port}`;
    await trace.event("health", "Waiting for BigCapital HTTP health (/api/ping)", {
      meta: {
        internalUrl,
        timeoutMs: cfg.healthTimeoutMs,
        fetchTimeoutMs: cfg.healthFetchTimeoutMs,
        pollMinMs: cfg.healthPollMinMs,
        pollMaxMs: cfg.healthPollMaxMs,
        fastPollAttempts: cfg.healthFastPollAttempts,
      },
    });
    await waitForBigCapitalReady(internalUrl, cfg, log, trace);

    const adminBootstrapPassword = oneTimeAdminPassword;

    await timedPhase(
      trace,
      "auth_register",
      "BigCapital admin registration",
      async () => {
        await registerAdmin({
          internalBaseUrl: internalUrl,
          firstName: input.adminFirstName,
          lastName: input.adminLastName,
          email: input.adminEmail,
          password: adminBootstrapPassword,
          log,
          trace,
          fetchTimeoutMs: cfg.registerFetchTimeoutMs,
        });
      },
    );

    await db
      .update(tenantDeployments)
      .set({
        status: "active",
        registrationCompletedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(tenantDeployments.id, deploymentId));

    await trace.event("complete", "Provisioning finished — deployment active", {
      meta: {
        baseUrl,
        internalPort: port,
        composeProject: project,
        totalProvisionMs: Date.now() - provisionStartedAt,
      },
    });

    return {
      ok: true,
      tenantId,
      deploymentId,
      composeProjectName: project,
      internalPort: port,
      baseUrl,
      oneTimeAdminPassword,
    };
  } catch (err) {
    const message =
      err instanceof TenantPortExhaustedError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);

    log(`provision failed: ${message}`);
    await trace
      .event("failed", message, {
        level: "error",
        meta: { cause: err instanceof Error ? err.stack : String(err) },
      })
      .catch(() => undefined);

    try {
      const envPathGuess = join(tenantEnvRoot, input.slug, ".env");
      const composeEnv = { BIGCAPITAL_ROOT: bigcapitalRoot };
      const rollbackTimeout = getProvisionConfig().dockerComposeTimeoutMs;
      try {
        await dockerCompose(
          composeFile,
          project,
          envPathGuess,
          composeEnv,
          ["down"],
          rollbackTimeout,
        );
        log(`docker compose down for ${project} (best effort)`);
        await trace
          .event("rollback", `docker compose down completed for ${project}`, {
            level: "warn",
          })
          .catch(() => undefined);
      } catch (rollbackErr) {
        const rb = String(rollbackErr);
        log(`docker compose down failed for ${project}: ${rb}`);
        await trace
          .event(
            "rollback",
            `docker compose down failed (stack may still be running): ${rb.slice(0, 2000)}`,
            { level: "error" },
          )
          .catch(() => undefined);
      }
    } catch {
      /* ignore rollback errors */
    }

    try {
      if (deploymentId !== undefined) {
        await db
          .update(tenantDeployments)
          .set({
            status: "failed",
            lastError: message.slice(0, 4000),
            updatedAt: new Date(),
          })
          .where(eq(tenantDeployments.id, deploymentId));
      }
    } catch {
      /* ignore */
    }

    return { ok: false, message, cause: String(err) };
  }
}

export type DeprovisionOptions = {
  /** Pass `true` to run `docker compose down --volumes` (destroys MySQL/Mongo/Redis data). */
  removeVolumes?: boolean;
  log?: (message: string) => void;
};

export type DeprovisionResult =
  | {
      ok: true;
      slug: string;
      composeProject: string;
      docker: "stopped" | "skipped" | "failed";
    }
  | { ok: false; message: string };

/**
 * Stops the tenant Docker stack (best effort), deletes provision audit rows, then deletes the tenant
 * (cascades deployment + tenant_config). Idempotent if Docker or .env is already gone.
 */
export async function deprovisionTenant(
  db: PostgresJsDatabase<typeof dbSchema>,
  tenantId: string,
  options: DeprovisionOptions = {},
): Promise<DeprovisionResult> {
  const log = options.log ?? (() => undefined);

  const found = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      composeProject: tenantDeployments.composeProjectName,
    })
    .from(tenants)
    .leftJoin(
      tenantDeployments,
      eq(tenantDeployments.tenantId, tenants.id),
    )
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const row = found[0];
  if (!row) {
    return { ok: false, message: "Tenant not found" };
  }

  const slug = row.slug;
  const project =
    row.composeProject ?? composeProjectName(slug);

  const repoRoot = getRepoRoot();
  const composeFile = join(repoRoot, "infra/tenant-stack/docker-compose.yml");
  const bigcapitalRoot =
    process.env.BIGCAPITAL_ROOT?.trim() || join(repoRoot, "services/bigcapital");
  const tenantEnvRoot = defaultTenantEnvRoot();
  const envPath = join(tenantEnvRoot, slug, ".env");
  const composeEnv = { BIGCAPITAL_ROOT: bigcapitalRoot };

  let dockerStatus: "stopped" | "skipped" | "failed" = "skipped";

  let envPresent = false;
  try {
    await stat(envPath);
    envPresent = true;
  } catch {
    log(`deprovision: no .env at ${envPath} — skipping docker compose`);
    dockerStatus = "skipped";
  }

  if (envPresent) {
    const downArgs = options.removeVolumes
      ? (["down", "--volumes"] as const)
      : (["down"] as const);
    const downTimeout = getProvisionConfig().dockerComposeTimeoutMs;
    try {
      await dockerCompose(
        composeFile,
        project,
        envPath,
        composeEnv,
        [...downArgs],
        downTimeout,
      );
      dockerStatus = "stopped";
      log(`docker compose ${downArgs.join(" ")} completed for ${project}`);
    } catch (e) {
      dockerStatus = "failed";
      log(
        `deprovision: docker compose down failed (tenant row still removed): ${String(e)}`,
      );
    }
  }

  await db
    .delete(tenantProvisionEvents)
    .where(eq(tenantProvisionEvents.tenantId, tenantId));

  await db.delete(tenants).where(eq(tenants.id, tenantId));

  return {
    ok: true,
    slug,
    composeProject: project,
    docker: dockerStatus,
  };
}
