import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createCipheriv, randomBytes } from "node:crypto";

import { apiConfig } from "@repo/config";
import { allocateTenantPort } from "@repo/db";
import { tenantDeployments, tenants } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as dbSchema from "@repo/db/schema";

import { defaultTenantEnvRoot } from "../domain/env-paths.js";
import { getTenantStackPaths } from "../domain/provision-paths.js";
import { createProvisionTracer } from "../domain/provision-trace.js";
import { composeProjectName } from "../domain/provisioning/compose-project-name.js";
import { STOCKIX_FINANCE_HEALTH_TIMEOUT_MS } from "../domain/provisioning/constants.js";
import type { TenantProvisionServiceDeps } from "../domain/provisioning/tenant-provision-service.js";
import { buildTenantComposeEnvBody, writeTenantEnvFileAtomic } from "../domain/provisioning/tenant-env.js";
import {
  composeDownBestEffort,
  executeAppStep,
  executeDataStep,
  executeMigrationStep,
} from "../domain/provisioning/tenant-docker-workflow.js";
import type { ProvisionInput, ProvisionResult } from "../domain/provisioning/types.js";

function encryptDeploymentSecret(plaintext: string): string {
  const key = Buffer.from(apiConfig.deploymentSecretKey, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export async function executeProvisionRuntime(
  deps: TenantProvisionServiceDeps,
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
    () => ({ slug: input.slug, tenantId, deploymentId }),
    log,
  );
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const rootDomain = apiConfig.rootDomain || "example.com";
  const publicScheme = apiConfig.publicBaseUrlScheme;
  const maxPort = apiConfig.maxTenantPort;
  const tenantEnvRoot = defaultTenantEnvRoot();
  const project = composeProjectName(input.slug);
  const baseUrl = `${publicScheme}://${input.slug}.${rootDomain}`;
  let port: number | undefined;
  let oneTimeAdminPassword: string | undefined;
  let composeCtx:
    | { composeFile: string; project: string; envPath: string; composeEnv: Record<string, string> }
    | null = null;
  let sideEffectsStarted = false;

  try {
    await mkdir(join(stockixFinanceRoot, "data/logs/nginx"), { recursive: true });
    await mkdir(join(stockixFinanceRoot, "docker/certbot/certs"), { recursive: true });

    const { secrets } = deps;
    oneTimeAdminPassword = secrets.bootstrapAdminPassword();
    const jwtSecret = secrets.persistSecret(secrets.randomHex(32));
    const dbPassword = secrets.persistSecret(secrets.randomHex(16));
    const dbRootPassword = secrets.persistSecret(secrets.randomHex(16));
    const mongoUrlPersisted = "mongodb://mongo/stockix";
    const agendashUser = "agendash";
    const agendashPassword = secrets.persistSecret(secrets.randomHex(12));
    await db.transaction(async (tx) => {
      const allocated = await allocateTenantPort(tx, maxPort);
      port = allocated;
      const [tRow] = await tx.insert(tenants).values({
        slug: input.slug,
        name: input.name,
        ownerId: input.ownerId,
        adminEmail: input.adminEmail,
        adminFirstName: input.adminFirstName,
        adminLastName: input.adminLastName,
        status: "provisioning",
      }).returning({ id: tenants.id });
      tenantId = tRow!.id;
      const [dRow] = await tx.insert(tenantDeployments).values({
        tenantId,
        status: "provisioning",
        composeProjectName: project,
        internalPort: allocated,
        mysqlPassword: encryptDeploymentSecret(dbPassword),
        mysqlRootPassword: encryptDeploymentSecret(dbRootPassword),
        jwtSecret: encryptDeploymentSecret(jwtSecret),
        mongoUrl: mongoUrlPersisted,
      }).returning({ id: tenantDeployments.id });
      deploymentId = dRow!.id;
    });
    const envBody = buildTenantComposeEnvBody({
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
    const envPath = await writeTenantEnvFileAtomic(join(tenantEnvRoot, input.slug), envBody);
    const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };
    composeCtx = { composeFile, project, envPath, composeEnv };
    const { docker, finance, edge } = deps;
    sideEffectsStarted = true;
    await executeDataStep(docker, composeCtx);
    await executeMigrationStep(docker, composeCtx, log);
    await executeAppStep(docker, composeCtx);

    const internalUrl = `http://${apiConfig.tenantInternalHost}:${port}`;
    await finance.waitUntilReady(internalUrl, STOCKIX_FINANCE_HEALTH_TIMEOUT_MS, log, trace);
    await finance.registerBootstrapAdmin({
      internalBaseUrl: internalUrl,
      firstName: input.adminFirstName,
      lastName: input.adminLastName,
      email: input.adminEmail,
      password: oneTimeAdminPassword,
      log,
      trace,
    });
    await edge.publish(input.slug, port, rootDomain).catch(() => undefined);
    return {
      ok: true,
      tenantId: tenantId!,
      deploymentId: deploymentId!,
      composeProjectName: project,
      internalPort: port!,
      baseUrl,
      oneTimeAdminPassword: oneTimeAdminPassword!,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (tenantId && deploymentId) {
      await db
        .update(tenants)
        .set({ status: "failed" })
        .where(eq(tenants.id, tenantId))
        .catch(() => undefined);
      await db
        .update(tenantDeployments)
        .set({ status: "failed", lastError: message, updatedAt: new Date() })
        .where(eq(tenantDeployments.id, deploymentId))
        .catch(() => undefined);
    }
    if (sideEffectsStarted && composeCtx) {
      await trace
        .event("cleanup", "Attempting best-effort compose rollback", {
          level: "warn",
          meta: { composeProjectName: composeCtx.project },
        })
        .catch(() => undefined);
      const rolledBack = await composeDownBestEffort(deps.docker, composeCtx);
      if (rolledBack && tenantId) {
        await db.delete(tenants).where(eq(tenants.id, tenantId)).catch(() => undefined);
        await trace
          .event("cleanup", "Compose rollback completed and tenant records removed", {
            level: "info",
            meta: { composeProjectName: composeCtx.project, tenantId },
          })
          .catch(() => undefined);
      } else if (!rolledBack) {
        await trace
          .event("cleanup", "Compose rollback failed; tenant marked failed for operator recovery", {
            level: "error",
            meta: { composeProjectName: composeCtx.project, tenantId, deploymentId },
          })
          .catch(() => undefined);
      }
    }
    await trace
      .event("failed", message, { level: "error", meta: { cause: String(err) } })
      .catch(() => undefined);
    return { ok: false, message, cause: String(err) };
  }
}
