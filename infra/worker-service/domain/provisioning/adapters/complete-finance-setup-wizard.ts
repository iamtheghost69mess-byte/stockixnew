import { apiConfig } from "@repo/config";

export async function completeFinanceSetupWizard(params: {
  internalBaseUrl: string;
  financeTenantId: number;
  log: (message: string) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = apiConfig.internalApiSecret?.trim();
  if (!secret) {
    return { ok: false, error: "INTERNAL_API_SECRET is required for setup complete" };
  }

  const url = `${params.internalBaseUrl.replace(/\/+$/, "")}/api/internal/organization/setup/complete`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({ tenant_id: params.financeTenantId }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 400 || res.status === 409) {
        params.log(
          `[provision] setup wizard already complete (graceful success) financeTenantId=${params.financeTenantId}: ${res.status}`,
        );
        return { ok: true };
      }
      return {
        ok: false,
        error: `setup_complete_failed:${res.status}:${text.slice(0, 300)}`,
      };
    }
    params.log(
      `[provision] setup wizard marked complete financeTenantId=${params.financeTenantId}`,
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `setup_complete_failed:${msg}` };
  }
}
