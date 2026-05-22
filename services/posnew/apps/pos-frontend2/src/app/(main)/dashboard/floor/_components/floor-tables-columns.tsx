"use client";

import Link from "next/link";

import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deriveFloorTableStatus,
  type FloorTable,
  type FloorTableStatus,
  floorTableStatusModeForForm,
} from "@/lib/floor-table-types";
import { cn, formatCurrency } from "@/lib/utils";

export type StatusMode = "auto" | FloorTableStatus;

export type FloorTableColumnOptions = {
  currency: string;
  canWrite: boolean;
  isMutating: boolean;
  /** When false (e.g. hostess), hide POS deep links — table may still be back-office only. */
  showPosLinks: boolean;
  /** Job-title hostess cannot change tables that admins exposed to POS. */
  hostessJob: boolean;
  onEdit: (table: FloorTable) => void;
  onStatusModeChange: (table: FloorTable, mode: StatusMode) => Promise<void>;
  onRequestDelete: (table: FloorTable) => void;
};

function isHostessPosLockedTable(hostessJob: boolean, table: FloorTable): boolean {
  return hostessJob && table.visibleInPos;
}

function sortStateIcon(sorted: false | "asc" | "desc") {
  if (sorted === "desc") return <ArrowDown className="size-3.5 opacity-70" aria-hidden />;
  if (sorted === "asc") return <ArrowUp className="size-3.5 opacity-70" aria-hidden />;
  return <ArrowUpDown className="size-3.5 opacity-45" aria-hidden />;
}

function SortableHeader(props: Readonly<{ column: Column<FloorTable, unknown>; label: string }>) {
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

function statusBadgeVariant(
  status: FloorTableStatus,
): "secondary" | "outline" | "destructive" | "default" {
  if (status === "available") return "secondary";
  if (status === "reserved") return "outline";
  if (status === "occupied") return "default";
  if (status === "billed") return "outline";
  if (status === "closed") return "outline";
  return "default";
}

function statusBadgeToneClass(status: FloorTableStatus): string {
  if (status === "billed") {
    return "border-sky-400/60 bg-sky-500/15 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100";
  }
  if (status === "closed") {
    return "border-amber-500/50 bg-amber-500/15 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50";
  }
  if (status === "occupied") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-50";
  }
  return "";
}

