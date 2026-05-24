"use client";

import { usePathname } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { fetchInventoryPosPolicy, INVENTORY_POS_POLICY_QUERY_KEY, type PosInventoryPolicy } from "@/lib/inventory-api";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const LOGIN_PATH = "/login";

/**
 * Subscribes to tenant POS inventory policy (strict oversell, stock deduct trigger).
 * Cached under `INVENTORY_POS_POLICY_QUERY_KEY` so Socket.IO `inventory:*` invalidations refetch.
 */
export function useInventoryPosPolicyQuery(options?: { enabled?: boolean }) {
  const pathname = usePathname();
  const user = usePosAuthStore((s) => s.user);
  const enabled = options?.enabled ?? (pathname !== LOGIN_PATH && Boolean(user));

  return useQuery({
    queryKey: INVENTORY_POS_POLICY_QUERY_KEY,
    queryFn: async (): Promise<PosInventoryPolicy | null> => {
      const res = await fetchInventoryPosPolicy();
      return res.data ?? null;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}
