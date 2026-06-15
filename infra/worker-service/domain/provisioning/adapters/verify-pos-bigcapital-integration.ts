import { posConfig } from "@repo/config";

import type { WirePosBigcapitalIntegrationInput } from "./wire-pos-bigcapital-integration.js";

export type VerifyPosBigcapitalIntegrationInput = Pick<
  WirePosBigcapitalIntegrationInput,
  "posOrganizationId" | "posHostPort" | "posBaseUrl"
> & {
  log?: (message: string) => void;
};

export type VerifyPosBigcapitalIntegrationResult = {
  healthy: boolean;
  reason?: string;
};

function apiKeyOrThrow(): string {
  const key = posConfig.platformApiKey.trim();
  if (key.length < 10) {
    throw new Error(
      "POS_PLATFORM_API_KEY is required for POS integration health check (min 10 characters)",
    );
  }
  return key;
}

function posApiBase(input: VerifyPosBigcapitalIntegrationInput): string {
  const port = input.posHostPort;
  const fromEnv = input.posBaseUrl ?? posConfig.platformBaseUrl;
  if (fromEnv && !fromEnv.includes("localhost:8010")) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${port}`;
}

/**
 * GET /api/platform/v1/organizations/:orgId/integration/bigcapital/health
 */
export async function verifyPosBigcapitalIntegration(
  input: VerifyPosBigcapitalIntegrationInput,
): Promise<VerifyPosBigcapitalIntegrationResult> {
  const apiKey = apiKeyOrThrow();
  const base = posApiBase(input);
  const url = `${base}/api/platform/v1/organizations/${input.posOrganizationId}/integration/bigcapital/health`;

  input.log?.(
    `[provision][pos] checking Bigcapital integration health orgId=${input.posOrganizationId}`,
  );

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      "X-Forwarded-Proto": "https",
    },
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      healthy: false,
      reason: `health_http_${res.status}:${text.slice(0, 120)}`,
    };
  }

  try {
    const body = JSON.parse(text) as {
      success?: boolean;
      data?: { healthy?: boolean; reason?: string };
    };
    if (body?.data?.healthy === true) {
      return { healthy: true };
    }
    return {
      healthy: false,
      reason: body?.data?.reason || "integration_unhealthy",
    };
  } catch {
    return { healthy: false, reason: "health_invalid_response" };
  }
}
