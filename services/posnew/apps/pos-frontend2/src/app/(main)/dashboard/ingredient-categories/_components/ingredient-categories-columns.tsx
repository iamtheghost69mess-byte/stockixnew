"use client";

import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { IngredientCategoryRow } from "@/lib/ingredient-categories-api";

export type IngredientCategoryColumnOptions = {
  getParentLabel: (row: IngredientCategoryRow) => string;
  onEdit: (row: IngredientCategoryRow) => void;
  onRequestDelete: (row: IngredientCategoryRow) => void;
};

function sortStateIcon(sorted: false | "asc" | "desc") {
  if (sorted === "desc") return <ArrowDown className="size-3.5 opacity-70" aria-hidden />;
  if (sorted === "asc") return <ArrowUp className="size-3.5 opacity-70" aria-hidden />;
  return <ArrowUpDown className="size-3.5 opacity-45" aria-hidden />;
}

function SortableHeader(props: Readonly<{ column: Column<IngredientCategoryRow, unknown>; label: string }>) {
  const { column, label } = props;
  const sorted = column.getIsSorted();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 gap-1 px-2 font-medium"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sortStateIcon(sorted)}
    </Button>
  );
}

/**
 * TanStack column definitions for the ingredient categories data grid.
 */
export function buildIngredientCategoryColumns(
  opts: Readonly<IngredientCategoryColumnOptions>,
): ColumnDef<IngredientCategoryRow>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <SortableHeader column={column} label="Category" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "parent",
      accessorFn: (row) => opts.getParentLabel(row),
      header: ({ column }) => <SortableHeader column={column} label="Parent" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{opts.getParentLabel(row.original)}</span>
      ),
    },
    {
      accessorKey: "taxCode",
      header: ({ column }) => <SortableHeader column={column} label="Tax code" />,
      cell: ({ row }) => {
        const v = row.original.taxCode?.trim();
        return v ? (
          <span className="font-mono text-sm">{v}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "sortOrder",
      header: ({ column }) => <SortableHeader column={column} label="Sort" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm tabular-nums">{row.original.sortOrder ?? 0}</span>
      ),
    },
    {
      id: "description",
      accessorFn: (row) => row.description ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Description" />,
      cell: ({ row }) => {
        const d = row.original.description?.trim();
        if (!d) {
          return <span className="text-muted-foreground">—</span>;
        }
        const truncated = d.length > 80 ? `${d.slice(0, 77)}…` : d;
        return (
          <span className="block max-w-[20rem] truncate text-muted-foreground text-sm" title={d}>
            {truncated}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => (
        <div className="flex w-full justify-end">
          <span className="font-medium">Actions</span>
        </div>
      ),
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const name = r.name.trim() || "category";
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 font-medium shadow-none"
              aria-label={`Edit ${name}`}
              onClick={() => opts.onEdit(r)}
            >
              <Pencil className="size-3.5 shrink-0 opacity-80" aria-hidden />
              
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-destructive/30 px-2.5 font-medium text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${name}`}
              onClick={() => opts.onRequestDelete(r)}
            >
              <Trash2 className="size-3.5 shrink-0 opacity-80" aria-hidden />
              
            </Button>
          </div>
        );
      },
      enableHiding: false,
    },
  ];
}
