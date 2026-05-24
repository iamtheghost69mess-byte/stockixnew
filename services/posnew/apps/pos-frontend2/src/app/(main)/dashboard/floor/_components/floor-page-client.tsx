"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Loader2, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { FloorTablesDataTable } from "@/app/(main)/dashboard/floor/_components/floor-tables-data-table";
import { TableModal } from "@/app/(main)/dashboard/floor/_components/table-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { locationDisplayName } from "@/hooks/use-dashboard-location-scope";
import { useFloor } from "@/hooks/use-floor";
import type { FloorTable } from "@/lib/floor-table-types";
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import { posFetchAccountingConfig } from "@/lib/pos-accounting-api";
import { isHostessJobTitle } from "@/lib/pos-staff-role";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function FloorTableSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-[280px] w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

export function FloorPageClient() {
  const {
    tables,
    addTable,
    updateTable,
    deleteTable,
    isLoading,
    isError,
    error,
    refetch,
    scopeReady,
    needsBranchPicker,
    locations,
    locationsLoading,
    selectedBranchId,
    setBranchId,
    assignedBranchLabel,
    isMutating,
    canRead,
    canWrite,
  } = useFloor();
  const user = usePosAuthStore((s) => s.user);
  const hostessJob = isHostessJobTitle(user);
  const showPosLinks = !hostessJob;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FloorTable | null>(null);

  const { data: accConfig } = useQuery({
    queryKey: ["accounting-config", "floor-display-currency"],
    queryFn: async () => {
      try {
        return await posFetchAccountingConfig();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: canRead,
  });

  const displayCurrency = useMemo(() => {
    const raw = accConfig?.companyCurrency;
    if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
    return "USD";
  }, [accConfig?.companyCurrency]);

  const openCreate = () => {
    if (!canWrite) return;
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (table: FloorTable) => {
    if (!canWrite) return;
    if (hostessJob && table.visibleInPos) {
      toast.message("This table appears in the POS system. Only an admin can edit it.");
      return;
    }
    setEditing(table);
    setModalOpen(true);
  };

  const errMsg = error
    ? formatPosMutationError(error, {
        forbiddenHint: "You don't have permission to list tables (pos.table.read).",
      })
    : "Could not load tables.";
  const looksLikePermissionDenied = /403|permission|do not have/i.test(errMsg);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Floor</h1>
          <p className="max-w-2xl text-muted-foreground text-sm sm:text-base">
            Back-office tables and reservations. Live service and checks stay in{" "}
            <Link href="/pos" className="font-medium text-primary underline-offset-4 hover:underline">
              Open POS
            </Link>
            .
          </p>
        </div>
        <Alert>
          <ShieldAlert />
          <AlertTitle>View access required</AlertTitle>
          <AlertDescription>
            Your role does not include <span className="font-mono text-xs">pos.table.read</span>. Ask an admin to update
            RBAC if you should manage branch tables.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Floor</h1>
          <p className="max-w-2xl text-muted-foreground text-sm sm:text-base">
            Back-office tables and reservations. For live ordering and checks, use{" "}
            <Link href="/pos" className="font-medium text-primary underline-offset-4 hover:underline">
              Open POS
            </Link>
            .
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="shrink-0 gap-2 self-start sm:self-center"
          disabled={!scopeReady || isMutating || !canWrite}
        >
          <Plus className="size-4" />
          Add Table
        </Button>
      </div>

      {!canWrite ? (
        <Alert>
          <ShieldAlert />
          <AlertTitle>View only</AlertTitle>
          <AlertDescription>
            You can review tables but not edit them without <span className="font-mono text-xs">pos.table.write</span>.
          </AlertDescription>
        </Alert>
      ) : null}

      {needsBranchPicker ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Field className="max-w-md">
              <FieldLabel htmlFor="dash-floor-branch">Branch</FieldLabel>
              <p className="text-muted-foreground text-xs">
                Tables are scoped by branch. Choose one so requests send{" "}
                <span className="font-mono text-[11px]">X-Location-Id</span> like the POS floor.
              </p>
              {locationsLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading branches…
                </p>
              ) : locations.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No branches found.{" "}
                  <Link
                    href="/dashboard/locations"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Add a location
                  </Link>{" "}
                  then refresh.
                </p>
              ) : (
                <Select value={selectedBranchId || undefined} onValueChange={setBranchId}>
                  <SelectTrigger id="dash-floor-branch" className="w-full max-w-md">
                    <SelectValue placeholder="Select branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {locationDisplayName(loc)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </CardContent>
        </Card>
      ) : assignedBranchLabel ? (
        <p className="text-muted-foreground text-sm">
          Branch: <span className="font-medium text-foreground">{assignedBranchLabel}</span>
        </p>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load tables</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{errMsg}</p>
            {looksLikePermissionDenied ? (
              <p className="text-sm">
                If this is unexpected, confirm your account has{" "}
                <span className="font-mono text-xs">pos.table.read</span>.
              </p>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!scopeReady ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {needsBranchPicker ? "Select a branch above to load tables." : "Could not resolve branch scope."}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <FloorTableSkeleton />
      ) : tables.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyMedia variant="icon">
            <LayoutGrid />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No tables yet</EmptyTitle>
            <EmptyDescription>
              {canWrite ? "Add a table to configure this branch." : "No tables for this branch."}
            </EmptyDescription>
          </EmptyHeader>
          {canWrite ? (
            <Button onClick={openCreate} variant="secondary" size="sm" disabled={isMutating}>
              Add Table
            </Button>
          ) : null}
        </Empty>
      ) : (
        <FloorTablesDataTable
          tables={tables}
          currency={displayCurrency}
          canWrite={canWrite}
          isMutating={isMutating}
          showPosLinks={showPosLinks}
          hostessJob={hostessJob}
          onEdit={openEdit}
          onUpdateTable={async (id, patch) => {
            await updateTable(id, patch);
          }}
          onDeleteTable={async (id) => {
            await deleteTable(id);
          }}
        />
      )}

      {canWrite ? (
        <TableModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          editing={editing}
          existingTables={tables}
          currency={displayCurrency}
          onSave={async (payload) => {
            const row = payload as Omit<FloorTable, "id"> & { id?: string };
            const { id, ...rest } = row;
            if (id) {
              await updateTable(id, rest);
              return;
            }
            await addTable(rest);
          }}
          onDelete={deleteTable}
        />
      ) : null}
    </div>
  );
}
