"use client";
"use no memo";

import * as React from "react";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  type Table as TanStackTable,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FilterX,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import {
  buildFloorTableColumns,
  resolveStatusFromMode,
  type StatusMode,
} from "@/app/(main)/dashboard/floor/_components/floor-tables-columns";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FloorTable, FloorTableStatus } from "@/lib/floor-table-types";
import { formatPosMutationError } from "@/lib/format-pos-api-error";

export type FloorTablesDataTableProps = {
  tables: FloorTable[];
  currency: string;
  canWrite: boolean;
  isMutating: boolean;
  showPosLinks: boolean;
  hostessJob: boolean;
  onEdit: (table: FloorTable) => void;
  onUpdateTable: (id: string, patch: Partial<Omit<FloorTable, "id">>) => Promise<void>;
  onDeleteTable: (id: string) => Promise<void>;
};

type ToolbarFilters = {
  search: string;
  status: "all" | FloorTableStatus;
  vip: "all" | "vip" | "standard";
  seatsMin: string;
  seatsMax: string;
  priceMin: string;
  priceMax: string;
};

const defaultFilters = (): ToolbarFilters => ({
  search: "",
  status: "all",
  vip: "all",
  seatsMin: "",
  seatsMax: "",
  priceMin: "",
  priceMax: "",
});

function parseOptionalNonNegInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Math.floor(Number(t));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseOptionalNonNegFloat(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function rowMatchesSearchQuery(row: FloorTable, q: string): boolean {
  if (!q) return true;
  const blob = [row.name, row.reservatorName ?? "", row.reservatorPhone ?? ""].join(" ").toLowerCase();
  return blob.includes(q);
}

function rowMatchesStatusFilter(row: FloorTable, status: ToolbarFilters["status"]): boolean {
  if (status === "all") return true;
  return row.status === status;
}

function rowMatchesVipFilter(row: FloorTable, vip: ToolbarFilters["vip"]): boolean {
  if (vip === "all") return true;
  if (vip === "vip") return row.reservatorIsVip;
  return !row.reservatorIsVip;
}

function rowMatchesSeatRange(row: FloorTable, seatsMin: number | null, seatsMax: number | null): boolean {
  if (seatsMin != null && row.seats < seatsMin) return false;
  if (seatsMax != null && row.seats > seatsMax) return false;
  return true;
}

function rowMatchesPriceRange(row: FloorTable, priceMin: number | null, priceMax: number | null): boolean {
  if (priceMin != null && row.pricePerPerson < priceMin) return false;
  if (priceMax != null && row.pricePerPerson > priceMax) return false;
  return true;
}

function applyFloorToolbarFilters(tables: FloorTable[], f: ToolbarFilters): FloorTable[] {
  const q = f.search.trim().toLowerCase();
  const seatsMin = parseOptionalNonNegInt(f.seatsMin);
  const seatsMax = parseOptionalNonNegInt(f.seatsMax);
  const priceMin = parseOptionalNonNegFloat(f.priceMin);
  const priceMax = parseOptionalNonNegFloat(f.priceMax);

  return tables.filter(
    (row) =>
      rowMatchesSearchQuery(row, q) &&
      rowMatchesStatusFilter(row, f.status) &&
      rowMatchesVipFilter(row, f.vip) &&
      rowMatchesSeatRange(row, seatsMin, seatsMax) &&
      rowMatchesPriceRange(row, priceMin, priceMax),
  );
}

function toolbarFiltersAreActive(filters: ToolbarFilters): boolean {
  const d = defaultFilters();
  return (
    filters.search !== d.search ||
    filters.status !== d.status ||
    filters.vip !== d.vip ||
    filters.seatsMin !== d.seatsMin ||
    filters.seatsMax !== d.seatsMax ||
    filters.priceMin !== d.priceMin ||
    filters.priceMax !== d.priceMax
  );
}

function countActiveToolbarFilters(filters: ToolbarFilters): number {
  const d = defaultFilters();
  let n = 0;
  if (filters.search !== d.search) n += 1;
  if (filters.status !== d.status) n += 1;
  if (filters.vip !== d.vip) n += 1;
  if (filters.seatsMin !== d.seatsMin) n += 1;
  if (filters.seatsMax !== d.seatsMax) n += 1;
  if (filters.priceMin !== d.priceMin) n += 1;
  if (filters.priceMax !== d.priceMax) n += 1;
  return n;
}

function FloorTablesFilterFormFields(
  props: Readonly<{
    filters: ToolbarFilters;
    setFilters: React.Dispatch<React.SetStateAction<ToolbarFilters>>;
    ccy: string;
    idPrefix: string;
  }>,
) {
  const { filters, setFilters, ccy, idPrefix } = props;
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={`${idPrefix}-search`}>Search</FieldLabel>
        <Input
          id={`${idPrefix}-search`}
          placeholder="Name, guest, phone…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          autoComplete="off"
        />
      </Field>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v as ToolbarFilters["status"] }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="occupied">Occupied</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>VIP</FieldLabel>
        <Select
          value={filters.vip}
          onValueChange={(v) => setFilters((f) => ({ ...f, vip: v as ToolbarFilters["vip"] }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tables</SelectItem>
            <SelectItem value="vip">VIP only</SelectItem>
            <SelectItem value="standard">Non-VIP</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-seats-min`}>Min seats</FieldLabel>
        <Input
          id={`${idPrefix}-seats-min`}
          inputMode="numeric"
          placeholder="Any"
          value={filters.seatsMin}
          onChange={(e) => setFilters((f) => ({ ...f, seatsMin: e.target.value }))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-seats-max`}>Max seats</FieldLabel>
        <Input
          id={`${idPrefix}-seats-max`}
          inputMode="numeric"
          placeholder="Any"
          value={filters.seatsMax}
          onChange={(e) => setFilters((f) => ({ ...f, seatsMax: e.target.value }))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-price-min`}>Min price ({ccy})</FieldLabel>
        <Input
          id={`${idPrefix}-price-min`}
          inputMode="decimal"
          placeholder="Any"
          value={filters.priceMin}
          onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-price-max`}>Max price ({ccy})</FieldLabel>
        <Input
          id={`${idPrefix}-price-max`}
          inputMode="decimal"
          placeholder="Any"
          value={filters.priceMax}
          onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
        />
      </Field>
    </div>
  );
}

function FloorTablesResultGrid(
  props: Readonly<{
    table: TanStackTable<FloorTable>;
    columnCount: number;
    hasActiveFilters: boolean;
  }>,
) {
  const { table, columnCount, hasActiveFilters } = props;
  const emptyMessage = hasActiveFilters
    ? "No tables match these filters. Try clearing or widening the criteria."
    : "No tables in this branch.";

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader className="bg-muted/50">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id} className="whitespace-nowrap">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-28 text-center text-muted-foreground text-sm">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FloorTablesPaginationBar(props: Readonly<{ table: TanStackTable<FloorTable> }>) {
  const { table } = props;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        Click a column header to sort. Use the row menu to edit or delete.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="floor-rows-per-page" className="whitespace-nowrap text-sm">
            Rows / page
          </Label>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(v) => {
              table.setPageSize(Number(v));
            }}
          >
            <SelectTrigger id="floor-rows-per-page" size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectGroup>
                {[10, 15, 25, 50].map((n) => (
                  <SelectItem key={n} value={`${n}`}>
                    {n}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="hidden size-8 sm:inline-flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="min-w-[7rem] text-center text-sm tabular-nums">
            {table.getPageCount() === 0 ? 0 : table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="hidden size-8 sm:inline-flex"
            onClick={() => table.setPageIndex(Math.max(0, table.getPageCount() - 1))}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FloorTableDeleteDialog(
  props: Readonly<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pendingDelete: FloorTable | null;
    isDeleting: boolean;
    onConfirm: () => void;
  }>,
) {
  const { open, onOpenChange, pendingDelete, isDeleting, onConfirm } = props;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this table?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDelete ? (
              <>
                <span className="font-medium text-foreground">{pendingDelete.name}</span> will be removed. If the table
                has an open check in POS, the server may block this action.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={isDeleting} className="gap-2" onClick={onConfirm}>
            {isDeleting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Branch floor tables as a sortable, filterable data grid with inline status and row actions.
 */
export function FloorTablesDataTable(props: Readonly<FloorTablesDataTableProps>) {
  const { tables, currency, canWrite, isMutating, showPosLinks, hostessJob, onEdit, onUpdateTable, onDeleteTable } =
    props;
  const [filters, setFilters] = React.useState<ToolbarFilters>(defaultFilters);
  const [filterDialogOpen, setFilterDialogOpen] = React.useState(false);
  const [filterDraft, setFilterDraft] = React.useState<ToolbarFilters>(defaultFilters);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "name", desc: false }]);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 15 });
  const [pendingDelete, setPendingDelete] = React.useState<FloorTable | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const filtered = React.useMemo(() => applyFloorToolbarFilters(tables, filters), [tables, filters]);

  const hasActiveFilters = toolbarFiltersAreActive(filters);

  const handleStatusModeChange = React.useCallback(
    async (floorTable: FloorTable, mode: StatusMode) => {
      if (hostessJob && floorTable.visibleInPos) {
        toast.message("This table appears in the POS system. Only an admin can change it.");
        return;
      }
      const next = resolveStatusFromMode(floorTable, mode);
      if (next === floorTable.status) return;
      try {
        await onUpdateTable(floorTable.id, { status: next });
        toast.success("Status updated.");
      } catch (err) {
        toast.error(formatPosMutationError(err, { forbiddenHint: "You can't change table status for this branch." }));
      }
    },
    [hostessJob, onUpdateTable],
  );

  const columns = React.useMemo<ColumnDef<FloorTable>[]>(
    () =>
      buildFloorTableColumns({
        currency,
        canWrite,
        isMutating,
        showPosLinks,
        hostessJob,
        onEdit,
        onStatusModeChange: handleStatusModeChange,
        onRequestDelete: setPendingDelete,
      }),
    [currency, canWrite, isMutating, showPosLinks, hostessJob, onEdit, handleStatusModeChange],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  React.useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [
    filters.search,
    filters.status,
    filters.vip,
    filters.seatsMin,
    filters.seatsMax,
    filters.priceMin,
    filters.priceMax,
  ]);

  const ccy = currency.trim().toUpperCase() || "USD";
  const activeFilterCount = countActiveToolbarFilters(filters);

  const openFilterDialog = () => {
    setFilterDraft(filters);
    setFilterDialogOpen(true);
  };

  const applyFilterDraft = () => {
    setFilters(filterDraft);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setFilterDialogOpen(false);
  };

  const clearFilters = React.useCallback(() => {
    setFilters(defaultFilters());
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const tableId = pendingDelete.id?.trim();
    if (!tableId) {
      toast.error("This table has no id. Refresh the page and try again.");
      return;
    }
    setIsDeleting(true);
    try {
      await onDeleteTable(tableId);
      toast.success("Table removed.");
      setPendingDelete(null);
    } catch (err) {
      toast.error(formatPosMutationError(err, { forbiddenHint: "You can't delete tables for this branch." }));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Tables</CardTitle>
              <CardDescription>
                Filter and manage seating, pricing, and reservation state. Showing{" "}
                <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
                <span className="font-medium text-foreground">{tables.length}</span> tables.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={openFilterDialog}>
                <SlidersHorizontal className="size-4" aria-hidden />
                Filters
                {activeFilterCount > 0 ? (
                  <Badge variant="secondary" className="tabular-nums">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                disabled={!hasActiveFilters}
                onClick={clearFilters}
              >
                <FilterX className="size-4" aria-hidden />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <FloorTablesResultGrid table={table} columnCount={columns.length} hasActiveFilters={hasActiveFilters} />
          <FloorTablesPaginationBar table={table} />
        </CardContent>
      </Card>

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Table filters</DialogTitle>
            <DialogDescription>
              Adjust criteria, then apply to update the grid. Cancel closes without changing the table.
            </DialogDescription>
          </DialogHeader>
          <FloorTablesFilterFormFields
            filters={filterDraft}
            setFilters={setFilterDraft}
            ccy={ccy}
            idPrefix="floor-filter-modal"
          />
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilterDraft(defaultFilters())}
              className="sm:mr-auto"
            >
              Reset fields
            </Button>
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button type="button" variant="outline" onClick={() => setFilterDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={applyFilterDraft}>
                Apply filters
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FloorTableDeleteDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        pendingDelete={pendingDelete}
        isDeleting={isDeleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
