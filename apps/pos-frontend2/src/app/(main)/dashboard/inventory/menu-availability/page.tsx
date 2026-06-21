"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchInventoryMenuAvailability,
  fetchLocationsList,
  type MenuAvailabilityRow,
  menuInventoryAvailabilityQueryKey,
  normalizeLocationsQueryData,
} from "@/lib/inventory-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";

export default function MenuInventoryAvailabilityPage() {
  const [locationId, setLocationId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
  });

  const availabilityQuery = useQuery({
    queryKey: menuInventoryAvailabilityQueryKey(locationId),
    queryFn: async () => {
      const res = await fetchInventoryMenuAvailability({
        locationId: locationId || undefined,
      });
      const raw = res.data?.items;
      return (Array.isArray(raw) ? raw : []) as MenuAvailabilityRow[];
    },
  });

  const locations = normalizeLocationsQueryData(locationsQuery.data);
  const rows = availabilityQuery.data ?? [];
  const branchLabel = useMemo(() => {
    if (!locationId) return "All branches";
    const loc = locations.find((l) => l._id === locationId);
    return loc?.name || loc?.code || locationId;
  }, [locationId, locations]);
  const canFulfillCount = rows.filter((r) => r.canFulfill).length;
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  useEffect(() => {
    setPageIndex((currentPage) => {
      if (currentPage <= totalPages - 1) {
        return currentPage;
      }
      return Math.max(0, totalPages - 1);
    });
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const startIndex = pageIndex * pageSize;
    return rows.slice(startIndex, startIndex + pageSize);
  }, [rows, pageIndex, pageSize]);

  const rangeStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, totalRows);
  const canGoPrevious = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Menu availability</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Fulfillability by menu item at a branch (recipe BOM vs on-hand stock). Same data the POS floor uses for
          warnings. Refreshes when inventory changes.
        </p>
        <p className="mt-2 text-muted-foreground text-sm">
          <Link href="/dashboard/recipes" className="text-primary underline-offset-4 hover:underline">
            Recipes
          </Link>{" "}
          drive portions; low stock on ingredients shows here as sold-out or limited.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UtensilsCrossed className="size-5" />
              Branch
            </CardTitle>
            <CardDescription>
              {availabilityQuery.dataUpdatedAt
                ? `Last loaded ${new Date(availabilityQuery.dataUpdatedAt).toLocaleString()}`
                : "Select a branch or keep all branches."}
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-72">
            <Label className="text-muted-foreground text-xs">Location</Label>
            {locationsQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                value={locationId || "__all__"}
                onValueChange={(v) => {
                  setLocationId(v === "__all__" ? "" : v);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All branches</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name || loc.code || loc._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {availabilityQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : availabilityQuery.isError ? (
            <p className="p-6 text-destructive text-sm">
              {availabilityQuery.error instanceof Error
                ? availabilityQuery.error.message
                : "Could not load availability."}
            </p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-muted-foreground text-sm">No menu items returned for this context.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
                <Badge variant="secondary">{rows.length} items</Badge>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  {canFulfillCount} can fulfill
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <AlertTriangle className="size-3.5 text-amber-600" />
                  {rows.length - canFulfillCount} limited / out
                </Badge>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={rows.length === 0}
                    onClick={() => {
                      exportReportPdf({
                        fileName: "menu-inventory-availability.pdf",
                        title: "Menu inventory availability",
                        branchName: branchLabel,
                        dateRange: "As loaded",
                        columns: [
                          { key: "name", label: "Menu item" },
                          { key: "status", label: "Status" },
                          { key: "portions", label: "Est. portions" },
                          { key: "detail", label: "Detail" },
                        ],
                        rows: rows.map((r) => ({
                          name: r.name || r.menuItemId,
                          status: r.canFulfill ? "OK" : "Sold out",
                          portions:
                            typeof r.estimatedPortions === "number" ? String(r.estimatedPortions) : "—",
                          detail: r.reason || "—",
                        })),
                      });
                    }}
                  >
                    <Download className="size-4" />
                    PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={rows.length === 0}
                    onClick={() => {
                      exportReportExcel({
                        fileName: "menu-inventory-availability.xlsx",
                        branchName: branchLabel,
                        dateRange: "As loaded",
                        columns: [
                          { key: "menuItemId", label: "Menu item ID" },
                          { key: "name", label: "Name" },
                          { key: "canFulfill", label: "Can fulfill" },
                          { key: "estimatedPortions", label: "Est. portions" },
                          { key: "reason", label: "Detail" },
                        ],
                        rows: rows.map((r) => ({
                          menuItemId: r.menuItemId,
                          name: r.name || "",
                          canFulfill: r.canFulfill ? "Yes" : "No",
                          estimatedPortions:
                            typeof r.estimatedPortions === "number" ? r.estimatedPortions : "",
                          reason: r.reason || "",
                        })),
                      });
                    }}
                  >
                    <FileSpreadsheet className="size-4" />
                    Excel
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Menu item</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right tabular-nums">Est. portions</TableHead>
                      <TableHead className="hidden md:table-cell">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRows.map((r) => (
                      <TableRow key={r.menuItemId}>
                        <TableCell className="font-medium">
                          <Link
                            href="/dashboard/menu-items"
                            className="text-primary underline-offset-4 hover:underline"
                            title="Open menu items list"
                          >
                            {r.name || r.menuItemId}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {r.canFulfill ? (
                            <Badge className="gap-1 bg-emerald-600/90 font-normal hover:bg-emerald-600">
                              <CheckCircle2 className="size-3.5" />
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1 font-normal">
                              <AlertTriangle className="size-3.5" />
                              Sold out
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                          {typeof r.estimatedPortions === "number" ? r.estimatedPortions : "—"}
                        </TableCell>
                        <TableCell className="hidden max-w-md truncate text-muted-foreground text-sm md:table-cell">
                          {r.reason || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm">
                  Showing {rangeStart}-{rangeEnd} of {totalRows}
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
                      disabled={!canGoPrevious}
                      onClick={() => setPageIndex((currentPage) => Math.max(0, currentPage - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="sr-only">Previous page</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={!canGoNext}
                      onClick={() => setPageIndex((currentPage) => Math.min(totalPages - 1, currentPage + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                      <span className="sr-only">Next page</span>
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
