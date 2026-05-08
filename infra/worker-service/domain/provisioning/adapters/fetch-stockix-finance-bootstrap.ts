import type { ProvisionTracer } from "../../provision-trace.js";
import { STOCKIX_FINANCE_HEALTH_POLL_MS } from "../constants.js";
import type { IStockixFinanceBootstrap } from "../contracts.js";

export class FetchStockixFinanceBootstrap implements IStockixFinanceBootstrap {
  async waitUntilReady(
    internalBaseUrl: string,
    timeoutMs: number,
    log: (m: string) => void,
    requestId?: string,
    trace?: ProvisionTracer,
  ): Promise<void> {
    const url = `${internalBaseUrl}/api/ping/`;
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
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    log: (m: string) => void;
    requestId?: string;
    trace?: ProvisionTracer;
  }): Promise<void> {
    const url = `${params.internalBaseUrl}/api/auth/register`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(params.requestId
            ? {
                "x-request-id": params.requestId,
                "x-correlation-id": params.requestId,
              }
            : {}),
        },
        body: JSON.stringify({
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          password: params.password,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`register failed: fetch error (${message}) url=${url}`);
    }
    if (res.ok) return;
    const text = await res.text();
    throw new Error(`register failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
}
