import { posConfig, apiConfig } from "@repo/config";

import { buildFinanceInternalUrlForPos } from "../build-finance-internal-url.js";

export type WirePosBigcapitalIntegrationInput = {
  posOrganizationId: string;
  posHostPort: number;
  slug: string;
  internalPort: number;
  workerInternalUrl?: string;
  financeTenantId: number;
  walkInCustomerId: number;
  cashAccountId: number;
  cardAccountId: number;
  defaultWarehouseId?: number;
  log: (message: string) => void;
  posBaseUrl?: string;
};

export type WirePosBigcapitalIntegrationResult = {
  wired: true;
  internalBaseUrl: string;
};

function apiKeyOrThrow(): string {
  const key = posConfig.platformApiKey.trim();
  if (key.length < 10) {
    throw new Error(
      "POS_PLATFORM_API_KEY is required for POS integration wiring (min 10 characters)",
    );
  }
  return key;
}

function posApiBase(input: WirePosBigcapitalIntegrationInput): string {
  const port = input.posHostPort;
  const fromEnv = input.posBaseUrl ?? posConfig.platformBaseUrl;
  if (fromEnv && !fromEnv.includes("localhost:8010")) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${port}`;
}

/**
 * PUT /api/platform/v1/organizations/:orgId/integration/bigcapital
 */
export async function wirePosBigcapitalIntegration(
  input: WirePosBigcapitalIntegrationInput,
): Promise<WirePosBigcapitalIntegrationResult> {
  const apiKey = apiKeyOrThrow();
  const base = posApiBase(input);
  const internalBaseUrl = buildFinanceInternalUrlForPos({
    slug: input.slug,
    internalPort: input.internalPort,
    workerInternalUrl: input.workerInternalUrl,
  });
  const internalSecret = apiConfig.internalApiSecret?.trim();
  if (!internalSecret) {
    throw new Error("INTERNAL_API_SECRET is required to wire POS Bigcapital integration");
  }

  const url = `${base}/api/platform/v1/organizations/${input.posOrganizationId}/integration/bigcapital`;
  input.log(
    `[provision][pos] wiring Bigcapital integration orgId=${input.posOrganizationId} financeUrl=${internalBaseUrl}`,
  );

  const body: Record<string, unknown> = {
    enabled: true,
    financeTenantId: input.financeTenantId,
    internalBaseUrl,
    internalSecret,
    defaultWalkInCustomerId: input.walkInCustomerId,
    defaultCashDepositAccountId: input.cashAccountId,
    defaultCardDepositAccountId: input.cardAccountId,
  };
  if (input.defaultWarehouseId && input.defaultWarehouseId > 0) {
    body.defaultWarehouseId = input.defaultWarehouseId;
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `wire_pos_integration_failed:${res.status}:${text.slice(0, 500)}`,
    );
  }

  input.log("[provision][pos] Bigcapital integration wired successfully");
  return { wired: true, internalBaseUrl };
}
