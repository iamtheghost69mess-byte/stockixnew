import { apiConfig } from "@repo/config";
import { logger } from "./logger.js";

export async function emitMetric(
  name: string,
  value: number,
  tags: Record<string, string | number>,
): Promise<void> {
  const endpoint = apiConfig.metricsEndpoint;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiConfig.metricsAuthToken
        ? { Authorization: `Bearer ${apiConfig.metricsAuthToken}` }
        : {}),
    },
    body: JSON.stringify({
      source: "api",
      name,
      value,
      tags,
      ts: new Date().toISOString(),
    }),
  }).catch((error) => {
    logger.error("metrics emit failed", error);
  });
}

export function emitInternalJobAudit(
  c: { get: (key: "requestId") => string },
  action: string,
  details: Record<string, unknown>,
): void {
  const requestId = c.get("requestId");
  logger.info("internal_job_audit", {
    type: "internal_job_audit",
    action,
    requestId,
    ...details,
  });
}
