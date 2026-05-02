import type { ProvisionTracer } from "../../provision-trace.js";
import type { IStockixFinanceBootstrap } from "../contracts.js";
import { STOCKIX_FINANCE_HEALTH_POLL_MS } from "../constants.js";

/**
 * HTTP bootstrap against a running Stockix Finance instance.
 * Note: Stockix `POST /api/auth/login` expects **`crediential`** (upstream typo), not `credential`.
 */
export class FetchStockixFinanceBootstrap implements IStockixFinanceBootstrap {
  async waitUntilReady(
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
      await new Promise((r) => setTimeout(r, STOCKIX_FINANCE_HEALTH_POLL_MS));
    }
    throw new Error(`Stockix Finance did not become ready within ${timeoutMs}ms`);
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
}
