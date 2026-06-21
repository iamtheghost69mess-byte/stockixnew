"use client";

import { useInventoryPosPolicyQuery } from "@/hooks/use-inventory-pos-policy";

/**
 * Keeps POS inventory policy warm in React Query for authenticated routes.
 * Renders nothing; pairs with `PosRealtimeBridge` invalidation of `inventory-pos-policy`.
 */
export function PosInventoryPolicyPrefetch() {
  useInventoryPosPolicyQuery();
  return null;
}
