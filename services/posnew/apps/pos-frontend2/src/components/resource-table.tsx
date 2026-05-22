"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { cn } from "@restaurant-pos/ui";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ResourceField } from "@/lib/mdd/resource-config";

interface ResourceTableProps {
  columns: ResourceField[];
  data: any[];
  isLoading?: boolean;
  /** Row shown when `data` is empty and not loading (default: generic tenant copy). */
  emptyMessage?: string;
  /**
   * Callback for interactive fields (e.g. toggling a switch).
   * Passes the row data, the actionId defined in metadata, and the new value.
   */
  onAction?: (row: any, actionId: string, value: any) => void;
}

function getColumnAlignClass(align: ResourceField["align"]): string {
  if (align === "end") return "text-right";
  if (align === "center") return "text-center";
  return "";
}

/**
 * Professional Generic Table Renderer for Tenant UI.
 * Supports interactive fields (Switches) and metadata-driven styling.
 */
export function ResourceTable({
  columns,
  data,
  isLoading,
  onAction,
  emptyMessage = "No tenant records found.",
}: ResourceTableProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalRows = data.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  useEffect(() => {
    setPageIndex((currentPage) => {
      if (currentPage <= totalPages - 1) {
        return currentPage;
      }
      return Math.max(0, totalPages - 1);
    });
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    const startIndex = pageIndex * pageSize;
    return data.slice(startIndex, startIndex + pageSize);
  }, [data, pageIndex, pageSize]);

  const pageStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const pageEnd = Math.min((pageIndex + 1) * pageSize, totalRows);
  const canGoPrevious = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;

  const getNestedValue = (obj: any, path: string) => {
    return path.split(".").reduce((acc, part) => acc && acc[part], obj);
  };

  const renderCell = (row: any, field: ResourceField) => {
    const val = getNestedValue(row, field.key);

    switch (field.type) {
      case "link":
        return (
          <Link href={field.href ? field.href(row) : "#"} className="text-primary hover:underline font-medium">
            {val || "---"}
          </Link>
        );
      case "badge":
        return (
          <Badge
            variant={field.variant ? field.variant(val) : "default"}
            className={cn("capitalize", field.variant?.(val) === "destructive" && "animate-pulse")}
          >
            {val || "---"}
          </Badge>
        );
      case "date":
        return val ? format(new Date(val), "PPP") : "---";
      case "money":
        return typeof val === "number" ? `$${val.toFixed(2)}` : "---";
      case "switch":
        return (
          <div className="flex items-center">
            <Switch
              checked={Boolean(val)}
              onCheckedChange={(checked) => onAction?.(row, field.actionId || field.key, checked)}
              disabled={field.disabled?.(row)}
              className={cn(field.variant?.(val) === "destructive" && "data-[state=checked]:bg-destructive")}
            />
          </div>
        );
      case "progress":
        return (
          <div className="flex flex-col gap-1 w-24">
            <Progress value={typeof val === "number" ? val : 0} className="h-1.5" />
            <span className="text-[10px] text-muted-foreground font-mono">{val}%</span>
          </div>
        );
      case "image":
        return val ? (
          <img src={val} alt="Item" className="h-10 w-10 rounded-md border object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
            <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
          </div>
        );
      case "custom":
        return field.render ? field.render(row, onAction) : "---";
      default:
        return val ?? "---";
    }
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn("text-xs font-semibold uppercase tracking-wider", getColumnAlignClass(col.align))}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-muted-foreground text-sm font-medium">Synchronizing resource state...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : totalRows === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground text-sm italic">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            paginatedRows.map((row, idx) => (
              <TableRow key={row._id || idx} className="hover:bg-muted/30 transition-colors">
                {columns.map((col) => (
                  <TableCell key={col.key} className={cn("py-4", getColumnAlignClass(col.align))}>
                    {renderCell(row, col)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Showing {pageStart}-{pageEnd} of {totalRows}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm">
            Page {totalRows === 0 ? 0 : pageIndex + 1} of {totalRows === 0 ? 0 : totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPageIndex((currentPage) => Math.max(0, currentPage - 1))}
              disabled={!canGoPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPageIndex((currentPage) => Math.min(totalPages - 1, currentPage + 1))}
              disabled={!canGoNext}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
