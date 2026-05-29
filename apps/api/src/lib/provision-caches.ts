import { invalidateTenantReadinessCache } from "../provisioning/readiness-engine.js";

export const PROVISION_PASSWORD_TTL_MS = 15 * 60 * 1000;

export type PosDefaultCredentialsPayload = {
  adminPin: string;
  allRoles: { role: string; username: string; pin: string }[];
};

export const provisionPasswordCache = new Map<string, { password: string; expiresAt: number }>();
export const provisionPosCredentialsCache = new Map<
  string,
  { credentials: PosDefaultCredentialsPayload; expiresAt: number }
>();

export function purgeProvisionCaches(correlationIds: string[]): void {
  for (const correlationId of correlationIds) {
    provisionPasswordCache.delete(correlationId);
    provisionPosCredentialsCache.delete(correlationId);
    invalidateTenantReadinessCache(correlationId);
  }
}
