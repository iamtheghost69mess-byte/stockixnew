import { parseFinanceApiJsonText } from "@repo/shared/finance-api";
import type { ProvisionTracer } from "../../provision-trace.js";
import { STOCKIX_FINANCE_HEALTH_POLL_MS } from "../constants.js";
import type { BuildOrgInput, BuildOrgResult } from "./fetch-stockix-finance-build-org.js";
import { fetchBuildOrganization } from "./fetch-stockix-finance-build-org.js";
import type { OrgBuildSettings } from "./fetch-stockix-finance-org-settings.js";
import { fetchOrgSettingsFromMainInstance } from "./fetch-stockix-finance-org-settings.js";
import type { IStockixFinanceBootstrap } from "../contracts.js";

function financeApiBase(internalBaseUrl: string): string {
  return internalBaseUrl.replace(/\/+$/, "");
}

export class FetchStockixFinanceBootstrap implements IStockixFinanceBootstrap {
  async waitUntilReady(
    internalBaseUrl: string,
    timeoutMs: number,
    log: (m: string) => void,
    requestId?: string,
    trace?: ProvisionTracer,
  ): Promise<void> {
    const url = `${financeApiBase(internalBaseUrl)}/api/ping`;
    const started = Date.now();
    const deadline = started + timeoutMs;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5_000),
          headers: requestId
            ? {
                "x-request-id": requestId,
                "x-correlation-id": requestId,
              }
            : undefined,
        });
        if (res.ok) {
          log(`stockix finance healthy at ${url}`);
          await trace?.event("health", "Stockix Finance /api/ping is healthy", {
            meta: { url, pollMs: STOCKIX_FINANCE_HEALTH_POLL_MS },
          });
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, STOCKIX_FINANCE_HEALTH_POLL_MS));
    }
    throw new Error(
      `Stockix Finance did not become ready within ${timeoutMs}ms (last error: ${lastError || "unknown"})`,
    );
  }

  async registerBootstrapAdmin(params: {
    internalBaseUrl: string;
    internalApiSecret: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    organizationNumber?: string;
    log: (m: string) => void;
    requestId?: string;
    trace?: ProvisionTracer;
  }): Promise<{ tenantId: number; organizationId: string }> {
    const url = `${financeApiBase(params.internalBaseUrl)}/api/internal/provision-user`;
    const maxAttempts = 3;
    const requestTimeoutMs = 60_000;
    let lastFailure = "unknown";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      await params.trace?.event("bootstrap", "Bootstrap registration attempt", {
        meta: {
          url,
          attempt,
          maxAttempts,
        },
      });
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": params.internalApiSecret,
            ...(params.requestId
              ? {
                  "x-request-id": params.requestId,
                  "x-correlation-id": params.requestId,
                }
              : {}),
          },
          body: JSON.stringify({
            firstName: params.firstName,
            lastName: params.lastName,
            email: params.email,
            password: params.password,
            role: "admin",
            ...(params.organizationNumber
              ? { organizationNumber: params.organizationNumber }
              : {}),
          }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });

        if (res.ok) {
          const text = await res.text();
          const json = parseFinanceApiJsonText(text);
          const tenantId = Number(json.tenantId);
          const organizationId = String(json.organizationId ?? "");
          if (!tenantId || !organizationId) {
            lastFailure = "provision_user_missing_tenant_or_organization_id";
          } else {
            await params.trace?.event("bootstrap", "Bootstrap registration succeeded", {
              meta: {
                url,
                attempt,
                elapsedMs: Date.now() - attemptStartedAt,
                tenantId,
                organizationId,
              },
            });
            return { tenantId, organizationId };
          }
        }

        const text = await res.text();
        lastFailure = `HTTP ${res.status} ${text.slice(0, 500)}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }

      await params.trace?.event("bootstrap", "Bootstrap registration attempt failed", {
        level: "warn",
        meta: {
          url,
          attempt,
          maxAttempts,
          elapsedMs: Date.now() - attemptStartedAt,
          error: lastFailure,
        },
      });

      if (attempt < maxAttempts) {
        const backoffMs = Math.min(5_000, attempt * 1_500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error(`register failed: ${lastFailure} url=${url}`);
  }

  fetchOrgSettings(params: {
    mainInternalBaseUrl: string;
    adminEmail: string;
    adminPassword: string;
    correlationId: string;
  }): Promise<OrgBuildSettings | null> {
    return fetchOrgSettingsFromMainInstance(params);
  }

  buildOrganization(input: BuildOrgInput, log: (m: string) => void): Promise<BuildOrgResult> {
    return fetchBuildOrganization(input, log);
  }
}
