import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { allocateTenantPort, TenantPortExhaustedError } from "@repo/db";
import {
  tenantDeployments,
  tenants,
} from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dbSchema from "@repo/db/schema";
import { eq } from "drizzle-orm";

import { defaultTenantEnvRoot } from "../env-paths.js";
import { getTenantStackPaths } from "../provision-paths.js";
import {
  createProvisionTracer,
  type ProvisionTracer,
} from "../provision-trace.js";
import { composeProjectName } from "./compose-project-name.js";
import { STOCKIX_FINANCE_HEALTH_TIMEOUT_MS } from "./constants.js";
import type {
  IDockerComposeRunner,
  IStockixFinanceBootstrap,
  ITenantEdgePublisher,
  ITenantSecretGenerator,
} from "./contracts.js";
import type { ProvisionInput, ProvisionResult } from "./types.js";
import {
  buildTenantComposeEnvBody,
  writeTenantEnvFileAtomic,
} from "./tenant-env.js";
import {
  composeDownBestEffort,
  composeRunMigrationWithRetries,
  composeUpApplicationStack,
  composeUpDataServices,
} from "./tenant-docker-workflow.js";

export type TenantProvisionServiceDeps = {
  docker: IDockerComposeRunner;
  secrets: ITenantSecretGenerator;
  finance: IStockixFinanceBootstrap;
  edge: ITenantEdgePublisher;
};

/**
 * Orchestrates tenant row creation, env generation, Docker Compose, health checks, and edge routing.
 * Depends on abstractions only (DIP) — swap adapters for tests or alternate infrastructure.
 */
export class TenantProvisionService {
  constructor(private readonly deps: TenantProvisionServiceDeps) {}

  async provision(
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

    const { tenantComposeFile: composeFile, stockixFinanceRoot } =
      getTenantStackPaths();
    const rootDomain = process.env.ROOT_DOMAIN?.trim() || "example.com";
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
        await trace.event(
          "validate",
          `Tenant slug already exists: ${input.slug}`,
          { level: "error" },
        );
        return {
          ok: false,
          message: `Tenant slug already exists: ${input.slug}`,
        };
      }

      await trace.event(
        "prepare",
        "Ensuring Stockix Finance host directories exist",
      );
      await mkdir(join(stockixFinanceRoot, "data/logs/nginx"), {
        recursive: true,
      });
      await mkdir(join(stockixFinanceRoot, "docker/certbot/certs"), {
        recursive: true,
      });

      const { secrets } = this.deps;
      oneTimeAdminPassword = secrets.bootstrapAdminPassword();
      const jwtSecret = secrets.persistSecret(secrets.randomHex(32));
      const dbPassword = secrets.persistSecret(secrets.randomHex(16));
      const dbRootPassword = secrets.persistSecret(secrets.randomHex(16));
      const mongoUrlPersisted = "mongodb://mongo/stockix";
      const agendashUser = "agendash";
      const agendashPassword = secrets.persistSecret(secrets.randomHex(12));

      await trace.event(
        "database",
        "Allocating port and inserting tenant + deployment rows",
      );

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
        throw new Error(
          "internal: missing tenant, deployment, or port after transaction",
        );
      }

      await trace.event(
        "database",
        "Stockix rows committed (tenant, deployment, port)",
        {
          meta: { tenantId, deploymentId, port, project },
        },
      );

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

      const envPath = await writeTenantEnvFileAtomic(
        join(tenantEnvRoot, input.slug),
        envBody,
      );
      await trace.event("env", "Wrote tenant .env for Docker Compose", {
        meta: { envPath },
      });

      const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };
      const composeCtx = {
        composeFile,
        project,
        envPath,
        composeEnv,
      };

      const { docker, finance, edge } = this.deps;

      await trace.event(
        "docker",
        "Compose: starting data services (mysql, mongo, redis)",
      );
      await composeUpDataServices(docker, composeCtx);

      await composeRunMigrationWithRetries(docker, composeCtx, log, trace);

      await trace.event("docker", "Compose: starting full application stack");
      await composeUpApplicationStack(docker, composeCtx);

      const tenantInternalHost =
        process.env.TENANT_INTERNAL_HOST?.trim() || "127.0.0.1";
      const internalUrl = `http://${tenantInternalHost}:${port}`;
      await trace.event(
        "health",
        "Waiting for Stockix Finance HTTP health (/api/ping)",
        {
          meta: { internalUrl, timeoutMs: STOCKIX_FINANCE_HEALTH_TIMEOUT_MS },
        },
      );
      await finance.waitUntilReady(
        internalUrl,
        STOCKIX_FINANCE_HEALTH_TIMEOUT_MS,
        log,
        trace,
      );

      await finance.registerBootstrapAdmin({
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
        await edge.publish(input.slug, port, rootDomain);
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
      return this.handleProvisionFailure({
        err,
        trace,
        log,
        input,
        tenantEnvRoot,
        stockixFinanceRoot,
        composeFile,
        project,
        deploymentId,
        db,
      });
    }
  }

  private async handleProvisionFailure(params: {
    err: unknown;
    trace: ProvisionTracer;
    log: (m: string) => void;
    input: ProvisionInput;
    tenantEnvRoot: string;
    stockixFinanceRoot: string;
    composeFile: string;
    project: string;
    deploymentId: string | undefined;
    db: PostgresJsDatabase<typeof dbSchema>;
  }): Promise<ProvisionResult> {
    const {
      err,
      trace,
      log,
      input,
      tenantEnvRoot,
      stockixFinanceRoot,
      composeFile,
      project,
      deploymentId,
      db,
    } = params;

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
      await this.deps.edge.unpublish(input.slug).catch(() => undefined);
      const envPathGuess = join(tenantEnvRoot, input.slug, ".env");
      const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };
      await composeDownBestEffort(this.deps.docker, {
        composeFile,
        project,
        envPath: envPathGuess,
        composeEnv,
      });
      log(`docker compose down for ${project} (best effort)`);
      await trace
        .event(
          "rollback",
          `docker compose down for ${project} (best effort)`,
          { level: "warn" },
        )
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
