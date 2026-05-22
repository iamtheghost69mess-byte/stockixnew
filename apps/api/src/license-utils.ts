import { randomBytes } from "node:crypto";
import { apiConfig } from "@repo/config";
import { licenses, plans } from "@repo/db/schema";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { SignJWT, jwtVerify } from "jose";

export type PlanLimitsDb = PostgresJsDatabase<typeof schema>;
export type TenantLicenseRow = InferSelectModel<typeof licenses>;

/**
 * Returns the single canonical license for a tenant.
 *
 * Priority (do not reorder without documenting why):
 * 1. Active perpetual (latest activatedAt)
 * 2. Active non-perpetual, not past expiresAt (latest expiresAt)
 * 3. Most recent expired (grace-period fallback)
 */
export async function getActiveLicenseForTenant(
  db: PlanLimitsDb,
  tenantId: string,
): Promise<TenantLicenseRow | null> {
  const perpetual = await db
    .select()
    .from(licenses)
    .where(
      and(
        eq(licenses.tenantId, tenantId),
        eq(licenses.status, "active"),
        eq(licenses.isPerpetual, true),
      ),
    )
    .orderBy(desc(licenses.activatedAt))
    .limit(1);

  if (perpetual[0]) return perpetual[0];

  const now = new Date();
  const active = await db
    .select()
    .from(licenses)
    .where(
      and(
        eq(licenses.tenantId, tenantId),
        eq(licenses.status, "active"),
        eq(licenses.isPerpetual, false),
        or(isNull(licenses.expiresAt), gt(licenses.expiresAt, now)),
      ),
    )
    .orderBy(desc(licenses.expiresAt))
    .limit(1);

  if (active[0]) return active[0];

  const expired = await db
    .select()
    .from(licenses)
    .where(and(eq(licenses.tenantId, tenantId), eq(licenses.status, "expired")))
    .orderBy(desc(licenses.expiresAt))
    .limit(1);

  if (expired[0]) return expired[0];

  return null;
}

/**
 * Fetches maxOrganizations and maxActivations from the plans table
 * for a given planSlug. Returns safe defaults on miss.
 */
export async function getPlanLimits(
  db: PlanLimitsDb,
  planSlug: string,
): Promise<{ maxOrganizations: number; maxActivations: number }> {
  const row = await db
    .select({
      maxOrganizations: plans.maxOrganizations,
      maxActivations: plans.maxActivations,
    })
    .from(plans)
    .where(eq(plans.slug, planSlug))
    .limit(1);

  if (!row[0]) {
    console.warn(`[getPlanLimits] Plan slug "${planSlug}" not found. Using defaults.`);
    return { maxOrganizations: 1, maxActivations: 1 };
  }

  return {
    maxOrganizations: row[0].maxOrganizations,
    maxActivations: row[0].maxActivations,
  };
}

/**
 * Verifies that a license's limits match its plan's limits (diagnostic only).
 * Runtime enforcement always uses the license row.
 */
export async function isLicenseLimitsConsistentWithPlan(
  db: PlanLimitsDb,
  license: TenantLicenseRow,
): Promise<boolean> {
  const planLimits = await getPlanLimits(db, license.planSlug);
  return (
    license.maxOrganizations === planLimits.maxOrganizations
    && license.maxActivations === planLimits.maxActivations
  );
}

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateLicenseKey(): string {
  const bytes = randomBytes(12);
  let raw = "";
  for (const b of bytes) {
    raw += CHARSET[b! % CHARSET.length];
  }
  return `STKX-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export type OfflineTokenPayload = {
  licenseId: string;
  licenseKey: string;
  hardwareFingerprint: string;
  tenantId: string | null;
  product: string;
  planSlug: string;
  gracePeriodDays: number;
  licenseExpiresAt: string | null;
};

function getSecretKeyBytes(): Uint8Array {
  return new TextEncoder().encode(apiConfig.licenseSigningSecret);
}

export async function signOfflineToken(
  payload: OfflineTokenPayload,
  windowDays: number,
): Promise<{ token: string; expiresAt: Date }> {
  const key = getSecretKeyBytes();
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + windowDays * 24 * 60 * 60;
  const expiresAt = new Date(expSec * 1000);
  const token = await new SignJWT({
    licenseId: payload.licenseId,
    licenseKey: payload.licenseKey,
    hardwareFingerprint: payload.hardwareFingerprint,
    tenantId: payload.tenantId,
    product: payload.product,
    planSlug: payload.planSlug,
    gracePeriodDays: payload.gracePeriodDays,
    licenseExpiresAt: payload.licenseExpiresAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(nowSec)
    .setExpirationTime(expSec)
    .sign(key);
  return { token, expiresAt };
}

export async function verifyOfflineToken(
  token: string,
): Promise<OfflineTokenPayload | null> {
  try {
    const key = getSecretKeyBytes();
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const licenseId = payload.licenseId;
    const licenseKey = payload.licenseKey;
    const hardwareFingerprint = payload.hardwareFingerprint;
    const tenantId =
      payload.tenantId === null || payload.tenantId === undefined
        ? null
        : String(payload.tenantId);
    const product = String(payload.product ?? "");
    const planSlug = String(payload.planSlug ?? "");
    const gracePeriodDays = Number(payload.gracePeriodDays ?? 0);
    const licenseExpiresAt =
      payload.licenseExpiresAt === null || payload.licenseExpiresAt === undefined
        ? null
        : String(payload.licenseExpiresAt);
    if (
      typeof licenseId !== "string"
      || typeof licenseKey !== "string"
      || typeof hardwareFingerprint !== "string"
    ) {
      return null;
    }
    return {
      licenseId,
      licenseKey,
      hardwareFingerprint,
      tenantId,
      product,
      planSlug,
      gracePeriodDays,
      licenseExpiresAt,
    };
  } catch {
    return null;
  }
}
