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
import {
  removeTenantTraefikConfig,
  writeTenantTraefikConfig,
} from "./traefik-config.js";

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
      /** Shown once — Stockix admin login (not stored in Stockix Postgres). */
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
  stockixFinanceRoot: string;
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
    `STOCKIX_TENANT_APP_ROOT=${params.stockixFinanceRoot}`,
    `BASE_URL=${params.baseUrl}`,
    `DB_HOST=mysql`,
    `DB_USER=stockix_tenant`,
    `DB_PASSWORD=${params.dbPassword}`,
    `DB_ROOT_PASSWORD=${params.dbRootPassword}`,
    `DB_CHARSET=utf8`,
    `SYSTEM_DB_NAME=stockix_system`,
    `TENANT_DB_NAME_PERFIX=stockix_tenant_`,
    `JWT_SECRET=${params.jwtSecret}`,
    `MONGODB_DATABASE_URL=mongodb://mongo/stockix`,
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

async function dockerCompose(
  composeFile: string,
  project: string,
  envFile: string,
  composeEnv: Record<string, string>,
  composeArgs: string[],
): Promise<void> {
  const env = { ...process.env, ...composeEnv };
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
    { env, stdio: "pipe" },
  );
}

async function waitForStockixFinanceReady(
  internalBaseUrl: string,
  timeoutMs: number,
  log: (m: string) => void,
  trace?: ProvisionTracer,
): Promise<void> {
  const url = `${internalBaseUrl}/api/ping/`;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        log(`stockix finance healthy at ${url} (attempt ${attempt})`);
        await trace?.event("health", "Stockix Finance /api/ping is healthy", {
          meta: { attempt, url },
        });
        return;
      }
      log(`ping not ok: ${res.status} (attempt ${attempt})`);
    } catch (e) {
      log(`ping error attempt ${attempt}: ${String(e)}`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Stockix Finance did not become ready within ${timeoutMs}ms`);
}

async function registerAdmin(params: {
  internalBaseUrl: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  log: (m: string) => void;
  trace?: ProvisionTracer;
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
  });
  const text = await res.text();
  if (res.ok) {
    params.log("Stockix Finance POST /api/auth/register succeeded");
    await params.trace?.event(
      "auth",
      "Stockix admin registration succeeded",
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
      "Stockix register rejected as duplicate — treating bootstrap as idempotent",
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
 * Stockix `POST /api/auth/login` validates **`crediential`** (typo), not `credential`.
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
  const stockixFinanceRoot =
    process.env.STOCKIX_TENANT_APP_ROOT?.trim() || join(repoRoot, "services/stockix-finance");
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
    await trace.event("run", "Provisioner started", {
      meta: { project, baseUrl, stockixFinanceRoot },
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

    await trace.event("prepare", "Ensuring Stockix Finance host directories exist");
    await mkdir(join(stockixFinanceRoot, "data/logs/nginx"), {
      recursive: true,
    });
    await mkdir(join(stockixFinanceRoot, "docker/certbot/certs"), {
      recursive: true,
    });

    oneTimeAdminPassword = bootstrapPassword();
    const jwtSecret = persistSecret(randomSecret(32));
    const dbPassword = persistSecret(randomSecret(16));
    const dbRootPassword = persistSecret(randomSecret(16));
    const mongoUrlPersisted = "mongodb://mongo/stockix";
    const agendashUser = "agendash";
    const agendashPassword = persistSecret(randomSecret(12));

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
        meta: { tenantId, deploymentId, port, project },
      },
    );

    const envBody = buildEnvFile({
      stockixFinanceRoot,
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

    const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };

    await trace.event(
      "docker",
      "Compose: starting data services (mysql, mongo, redis)",
    );
    await dockerCompose(composeFile, project, envPath, composeEnv, [
      "up",
      "-d",
      "mysql",
      "mongo",
      "redis",
    ]);

    let migrated = false;
    for (let i = 0; i < 8; i++) {
      try {
        log(`database_migration attempt ${i + 1}`);
        await trace.event("migrate", `Running database_migration (attempt ${i + 1})`);
        await dockerCompose(composeFile, project, envPath, composeEnv, [
          "run",
          "--rm",
          "database_migration",
        ]);
        migrated = true;
        await trace.event("migrate", "database_migration finished successfully", {
          meta: { attempt: i + 1 },
        });
        break;
      } catch (e) {
        log(`migration failed (retry): ${String(e)}`);
        await trace.event(
          "migrate",
          `database_migration failed, will retry: ${String(e).slice(0, 500)}`,
          { level: "warn", meta: { attempt: i + 1 } },
        );
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
    if (!migrated) throw new Error("database_migration did not succeed");

    await trace.event("docker", "Compose: starting full application stack");
    await dockerCompose(composeFile, project, envPath, composeEnv, [
      "up",
      "-d",
    ]);

    const tenantInternalHost =
      process.env.TENANT_INTERNAL_HOST?.trim() || "127.0.0.1";
    const internalUrl = `http://${tenantInternalHost}:${port}`;
    await trace.event("health", "Waiting for Stockix Finance HTTP health (/api/ping)", {
      meta: { internalUrl, timeoutMs: 180_000 },
    });
    await waitForStockixFinanceReady(internalUrl, 180_000, log, trace);

    await registerAdmin({
      internalBaseUrl: internalUrl,
      firstName: input.adminFirstName,
      lastName: input.adminLastName,
      email: input.adminEmail,
      password: oneTimeAdminPassword,
      log,
      trace,
    });

    await db
      .update(tenantDeployments)
      .set({
        status: "active",
        registrationCompletedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(tenantDeployments.id, deploymentId));

    try {
      await writeTenantTraefikConfig(input.slug, port, rootDomain);
      await trace.event("edge", "Traefik tenant route written", {
        meta: { slug: input.slug, port },
      });
    } catch (e) {
      await trace.event(
        "edge",
        `Traefik dynamic config failed: ${String(e)}`,
        { level: "warn" },
      );
    }

    await trace.event("complete", "Provisioning finished — deployment active", {
      meta: { baseUrl, internalPort: port, composeProject: project },
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
      await removeTenantTraefikConfig(input.slug).catch(() => undefined);
      const envPathGuess = join(tenantEnvRoot, input.slug, ".env");
      const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };
      await dockerCompose(composeFile, project, envPathGuess, composeEnv, [
        "down",
      ]).catch(() => undefined);
      log(`docker compose down for ${project} (best effort)`);
      await trace
        .event("rollback", `docker compose down for ${project} (best effort)`, {
          level: "warn",
        })
        .catch(() => undefined);
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
  const stockixFinanceRoot =
    process.env.STOCKIX_TENANT_APP_ROOT?.trim() || join(repoRoot, "services/stockix-finance");
  const tenantEnvRoot = defaultTenantEnvRoot();
  const envPath = join(tenantEnvRoot, slug, ".env");
  const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };

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
    try {
      await dockerCompose(
        composeFile,
        project,
        envPath,
        composeEnv,
        [...downArgs],
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

  await removeTenantTraefikConfig(slug).catch(() => undefined);

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