function FloorTableStatusControl(
  props: Readonly<{
    table: FloorTable;
    canWrite: boolean;
    disabled: boolean;
    posLockedForHostess: boolean;
    onStatusModeChange: (t: FloorTable, mode: StatusMode) => Promise<void>;
  }>,
) {
  const { table, canWrite, disabled, posLockedForHostess, onStatusModeChange } = props;
  const mode = floorTableStatusModeForForm(table);

  if (!canWrite || posLockedForHostess) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Badge
          variant={statusBadgeVariant(table.status)}
          className={cn("w-fit capitalize", statusBadgeToneClass(table.status))}
        >
          {table.status}
        </Badge>
        {posLockedForHostess ? (
          <span className="text-muted-foreground text-[10px] leading-tight">On POS — admin only</span>
        ) : null}
      </div>
    );
  }

  return (
    <Select
      value={mode}
      disabled={disabled}
      onValueChange={(v) => {
        void onStatusModeChange(table, v as StatusMode);
      }}
    >
      <SelectTrigger className="h-8 w-[min(100%,220px)]" aria-label={`Status for ${table.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Automatic (guests & reservation)</SelectItem>
        <SelectItem value="available">Available</SelectItem>
        <SelectItem value="reserved">Reserved</SelectItem>
        <SelectItem value="occupied">Occupied</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Builds TanStack column definitions for the floor tables data grid (sort headers, status, actions).
 */
export function buildFloorTableColumns(opts: Readonly<FloorTableColumnOptions>): ColumnDef<FloorTable>[] {
  const ccy = opts.currency.trim().toUpperCase() || "USD";

  return [
    {
      accessorKey: "name",
      header: ({ column }) => <SortableHeader column={column} label="Table" />,
      cell: ({ row }) => (
        <div className="flex min-w-[8rem] flex-col gap-0.5">
          <span className="font-medium">{row.original.name}</span>
          <div className="flex flex-wrap items-center gap-1">
            {row.original.reservatorIsVip && row.original.reservatorName?.trim() ? (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
                VIP
              </Badge>
            ) : null}
            {opts.showPosLinks && !row.original.visibleInPos ? (
              <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                Not on POS
              </Badge>
            ) : null}
            {opts.showPosLinks && row.original.visibleInPos ? (
              <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground text-xs" asChild>
                <Link href={`/pos/t/${row.original.id}`} className="inline-flex items-center gap-1">
                  <ExternalLink className="size-3" aria-hidden />
                  POS
                </Link>
              </Button>
            ) : null}
            {opts.hostessJob && row.original.visibleInPos ? (
              <Badge variant="outline" className="border-amber-600/40 text-amber-700 text-[10px] dark:text-amber-500">
                On POS
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: ({ column }) => <SortableHeader column={column} label="Status" />,
      cell: ({ row }) => (
        <FloorTableStatusControl
          table={row.original}
          canWrite={opts.canWrite}
          disabled={opts.isMutating}
          posLockedForHostess={isHostessPosLockedTable(opts.hostessJob, row.original)}
          onStatusModeChange={opts.onStatusModeChange}
        />
      ),
    },
    {
      id: "occupancy",
      accessorFn: (row) => row.personsSeated / Math.max(1, row.seats),
      header: ({ column }) => <SortableHeader column={column} label="Seats" />,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.personsSeated} / {row.original.seats}
        </span>
      ),
    },
    {
      accessorKey: "pricePerPerson",
      header: ({ column }) => <SortableHeader column={column} label="Price / person" />,
      cell: ({ row }) => (
        <span className="tabular-nums">{formatCurrency(row.original.pricePerPerson, { currency: ccy })}</span>
      ),
    },
    {
      id: "reservation",
      accessorFn: (row) => row.reservatorName ?? "",
      header: ({ column }) => <SortableHeader column={column} label="Reservation" />,
      cell: ({ row }) => {
        const name = row.original.reservatorName?.trim();
        const phone = row.original.reservatorPhone?.trim();
        if (!name) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="max-w-[14rem] space-y-0.5">
            <p className={cn("truncate font-medium", row.original.reservatorIsVip && "text-amber-600")}>
              {row.original.reservatorIsVip ? "★ " : null}
              {name}
            </p>
            {phone ? <p className="truncate text-muted-foreground text-xs tabular-nums">{phone}</p> : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const t = row.original;
        const posLocked = isHostessPosLockedTable(opts.hostessJob, t);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${t.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled={posLocked} onClick={() => !posLocked && opts.onEdit(t)}>
                <Pencil className="size-4" />
                {posLocked ? "Edit — appears in POS (admin only)" : "Edit"}
              </DropdownMenuItem>
              {opts.showPosLinks && t.visibleInPos ? (
                <DropdownMenuItem asChild>
                  <Link href={`/pos/t/${t.id}`}>
                    <ExternalLink className="size-4" />
                    Open in POS
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {opts.canWrite ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={posLocked}
                    onClick={() => !posLocked && opts.onRequestDelete(t)}
                  >
                    <Trash2 className="size-4" />
                    {posLocked ? "Delete — POS table (admin only)" : "Delete"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableHiding: false,
    },
  ];
}

/** Resolves the API status to persist for a toolbar/mode choice (mirrors TableModal). */
export function resolveStatusFromMode(table: FloorTable, mode: StatusMode): FloorTableStatus {
  if (mode === "auto") {
    return deriveFloorTableStatus({
      personsSeated: table.personsSeated,
      reservatorName: table.reservatorName,
    });
  }
  return mode;
}
