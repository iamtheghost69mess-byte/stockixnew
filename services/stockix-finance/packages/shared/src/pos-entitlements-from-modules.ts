export type PosModuleEntitlements = {
  inventory: boolean;
  accounting: boolean;
};

export type PosEntitlementsFromPlan = {
  maxUsers: number;
  maxLocations: number;
  maxOrdersPerMonth: number;
  modules: PosModuleEntitlements;
};

const DEFAULT_PLAN_LIMITS = {
  maxUsers: 25,
  maxLocations: 5,
  maxOrdersPerMonth: 10_000,
};

/**
 * Maps Stockix tenant module list to POS organization entitlements.
 * POS-only tenants get inventory without accounting; bundles include both.
 */
export function posModuleEntitlementsFromStockixModules(
  modules: string[] | null | undefined,
): PosModuleEntitlements {
  const normalized = (modules ?? [])
    .map((m) => String(m).trim().toLowerCase())
    .filter(Boolean);
  const hasAccounting = normalized.includes("accounting");
  const hasPos = normalized.includes("pos");
  if (hasPos && !hasAccounting) {
    return { inventory: true, accounting: false };
  }
  return { inventory: true, accounting: true };
}

export function buildPosEntitlementsForProvision(input: {
  modules: string[] | null | undefined;
  maxUsers?: number | null;
  maxLocations?: number | null;
  maxOrdersPerMonth?: number | null;
}): PosEntitlementsFromPlan {
  return {
    maxUsers: input.maxUsers ?? DEFAULT_PLAN_LIMITS.maxUsers,
    maxLocations: input.maxLocations ?? DEFAULT_PLAN_LIMITS.maxLocations,
    maxOrdersPerMonth:
      input.maxOrdersPerMonth ?? DEFAULT_PLAN_LIMITS.maxOrdersPerMonth,
    modules: posModuleEntitlementsFromStockixModules(input.modules),
  };
}
