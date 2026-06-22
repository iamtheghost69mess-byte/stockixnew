"use client";

import * as React from "react";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";

import { Button } from "./button";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export type DataTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage: string;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  pageIndex: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (nextPageIndex: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  sorting: SortingState;
  onSortingChange: (updater: SortingState) => void;
  stickyHeader?: boolean;
  /** When false, omits search, rows/page control, and pagination footer (compact list layout). */
  showToolbar?: boolean;
};

export function DataTable<TData>(props: Readonly<DataTableProps<TData>>) {
  const {
    columns,
    data,
    isLoading = false,
    emptyMessage,
    searchPlaceholder = "Search...",
    searchValue,
    onSearchValueChange,
    pageIndex,
    pageSize,
    totalRows,
    onPageChange,
    onPageSizeChange,
    sorting,
    onSortingChange,
    stickyHeader = false,
    showToolbar = true,
  } = props;

  const pagination = React.useMemo<PaginationState>(() => ({ pageIndex, pageSize }), [pageIndex, pageSize]);
  const pageCount = Math.max(1, Math.ceil(Math.max(0, totalRows) / Math.max(1, pageSize)));

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      const resolved = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(resolved);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount,
  });

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchValueChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span>Rows / page</span>
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className={stickyHeader ? "sticky top-0 z-10 bg-card" : ""}>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`loading-row-${index}`}>
                    <TableCell colSpan={columns.length} className="h-11 animate-pulse text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {showToolbar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {Math.min(totalRows, pageIndex * pageSize + 1)}-
            {Math.min(totalRows, pageIndex * pageSize + data.length)} of {totalRows}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => onPageChange(0)} disabled={pageIndex <= 0}>
              <ChevronsLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => onPageChange(pageIndex - 1)} disabled={pageIndex <= 0}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-sm tabular-nums">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(pageCount - 1)}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
