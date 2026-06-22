import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Input,
  Button,
} from "@repo/ui-core";

export interface MetaTableColumn<TRow = any> {
  key: string;
  label: string;
  width?: string;
  renderCell?: (value: any, row: TRow) => React.ReactNode;
}

export interface MetaTableProps<TRow = any> {
  columns: MetaTableColumn<TRow>[];
  data: TRow[];
  /** Show animated skeleton rows while data is loading. */
  isLoading?: boolean;
  /** Number of skeleton rows to display when isLoading is true. @default 5 */
  skeletonRows?: number;
  /** Message shown when data is empty and not loading. @default "No data available." */
  emptyMessage?: string;
  /** 1-based current page number. */
  page?: number;
  /** Total number of pages. */
  totalPages?: number;
  /** Called when the user clicks Previous or Next. */
  onPageChange?: (page: number) => void;
  /** Controlled search input value. */
  searchValue?: string;
  /** Placeholder text for the search input. */
  searchPlaceholder?: string;
  /** Called when the user types in the search input. */
  onSearchChange?: (value: string) => void;
  /** Arbitrary content rendered above the table (filters, create button, etc.). */
  toolbar?: React.ReactNode;
  /** Called when the user clicks a row. */
  onRowClick?: (row: TRow) => void;
}

const SKELETON_ROWS_DEFAULT = 5;

export function MetaTable<TRow = any>({
  columns,
  data,
  isLoading = false,
  skeletonRows = SKELETON_ROWS_DEFAULT,
  emptyMessage = "No data available.",
  page,
  totalPages,
  onPageChange,
  searchValue,
  searchPlaceholder = "Search…",
  onSearchChange,
  toolbar,
  onRowClick,
}: MetaTableProps<TRow>) {
  const hasPagination = page !== undefined && totalPages !== undefined && onPageChange !== undefined;
  const hasSearch = onSearchChange !== undefined;

  return (
    <div className="space-y-3">
      {/* Toolbar row — search + custom slot */}
      {(hasSearch || toolbar) ? (
        <div className="flex flex-wrap items-center gap-3">
          {hasSearch ? (
            <Input
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange!(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full sm:max-w-xs"
            />
          ) : null}
          {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} style={col.width ? { width: col.width } : undefined}>
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: skeletonRows }, (_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full max-w-[180px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row: any, i) => (
                <TableRow
                  key={row.id ?? i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? "cursor-pointer" : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      {col.renderCell ? col.renderCell(row[col.key], row) : row[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {hasPagination ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page <span className="font-medium text-foreground">{page}</span> of{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page! <= 1 || isLoading}
              onClick={() => onPageChange!(page! - 1)}
            >
              ← Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page! >= totalPages! || isLoading}
              onClick={() => onPageChange!(page! + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
