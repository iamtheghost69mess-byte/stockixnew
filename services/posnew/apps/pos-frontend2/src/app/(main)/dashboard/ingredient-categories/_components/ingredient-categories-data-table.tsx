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
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, FilterX, Loader2 } from "lucide-react";

import { buildIngredientCategoryColumns } from "@/app/(main)/dashboard/ingredient-categories/_components/ingredient-categories-columns";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { IngredientCategoryRow } from "@/lib/ingredient-categories-api";

export type IngredientCategoriesDataTableProps = {
  rows: IngredientCategoryRow[];
  isLoading: boolean;
  onEdit: (row: IngredientCategoryRow) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
};

function buildIdToNameMap(rows: IngredientCategoryRow[]): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    m.set(r._id, r.name);
  }
  return m;
}

function getParentDisplayLabel(row: IngredientCategoryRow, idToName: ReadonlyMap<string, string>): string {
  const p = row.parentCategory;
  if (!p) return "—";
  if (typeof p === "object") {
    return p.name?.trim() || "—";
  }
  const id = p;
  return idToName.get(id) ?? (id.length > 10 ? `${id.slice(0, 8)}…` : id);
}

function rowMatchesLocalFilter(row: IngredientCategoryRow, q: string, parentLabel: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const blob = [row.name, row.taxCode ?? "", row.description ?? "", parentLabel].join(" ").toLowerCase();
  return blob.includes(t);
}

function IngredientCategoriesPaginationBar(props: Readonly<{ table: TanStackTable<IngredientCategoryRow> }>) {
  const { table } = props;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        Sort by column headers. Use Edit or Delete on each row. Server search above filters the loaded list from the
        API; the field below narrows rows in the table only.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="ingredient-cat-rows-per-page" className="whitespace-nowrap text-sm">
            Rows / page
          </Label>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(v) => {
              table.setPageSize(Number(v));
            }}
          >
            <SelectTrigger id="ingredient-cat-rows-per-page" size="sm" className="w-18">
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
          <span className="min-w-28 text-center text-sm tabular-nums">
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

function IngredientCategoriesResultGrid(
  props: Readonly<{
    table: TanStackTable<IngredientCategoryRow>;
    columnCount: number;
    hasActiveLocalFilter: boolean;
  }>,
) {
  const { table, columnCount, hasActiveLocalFilter } = props;
  const emptyMessage = hasActiveLocalFilter
    ? "No categories match this filter. Clear the table filter or widen your search."
    : "No categories defined.";

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

function DeleteCategoryDialog(
  props: Readonly<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pending: IngredientCategoryRow | null;
    isDeleting: boolean;
    onConfirm: () => void;
  }>,
) {
  const { open, onOpenChange, pending, isDeleting, onConfirm } = props;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this category?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending ? (
              <>
                <span className="font-medium text-foreground">{pending.name}</span> will be removed. Subcategories or
                ingredients may need to be reassigned first if the server rejects the delete.
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
 * Sortable, paginated ingredient category grid (shadcn Table + TanStack Table).
 */
export function IngredientCategoriesDataTable(props: Readonly<IngredientCategoriesDataTableProps>) {
  const { rows, isLoading, onEdit, onDelete, isDeleting } = props;
  const [localFilter, setLocalFilter] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "sortOrder", desc: false }]);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 15 });
  const [pendingDelete, setPendingDelete] = React.useState<IngredientCategoryRow | null>(null);

  const idToName = React.useMemo(() => buildIdToNameMap(rows), [rows]);

  const getParentLabel = React.useCallback(
    (row: IngredientCategoryRow) => getParentDisplayLabel(row, idToName),
    [idToName],
  );

  const filtered = React.useMemo(() => {
    return rows.filter((row) => rowMatchesLocalFilter(row, localFilter, getParentLabel(row)));
  }, [rows, localFilter, getParentLabel]);

  const hasActiveLocalFilter = localFilter.trim().length > 0;

  const columns = React.useMemo<ColumnDef<IngredientCategoryRow>[]>(
    () =>
      buildIngredientCategoryColumns({
        getParentLabel,
        onEdit,
        onRequestDelete: setPendingDelete,
      }),
    [getParentLabel, onEdit],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const columnCount = table.getAllColumns().filter((c) => c.getIsVisible()).length;

  const clearLocalFilter = React.useCallback(() => {
    setLocalFilter("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, []);

  const confirmDelete = React.useCallback(async () => {
    if (!pendingDelete) return;
    const id = pendingDelete._id;
    try {
      await onDelete(id);
      setPendingDelete(null);
    } catch {
      /* Parent surfaces mutation errors (e.g. toast). */
    }
  }, [pendingDelete, onDelete]);

  return (
    <>
      <Card className="overflow-hidden font-outfit">
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Hierarchical categories with tax codes and sort order. Edit or delete from each row.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Field className="min-w-[min(100%,20rem)] flex-1">
              <FieldLabel htmlFor="ingredient-cat-local-filter">Filter in table</FieldLabel>
              <Input
                id="ingredient-cat-local-filter"
                placeholder="Name, parent, tax code, description…"
                value={localFilter}
                onChange={(e) => {
                  setLocalFilter(e.target.value);
                  setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
                }}
                disabled={isLoading}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-2 self-start sm:self-auto"
              disabled={!hasActiveLocalFilter}
              onClick={clearLocalFilter}
            >
              <FilterX className="size-4" aria-hidden />
              Clear filter
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2 rounded-md border p-4">
              {(
                [
                  "ingredient-cat-skel-a",
                  "ingredient-cat-skel-b",
                  "ingredient-cat-skel-c",
                  "ingredient-cat-skel-d",
                  "ingredient-cat-skel-e",
                  "ingredient-cat-skel-f",
                ] as const
              ).map((key) => (
                <Skeleton key={key} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <IngredientCategoriesResultGrid
                table={table}
                columnCount={columnCount}
                hasActiveLocalFilter={hasActiveLocalFilter}
              />
              <IngredientCategoriesPaginationBar table={table} />
            </>
          )}
        </CardContent>
      </Card>

      <DeleteCategoryDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        pending={pendingDelete}
        isDeleting={isDeleting}
        onConfirm={confirmDelete}
      />
    </>
  );
}
