"use client";

import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardLocationScope, locationDisplayName } from "@/hooks/use-dashboard-location-scope";
import type { LocationRow } from "@/lib/inventory-api";
import { POS_LOCATION_SCOPE_CHANGED_EVENT } from "@/lib/pos-location-scope";

/**
 * Universal branch scope control for the back office header. Keeps `X-Location-Id`
 * aligned with POS and invalidates TanStack Query caches when the operator switches branches.
 */
export function DashboardLocationHeader() {
  const queryClient = useQueryClient();
  const scope = useDashboardLocationScope({ allowAllScope: true });

  useEffect(() => {
    const onScopeChanged = () => {
      void queryClient.invalidateQueries();
    };
    globalThis.window?.addEventListener(POS_LOCATION_SCOPE_CHANGED_EVENT, onScopeChanged);
    return () => {
      globalThis.window?.removeEventListener(POS_LOCATION_SCOPE_CHANGED_EVENT, onScopeChanged);
    };
  }, [queryClient]);

  if (!scope.needsBranchPicker && scope.effectiveBranchId) {
    return null;
  }

  return (
    <div className="flex min-w-0 max-w-[min(100%,320px)] flex-col gap-1">
      <Label className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Branch</Label>
      <Select
        value={scope.selectedBranchId}
        onValueChange={(v) => {
          scope.setBranchId(v);
        }}
        disabled={scope.locationsLoading}
      >
        <SelectTrigger className="h-9" aria-label="Branch scope">
          <SelectValue placeholder={scope.locationsLoading ? "Loading…" : "Select branch"} />
        </SelectTrigger>
        <SelectContent>
          {scope.canUseAllScope ? (
            <SelectItem value="all">All branches</SelectItem>
          ) : null}
          {scope.locations.map((loc: LocationRow) => (
            <SelectItem key={loc._id} value={loc._id}>
              {locationDisplayName(loc)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
