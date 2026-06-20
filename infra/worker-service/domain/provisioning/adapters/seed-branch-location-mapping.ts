import { branchLocationMappings, tenantDeployments, organizations } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { posConfig, apiConfig } from "@repo/config";

type Db = PostgresJsDatabase<typeof schema>;

export type SeedBranchLocationInput = {
  db: Db;
  tenantId: string;
  posOrganizationId: string;
  posHostPort: number;
  financeBaseUrl: string;
  log: (message: string) => void;
  posBaseUrl?: string;
};

function posApiBase(hostPort: number, override?: string): string {
  const fromEnv = override ?? posConfig.platformBaseUrl;
  if (fromEnv && !fromEnv.includes("localhost:8010")) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${hostPort}`;
}

function posApiKey(): string {
  const key = posConfig.platformApiKey?.trim();
  if (!key || key.length < 10) throw new Error("POS_PLATFORM_API_KEY required");
  return key;
}

async function getFinanceDefaultBranch(
  financeBaseUrl: string,
  tenantId: string,
): Promise<{ id: number; name: string } | null> {
  const secret = apiConfig.internalApiSecret?.trim();
  if (!secret) throw new Error("INTERNAL_API_SECRET required");

  const res = await fetch(`${financeBaseUrl}/api/branches`, {
    headers: {
      "x-stockix-internal-secret": secret,
      "x-stockix-tenant-id": tenantId,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { branches?: Array<{ id: number; name: string }> } | Array<{ id: number; name: string }>;
  const list = Array.isArray(data) ? data : (data.branches ?? []);
  const first = list[0];
  return first ? { id: first.id, name: first.name } : null;
}

async function getPosDefaultLocation(
  posBase: string,
  posOrgId: string,
): Promise<{ id: string; name: string } | null> {
  const apiKey = posApiKey();

  const res = await fetch(`${posBase}/api/platform/v1/organizations/${posOrgId}`, {
    headers: { "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    data?: { defaultLocationId?: string; defaultLocationName?: string };
  };
  const locId = data.data?.defaultLocationId;
  const locName = data.data?.defaultLocationName ?? "Main Location";
  return locId ? { id: locId, name: locName } : null;
}

/**
 * After Finance + POS are wired, seed the primary branch→location mapping
 * and store the Finance branch ID in tenant_deployments for sync workers.
 */
export async function seedBranchLocationMapping(
  input: SeedBranchLocationInput,
): Promise<{ seeded: boolean; financeBranchId?: number }> {
  const { db, tenantId, posOrganizationId, posHostPort, financeBaseUrl, log, posBaseUrl } = input;
  const base = posApiBase(posHostPort, posBaseUrl);

  // Resolve the primary control-plane organization for this tenant
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.tenantId, tenantId))
    .limit(1);
  const organizationId = org?.id;
  if (!organizationId) {
    log("[provision][branch-map] no control-plane organization found — skipping mapping");
    return { seeded: false };
  }

  const [branch, location] = await Promise.all([
    getFinanceDefaultBranch(financeBaseUrl, tenantId).catch(() => null),
    getPosDefaultLocation(base, posOrganizationId).catch(() => null),
  ]);

  if (!branch) {
    log("[provision][branch-map] Finance branch not found — skipping mapping");
    return { seeded: false };
  }
  if (!location) {
    log("[provision][branch-map] POS default location not found — skipping mapping");
    return { seeded: false };
  }

  await db
    .insert(branchLocationMappings)
    .values({
      tenantId,
      organizationId,
      financeBranchId: branch.id,
      posLocationId: location.id,
      financeBranchName: branch.name,
      posLocationName: location.name,
      isPrimary: true,
    })
    .onConflictDoNothing();

  await db
    .update(tenantDeployments)
    .set({ financeDefaultBranchId: branch.id, updatedAt: new Date() })
    .where(eq(tenantDeployments.tenantId, tenantId));

  log(`[provision][branch-map] mapped branch=${branch.id}(${branch.name}) → location=${location.id}(${location.name})`);
  return { seeded: true, financeBranchId: branch.id };
}
