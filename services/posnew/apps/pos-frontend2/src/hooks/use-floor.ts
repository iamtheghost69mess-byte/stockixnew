"use client";

import { useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDashboardLocationScope } from "@/hooks/use-dashboard-location-scope";
import type { FloorTable } from "@/lib/floor-table-types";
import { posApiJson } from "@/lib/pos-api-fetch";
import { getPosLocationScopeId } from "@/lib/pos-location-scope";
import { posCan } from "@/lib/pos-permissions";
import { posQueryKeys } from "@/lib/pos-query-keys";
import { floorTableToCreateBody, floorTableToUpdateBody, posTableRowToFloor } from "@/lib/pos-table-floor-map";
import { posCreateTable, posDeleteTable, posFetchTables, posUpdateTable } from "@/lib/pos-tables-api";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export const posTablesQueryKey = (locationId: string | null) => posQueryKeys.tables(locationId);

function denyWrite(): Promise<never> {
  return Promise.reject(new Error("You do not have permission to change tables (pos.table.write)."));
}

async function updateTableSafe(id: string, body: Record<string, unknown>) {
  if (typeof posUpdateTable === "function") {
    return posUpdateTable(id, body);
  }
  // Fallback for rare dev/HMR binding glitches where named export resolves non-function.
  const res = await posApiJson(`/api/table/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Could not update table.");
  return res.data;
}

export function useFloor() {
  const queryClient = useQueryClient();
  const scope = useDashboardLocationScope();
  const { scopeReady, effectiveBranchId } = scope;
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = useMemo(() => posCan(permissions, "pos.table.read"), [permissions]);
  const canWrite = useMemo(() => posCan(permissions, "pos.table.write"), [permissions]);

  const listQuery = useQuery({
    queryKey: posTablesQueryKey(effectiveBranchId ?? null),
    queryFn: async () => {
      const rows = await posFetchTables();
      return rows.map(posTableRowToFloor);
    },
    enabled: scopeReady && canRead,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: posTablesQueryKey(getPosLocationScopeId()) });
  };

  const createMutation = useMutation({
    mutationFn: (row: Omit<FloorTable, "id">) => posCreateTable(floorTableToCreateBody(row)),
    onSuccess: () => {
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, row }: { id: string; row: Omit<FloorTable, "id"> }) =>
      updateTableSafe(id, floorTableToUpdateBody(row)),
    onSuccess: () => {
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => posDeleteTable(id),
    onSuccess: () => {
      invalidate();
    },
  });

  const addTable = (row: Omit<FloorTable, "id">) => {
    if (!canWrite) return denyWrite();
    return createMutation.mutateAsync(row);
  };

  const updateTable = (id: string, patch: Partial<Omit<FloorTable, "id">>) => {
    if (!canWrite) return denyWrite();
    const current = listQuery.data?.find((t) => t.id === id);
    if (!current) {
      return Promise.reject(new Error("Table not found in the current list."));
    }
    const { id: _id, ...base } = current;
    const merged: Omit<FloorTable, "id"> = { ...base, ...patch };
    return updateMutation.mutateAsync({ id, row: merged });
  };

  const deleteTable = (id: string) => {
    if (!canWrite) return denyWrite();
    return deleteMutation.mutateAsync(id);
  };

  const resetLayout = async () => {
    if (!canWrite) return denyWrite();
    const list = listQuery.data ?? [];
    await Promise.all(
      list.map((table) =>
        updateMutation.mutateAsync({
          id: table.id,
          row: {
            ...table,
            floorAnchorX: null,
            floorAnchorY: null,
          },
        }),
      ),
    );
  };

  return {
    ...scope,
    canRead,
    canWrite,
    tables: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    error: listQuery.error,
    refetch: listQuery.refetch,
    addTable,
    updateTable,
    deleteTable,
    resetLayout,
    isMutating: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
