import { parseFinanceApiJsonText } from "@repo/shared/finance-api";

export type SeedFinancePosDefaultsResult = {
  walkInCustomerId: number;
  cashAccountId: number;
  cardAccountId: number;
  serviceChargeItemId?: number;
  discountItemId?: number;
};

function readOptionalPositiveId(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

/**
 * POST /api/internal/tenants/:tenantId/seed-pos-defaults
 */
export async function seedFinancePosDefaults(params: {
  internalBaseUrl: string;
  internalApiSecret: string;
  financeTenantId: number;
  correlationId?: string;
  log?: (message: string) => void;
}): Promise<SeedFinancePosDefaultsResult> {
  const base = params.internalBaseUrl.replace(/\/+$/, "");
  const url = `${base}/api/internal/tenants/${params.financeTenantId}/seed-pos-defaults`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": params.internalApiSecret,
      ...(params.correlationId ? { "x-request-id": params.correlationId } : {}),
    },
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  const body = parseFinanceApiJsonText(text);
  if (!res.ok) {
    const detail =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : text.slice(0, 300);
    throw new Error(`seed_pos_defaults_failed:${res.status}:${detail}`);
  }
  const walkInCustomerId = Number(body.walkInCustomerId);
  const cashAccountId = Number(body.cashAccountId);
  const cardAccountId = Number(body.cardAccountId);
  if (
    !Number.isFinite(walkInCustomerId)
    || walkInCustomerId <= 0
    || !Number.isFinite(cashAccountId)
    || cashAccountId <= 0
    || !Number.isFinite(cardAccountId)
    || cardAccountId <= 0
  ) {
    throw new Error("seed_pos_defaults_failed:missing_ids");
  }
  const serviceChargeItemId = readOptionalPositiveId(body.serviceChargeItemId);
  const discountItemId = readOptionalPositiveId(body.discountItemId);
  const bridgeNote =
    serviceChargeItemId || discountItemId
      ? ` serviceCharge=${serviceChargeItemId ?? "n/a"} discount=${discountItemId ?? "n/a"}`
      : "";
  params.log?.(
    `[provision] POS defaults seeded walkIn=${walkInCustomerId} cash=${cashAccountId} card=${cardAccountId}${bridgeNote}`,
  );
  return {
    walkInCustomerId,
    cashAccountId,
    cardAccountId,
    serviceChargeItemId,
    discountItemId,
  };
}
