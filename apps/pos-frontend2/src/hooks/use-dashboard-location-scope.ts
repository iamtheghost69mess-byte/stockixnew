"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { formatPosMutationError } from "@/lib/format-pos-api-error";
import { fetchLocations, type LocationRow } from "@/lib/inventory-api";
import { locationLabel } from "@/lib/pos-auth-user";
import {
  getPosLocationScopeId,
  locationIdFromUserLocation,
  locationIdsFromUserLocations,
  setPosLocationScopeId,
} from "@/lib/pos-location-scope";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export function locationDisplayName(row: LocationRow): string {
  const name = row.name?.trim();
  const code = row.code?.trim();
  if (name && code) return `${name} (${code})`;
  return name || code || "Branch";
}

type DashboardLocationScopeOptions = {
  allowAllScope?: boolean;
};

/**
 * Resolves branch for `X-Location-Id` (localStorage + optional picker for admin/manager).
 * Mirrors POS floor scope behavior so dashboard table APIs hit the same scope.
 */
export function useDashboardLocationScope(options: DashboardLocationScopeOptions = {}) {
  const allowAllScope = options.allowAllScope === true;
  const user = usePosAuthStore((s) => s.user);
  const userRole = String(user?.role || "").toLowerCase();
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const canUseAllScope = (isAdmin || isManager) && allowAllScope;
  const assignedBranchId = useMemo(() => locationIdFromUserLocation(user?.location ?? null), [user?.location]);
  const assignedBranchIds = useMemo(
    () => locationIdsFromUserLocations(user?.locations ?? []).filter((id) => id !== assignedBranchId),
    [user?.locations, assignedBranchId]
  );
  const allAssignedBranchIds = useMemo(
    () => [...new Set([assignedBranchId, ...assignedBranchIds].filter(Boolean) as string[])],
    [assignedBranchId, assignedBranchIds]
  );
  const assignedBranchLabel = useMemo(() => locationLabel(user?.location ?? null), [user?.location]);
  const needsBranchPicker = canUseAllScope || allAssignedBranchIds.length !== 1;

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const effectiveBranchId = selectedBranchId;
  const scopeReady = canUseAllScope ? selectedBranchId.length > 0 : Boolean(effectiveBranchId);

  useEffect(() => {
    if (!needsBranchPicker && allAssignedBranchIds.length === 1) {
      const id = allAssignedBranchIds[0];
      setSelectedBranchId(id);
      setPosLocationScopeId(id);
    }
  }, [allAssignedBranchIds, needsBranchPicker]);

  useEffect(() => {
    if (!needsBranchPicker) return;
    let cancelled = false;
    (async () => {
      setLocationsLoading(true);
      try {
        const res = await fetchLocations();
        if (cancelled) return;
        let list = Array.isArray(res.data) ? res.data : [];
        if (!isAdmin && !isManager && allAssignedBranchIds.length > 0) {
          list = list.filter((location) => allAssignedBranchIds.includes(location._id));
        }
        setLocations(list);
        const saved = getPosLocationScopeId();
        const wantsAll = saved === "all";
        if (canUseAllScope && wantsAll) {
          setSelectedBranchId("all");
          setPosLocationScopeId("all");
        } else if (list.length === 1) {
          const id = list[0]._id;
          setSelectedBranchId(id);
          setPosLocationScopeId(id);
        } else if (saved && list.some((l) => l._id === saved)) {
          setSelectedBranchId(saved);
          setPosLocationScopeId(saved);
        } else {
          setSelectedBranchId("");
          setPosLocationScopeId(null);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(formatPosMutationError(e, { forbiddenHint: "You can't load branches for this account." }));
          setLocations([]);
        }
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allAssignedBranchIds, canUseAllScope, isAdmin, isManager, needsBranchPicker]);

  const setBranchId = useCallback((id: string) => {
    setSelectedBranchId(id);
    if (id === "all") {
      setPosLocationScopeId("all");
      return;
    }
    setPosLocationScopeId(id || null);
  }, []);

  return {
    canUseAllScope,
    needsBranchPicker,
    locations,
    locationsLoading,
    selectedBranchId,
    setBranchId,
    effectiveBranchId,
    scopeReady,
    assignedBranchLabel,
  };
}
