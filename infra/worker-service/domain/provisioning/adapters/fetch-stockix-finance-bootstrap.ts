import type { ProvisionTracer } from "../../provision-trace.js";
import { STOCKIX_FINANCE_HEALTH_POLL_MS } from "../constants.js";
import type { IStockixFinanceBootstrap } from "../contracts.js";

export class FetchStockixFinanceBootstrap implements IStockixFinanceBootstrap {
  async waitUntilReady(
    internalBaseUrl: string,
    timeoutMs: number,
    log: (m: string) => void,
    trace?: ProvisionTracer,
  ): Promise<void> {
    const url = `${internalBaseUrl}/api/ping/`;
    const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(timeoutMs, 5_000)) });
    if (!res.ok) throw new Error(`Stockix Finance did not become ready within ${timeoutMs}ms`);
    log(`stockix finance healthy at ${url}`);
    await trace?.event("health", "Stockix Finance /api/ping is healthy", { meta: { url, pollMs: STOCKIX_FINANCE_HEALTH_POLL_MS } });
  }

  async registerBootstrapAdmin(params: {
    internalBaseUrl: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    log: (m: string) => void;
    trace?: ProvisionTracer;
  }): Promise<void> {
    const res = await fetch(`${params.internalBaseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: params.firstName,
        last_name: params.lastName,
        email: params.email,
        password: params.password,
      }),
    });
    if (res.ok) return;
    const text = await res.text();
    throw new Error(`register failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
}
