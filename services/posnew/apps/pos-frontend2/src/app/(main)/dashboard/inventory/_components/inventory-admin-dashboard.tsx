"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  Package,
  Plus,
  ShoppingCart,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInventoryPosPolicyQuery } from "@/hooks/use-inventory-pos-policy";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";
import {
  adjustInventoryWithOfflineSupport,
  fetchAllInventoryMovements,
  fetchIngredients,
  fetchInventoryBalances,
  fetchInventoryLowStock,
  fetchInventoryMovements,
  fetchInventoryReport,
  fetchLocations,
  INVENTORY_REPORT_QUERY_KEY,
  type IngredientLean,
  type IngredientRecord,
  invalidateInventoryHubQueries,
  inventoryBalancesQueryKey,
  inventoryLowStockQueryKey,
  inventoryMovementsQueryKey,
  type LocationRow,
  patchInventoryBalancePlanning,
  type StockBalanceRow,
  type StockMovementRow,
  transferInventory,
} from "@/lib/inventory-api";

import { InventoryAdminToolsCard } from "./inventory-admin-tools-card";

type TabKey = "overview" | "balances" | "movements" | "low-stock";
type AdjustReason = "manual_adjust" | "waste" | "receive" | "correction";
type AdjustFormState = {
  ingredientId: string;
  quantityDelta: number;
  reason: AdjustReason;
  note: string;
  locationId: string;
};

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadMovementsCsv(rows: StockMovementRow[], filename: string) {
  const headers = ["When (ISO)", "Ingredient", "Reason", "Delta", "Location", "User"];
  const lines = [headers.join(",")];
  for (const m of rows) {
    const when = m.createdAt ? new Date(m.createdAt).toISOString() : "";
    const ing = m.ingredient?.name ?? "";
    const loc = m.location?.name ?? m.location?.code ?? "";
    const user = m.user?.name ?? "";
    lines.push(
      [
        escapeCsvCell(when),
        escapeCsvCell(ing),
        escapeCsvCell(String(m.reason ?? "")),
        escapeCsvCell(String(m.delta ?? "")),
        escapeCsvCell(loc),
        escapeCsvCell(user),
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function suggestedPoQuantity(ing: IngredientLean): number {
  const stock = Number(ing.currentStock ?? 0);
  const th = Number(ing.reorderThreshold ?? 0);
  const gap = th - stock;
  if (gap > 0) return Math.max(0.01, Math.round((gap + Number.EPSILON) * 100) / 100);
  return 1;
}

function stockDeductTriggerLabel(_t: string | undefined) {
  return "Payment (on paid orders)";
}

function InventoryPosPolicyOverviewCard() {
  const { data: policy, isLoading, isError } = useInventoryPosPolicyQuery();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">POS inventory behaviour</CardTitle>
       
      </CardHeader>
      <CardContent className="text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Loading policy…</p>
        ) : isError || !policy ? (
          <p className="text-muted-foreground">
            Could not load policy. Ensure you are signed in with inventory access.
          </p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>
              <span className="text-foreground">Strict oversell:</span>{" "}
              {policy.strictOversell ? "On (lines blocked when stock insufficient)" : "Off"}
            </li>
            <li>
              <span className="text-foreground">Stock deduction:</span>{" "}
              {stockDeductTriggerLabel(policy.stockDeductTrigger)}
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function InventoryAdminDashboard() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("overview");
  const [locationId, setLocationId] = useState<string>("");
  const [locations, setLocations] = useState<LocationRow[]>([]);

  const [movementPage, setMovementPage] = useState(1);
  const [movementLimit, setMovementLimit] = useState(50);
  const [lowStockPage, setLowStockPage] = useState(1);
  const lowStockLimit = 25;
  const [exportAllMovementsBusy, setExportAllMovementsBusy] = useState(false);
  const [movementFilters, setMovementFilters] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [movementDraftFilters, setMovementDraftFilters] = useState<{
    from: string;
    to: string;
  }>({
    from: "",
    to: "",
  });
  const [movementFilterError, setMovementFilterError] = useState<string | null>(null);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>({
    ingredientId: "",
    quantityDelta: 0,
    reason: "manual_adjust",
    note: "",
    locationId: "",
  });

  const bumpInventoryHub = useCallback(() => {
    invalidateInventoryHubQueries(queryClient);
  }, [queryClient]);

  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferIngredients, setTransferIngredients] = useState<IngredientRecord[] | null>(null);
  const [transferForm, setTransferForm] = useState({
    fromLocationId: "",
    toLocationId: "",
    ingredientId: "",
    quantity: "",
    note: "",
  });

  const [planningBalance, setPlanningBalance] = useState<StockBalanceRow | null>(null);
  const [planningForm, setPlanningForm] = useState({
    reservedQty: 0,
    incomingQty: 0,
    maxStockLevel: 0,
  });
  const [isPlanningSaving, setIsPlanningSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchLocations();
        setLocations(Array.isArray(res.data) ? res.data : []);
      } catch {
        setLocations([]);
      }
    })();
  }, []);

  const reportQuery = useQuery({
    queryKey: INVENTORY_REPORT_QUERY_KEY,
    queryFn: fetchInventoryReport,
    enabled: tab === "overview",
  });

  const lowStockQuery = useQuery({
    queryKey: inventoryLowStockQueryKey(lowStockPage, lowStockLimit),
    queryFn: () => fetchInventoryLowStock({ page: lowStockPage, limit: lowStockLimit }),
    enabled: tab === "low-stock",
  });

  const balancesQuery = useQuery({
    queryKey: inventoryBalancesQueryKey(locationId || "__all__"),
    queryFn: () => fetchInventoryBalances({ locationId: locationId || undefined }),
    enabled: tab === "balances",
  });

  const movementsQuery = useQuery({
    queryKey: inventoryMovementsQueryKey({
      page: movementPage,
      limit: movementLimit,
      from: movementFilters.from,
      to: movementFilters.to,
      locationId: locationId || "",
    }),
    queryFn: () =>
      fetchInventoryMovements({
        page: movementPage,
        limit: movementLimit,
        from: movementFilters.from || undefined,
        to: movementFilters.to || undefined,
        locationId: locationId || undefined,
      }),
    enabled: tab === "movements",
  });

  const report = reportQuery.data?.data ?? null;
  const lowStock = Array.isArray(lowStockQuery.data?.data) ? lowStockQuery.data.data : null;
  const lowStockTotal = lowStockQuery.data?.total;
  const balances = Array.isArray(balancesQuery.data?.data) ? balancesQuery.data.data : null;
  const movementsRaw = Array.isArray(movementsQuery.data?.data) ? movementsQuery.data.data : null;
  const movementMeta = {
    total: movementsQuery.data?.total,
    page: movementsQuery.data?.page,
    limit: movementsQuery.data?.limit,
  };
  const movementTotal = movementMeta.total;
  const movementTotalPages =
    movementTotal != null && movementTotal >= 0 ? Math.max(1, Math.ceil(movementTotal / movementLimit)) : null;

  function hubErrorMessage(e: unknown) {
    return e instanceof Error ? e.message : "Request failed";
  }
  const inventoryError =
    tab === "overview" && reportQuery.isError
      ? hubErrorMessage(reportQuery.error)
      : tab === "low-stock" && lowStockQuery.isError
        ? hubErrorMessage(lowStockQuery.error)
        : tab === "balances" && balancesQuery.isError
          ? hubErrorMessage(balancesQuery.error)
          : tab === "movements" && movementsQuery.isError
            ? hubErrorMessage(movementsQuery.error)
            : null;

  useEffect(() => {
    setMovementPage(1);
  }, []);

  useEffect(() => {
    if (!isTransferOpen) return;
    void (async () => {
      try {
        const res = await fetchIngredients({ status: "active" });
        setTransferIngredients(Array.isArray(res.data) ? res.data : []);
      } catch {
        setTransferIngredients([]);
      }
    })();
  }, [isTransferOpen]);

  const movementsFiltered = movementsRaw;

  async function exportAllMovementsCsv() {
    if (movementTotal != null && movementTotal > 50_000) {
      toast.error("More than 50,000 rows match. Narrow the date range or request a server export.");
      return;
    }
    setExportAllMovementsBusy(true);
    try {
      const rows = await fetchAllInventoryMovements({
        from: movementFilters.from || undefined,
        to: movementFilters.to || undefined,
        locationId: locationId || undefined,
      });
      downloadMovementsCsv(rows, `inventory-movements-all-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`);
      toast.success(`Exported ${rows.length} movement row(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportAllMovementsBusy(false);
    }
  }

  const validateMovementDraftFilters = useCallback(() => {
    const { from, to } = movementDraftFilters;
    if (!from && !to) {
      setMovementFilterError(null);
      return true;
    }
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
      setMovementFilterError("Please use valid dates.");
      return false;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setMovementFilterError("From date must be before To date.");
      return false;
    }
    setMovementFilterError(null);
    return true;
  }, [movementDraftFilters]);

  const applyMovementFilters = useCallback(() => {
    if (!validateMovementDraftFilters()) return;
    setMovementPage(1);
    setMovementFilters({
      from: movementDraftFilters.from,
      to: movementDraftFilters.to,
    });
  }, [movementDraftFilters, validateMovementDraftFilters]);

  const clearMovementFilters = useCallback(() => {
    setMovementDraftFilters({ from: "", to: "" });
    setMovementFilters({ from: "", to: "" });
    setMovementFilterError(null);
    setMovementPage(1);
  }, []);

  const onAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);
    if (!adjustForm.ingredientId || !adjustForm.locationId) {
      const msg = "Ingredient and Location are required.";
      setAdjustError(msg);
      toast.error(msg);
      return;
    }
    const qty = Number(adjustForm.quantityDelta);
    if (!Number.isFinite(qty) || qty === 0) {
      const msg = "Quantity must be a non-zero number.";
      setAdjustError(msg);
      toast.error(msg);
      return;
    }
    setIsAdjusting(true);
    try {
      const delivery = await adjustInventoryWithOfflineSupport({
        ...adjustForm,
        quantityDelta: qty,
      });
      if (delivery.mode === "queued") {
        toast.success("Adjustment queued; it will sync when you are back online.");
      } else {
        toast.success("Inventory adjusted.");
      }
      setIsAdjustOpen(false);
      setAdjustForm({
        ingredientId: "",
        quantityDelta: 0,
        reason: "manual_adjust",
        note: "",
        locationId: "",
      });
      bumpInventoryHub();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adjustment failed");
    } finally {
      setIsAdjusting(false);
    }
  };

  const onTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(transferForm.quantity);
    if (!transferForm.fromLocationId || !transferForm.toLocationId) {
      toast.error("Choose source and destination locations.");
      return;
    }
    if (transferForm.fromLocationId === transferForm.toLocationId) {
      toast.error("Source and destination must differ.");
      return;
    }
    if (!transferForm.ingredientId) {
      toast.error("Select an ingredient.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be a positive number.");
      return;
    }
    setIsTransferring(true);
    try {
      await transferInventory({
        fromLocationId: transferForm.fromLocationId,
        toLocationId: transferForm.toLocationId,
        ingredientId: transferForm.ingredientId,
        quantity: qty,
        note: transferForm.note.trim() || undefined,
      });
      toast.success("Stock transferred.");
      setIsTransferOpen(false);
      setTransferForm({
        fromLocationId: "",
        toLocationId: "",
        ingredientId: "",
        quantity: "",
        note: "",
      });
      bumpInventoryHub();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed.");
    } finally {
      setIsTransferring(false);
    }
  };

  const onPlanningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planningBalance) return;
    const ing = planningBalance.ingredient;
    const ingredientId = ing && typeof ing === "object" && "_id" in ing && ing._id != null ? String(ing._id) : "";
    const locId =
      planningBalance.location && typeof planningBalance.location === "object" && "_id" in planningBalance.location
        ? String(planningBalance.location._id)
        : "";
    if (!ingredientId || !locId) {
      toast.error("Missing ingredient or location on this row.");
      return;
    }
    setIsPlanningSaving(true);
    try {
      await patchInventoryBalancePlanning({
        locationId: locId,
        ingredientId,
        reservedQty: planningForm.reservedQty,
        incomingQty: planningForm.incomingQty,
        maxStockLevel: planningForm.maxStockLevel,
      });
      toast.success("Planning fields updated.");
      setPlanningBalance(null);
      bumpInventoryHub();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setIsPlanningSaving(false);
    }
  };

  const openPlanningDialog = (b: StockBalanceRow) => {
    setPlanningBalance(b);
    setPlanningForm({
      reservedQty: Number(b.reservedQty ?? 0),
      incomingQty: Number(b.incomingQty ?? 0),
      maxStockLevel: Number(b.maxStockLevel ?? 0),
    });
  };

  const locationSelect = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Label htmlFor="inv-location" className="shrink-0 text-muted-foreground text-sm">
        Location filter
      </Label>
      <Select value={locationId || "__all__"} onValueChange={(v) => setLocationId(v === "__all__" ? "" : v)}>
        <SelectTrigger id="inv-location" className="w-full sm:w-72">
          <SelectValue placeholder="All locations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All locations</SelectItem>
          {locations.map((loc) => (
            <SelectItem key={loc._id} value={loc._id}>
              {loc.name || loc.code || loc._id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-foreground tracking-tight md:text-3xl">Inventory</h1>
         
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/inventory/vendor-returns">
              <Truck className="mr-2 h-4 w-4" />
              Returns
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setIsTransferOpen(true)}>
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Transfer
          </Button>
          <Button onClick={() => setIsAdjustOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Quick Adjust
          </Button>
        </div>
      </div>

      {inventoryError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Could not load inventory data</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{inventoryError}</span>
            <Button variant="outline" size="sm" asChild>
              <Link prefetch={false} href="/login">
                Staff sign-in
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 md:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="balances">Stock balances</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="low-stock">Low stock</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 outline-none">
          {reportQuery.isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : report ? (
            <div className="flex flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Ingredients tracked</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">{report.ingredients?.length ?? 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>At or below reorder</CardDescription>
                    <CardTitle className="text-2xl text-destructive tabular-nums">
                      {report.belowThreshold?.length ?? 0}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Recipes with portions estimate</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">{report.portionsByDish?.length ?? 0}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <InventoryPosPolicyOverviewCard />
              <InventoryAdminToolsCard onDidMutate={bumpInventoryHub} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Estimated portions by menu item</CardTitle>
                  <CardDescription>From current stock and recipe BOM (same logic as backend report).</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {(report.portionsByDish?.length ?? 0) === 0 ? (
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Package />
                        </EmptyMedia>
                        <EmptyTitle>No recipe coverage</EmptyTitle>
                        <EmptyDescription>Add recipes linked to menu items to see portion estimates.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Menu item</TableHead>
                          <TableHead className="text-right">Est. portions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.portionsByDish.map((row) => (
                          <TableRow key={String(row.menuItemId)}>
                            <TableCell className="font-medium">{row.menuItemName ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.estimatedPortions == null ? (
                                <Badge variant="secondary">—</Badge>
                              ) : (
                                row.estimatedPortions
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="balances" className="mt-0 flex flex-col gap-4 outline-none">
          {locationSelect}
          {balancesQuery.isPending ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : balances ? (
            balances.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Package />
                  </EmptyMedia>
                  <EmptyTitle>No balance rows</EmptyTitle>
                  <EmptyDescription>
                    Bootstrap or receive stock in the POS back office, or widen the location filter.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Per-location stock</CardTitle>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={!balances?.length}
                      onClick={() => {
                        if (!balances?.length) return;
                        const rows = balances.map((b) => ({
                          ingredient: b.ingredient?.name ?? "—",
                          sku: b.ingredient?.sku ?? "",
                          location: b.location?.name ?? b.location?.code ?? "—",
                          quantity: Number(b.quantity ?? 0),
                          reserved: Number(b.reservedQty ?? 0),
                          available: Number(b.availableQty ?? 0),
                          incoming: Number(b.incomingQty ?? 0),
                          maxLevel: Number(b.maxStockLevel ?? 0),
                        }));
                        exportReportPdf({
                          fileName: "inventory-balances.pdf",
                          title: "Inventory balances",
                          branchName: locationId ? "Filtered branch" : "All branches",
                          dateRange: format(new Date(), "yyyy-MM-dd"),
                          columns: [
                            { key: "ingredient", label: "Ingredient" },
                            { key: "sku", label: "SKU" },
                            { key: "location", label: "Location" },
                            { key: "quantity", label: "Qty" },
                            { key: "reserved", label: "Reserved" },
                            { key: "available", label: "Available" },
                            { key: "incoming", label: "Incoming" },
                            { key: "maxLevel", label: "Max" },
                          ],
                          rows,
                        });
                      }}
                    >
                      <Download className="size-3.5" />
                      PDF
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={!balances?.length}
                      onClick={() => {
                        if (!balances?.length) return;
                        const rows = balances.map((b) => ({
                          ingredient: b.ingredient?.name ?? "—",
                          sku: b.ingredient?.sku ?? "",
                          location: b.location?.name ?? b.location?.code ?? "—",
                          quantity: Number(b.quantity ?? 0),
                          reserved: Number(b.reservedQty ?? 0),
                          available: Number(b.availableQty ?? 0),
                          incoming: Number(b.incomingQty ?? 0),
                          maxLevel: Number(b.maxStockLevel ?? 0),
                        }));
                        exportReportExcel({
                          fileName: "inventory-balances.xlsx",
                          branchName: locationId ? "Filtered branch" : "All branches",
                          dateRange: format(new Date(), "yyyy-MM-dd"),
                          columns: [
                            { key: "ingredient", label: "Ingredient" },
                            { key: "sku", label: "SKU" },
                            { key: "location", label: "Location" },
                            { key: "quantity", label: "Qty" },
                            { key: "reserved", label: "Reserved" },
                            { key: "available", label: "Available" },
                            { key: "incoming", label: "Incoming" },
                            { key: "maxLevel", label: "Max" },
                          ],
                          rows,
                        });
                      }}
                    >
                      <FileSpreadsheet className="size-3.5" />
                      Excel
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Reserved</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Incoming</TableHead>
                          <TableHead className="text-right">Max</TableHead>
                          <TableHead className="w-[100px] text-right">Planning</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {balances.map((b) => (
                          <TableRow key={String(b._id)}>
                            <TableCell>
                              <div className="font-medium">{b.ingredient?.name ?? "—"}</div>
                              <div className="text-muted-foreground text-xs">{b.ingredient?.sku ?? ""}</div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {b.location?.name ?? b.location?.code ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{Number(b.quantity ?? 0)}</TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {Number(b.reservedQty ?? 0)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {Number(b.availableQty ?? 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{Number(b.incomingQty ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{Number(b.maxStockLevel ?? 0)}</TableCell>
                            <TableCell className="text-right">
                              <Button type="button" variant="outline" size="sm" onClick={() => openPlanningDialog(b)}>
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )
          ) : null}
        </TabsContent>

        <TabsContent value="movements" className="mt-0 flex flex-col gap-4 outline-none">
          {locationSelect}
          <p className="text-muted-foreground text-xs">
            Filter movements by branch and date range to audit stock changes faster.
          </p>
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="mov-from">From</Label>
                <DatePicker
                  id="mov-from"
                  value={movementDraftFilters.from}
                  onValueChange={(v) => setMovementDraftFilters((s) => ({ ...s, from: v }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mov-to">To</Label>
                <DatePicker
                  id="mov-to"
                  value={movementDraftFilters.to}
                  onValueChange={(v) => setMovementDraftFilters((s) => ({ ...s, to: v }))}
                  className="w-full"
                />
              </div>
              <div className="flex items-end gap-2 md:col-span-2">
                <Button onClick={applyMovementFilters}>Apply Filters</Button>
                <Button variant="outline" onClick={clearMovementFilters}>
                  Reset
                </Button>
              </div>
              {movementFilterError ? (
                <p className="text-destructive text-xs md:col-span-4">{movementFilterError}</p>
              ) : null}
            </CardContent>
          </Card>
          {movementsQuery.isPending ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              Loading movements…
            </div>
          ) : movementsFiltered ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Recent movements</CardTitle>
                  <CardDescription>
                    {movementTotal != null ? (
                      <span className="mt-1 block text-muted-foreground">
                        {(movementsRaw?.length ?? 0) > 0
                          ? `Showing ${(movementPage - 1) * movementLimit + 1}–${(movementPage - 1) * movementLimit + (movementsRaw?.length ?? 0)} of ${movementTotal}`
                          : `No rows on this page (${movementTotal} total)`}
                        {movementTotalPages != null && movementTotal > 0
                          ? ` · Page ${movementPage} / ${movementTotalPages}`
                          : ""}
                      </span>
                    ) : (
                      <span className="mt-1 block text-muted-foreground">
                        {movementsRaw?.length ?? 0} rows (enable pagination with page + limit in API)
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="mov-limit" className="whitespace-nowrap text-muted-foreground text-xs">
                      Per page
                    </Label>
                    <Select
                      value={String(movementLimit)}
                      onValueChange={(v) => {
                        setMovementLimit(Number(v));
                        setMovementPage(1);
                      }}
                    >
                      <SelectTrigger id="mov-limit" className="h-8 w-[88px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={!movementsRaw?.length}
                    onClick={() =>
                      downloadMovementsCsv(movementsRaw ?? [], `inventory-movements-page-${movementPage}.csv`)
                    }
                  >
                    <Download className="size-3.5" />
                    This page
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1"
                    disabled={exportAllMovementsBusy}
                    onClick={() => void exportAllMovementsCsv()}
                  >
                    {exportAllMovementsBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    All pages (filtered)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={!movementsRaw?.length}
                    onClick={() => {
                      const rows = (movementsRaw ?? []).map((m) => ({
                        when: m.createdAt ? format(new Date(m.createdAt), "yyyy-MM-dd HH:mm") : "—",
                        ingredient: m.ingredient?.name ?? "—",
                        reason: String(m.reason ?? "—"),
                        delta: Number(m.delta ?? 0),
                        location: m.location?.name ?? m.location?.code ?? "—",
                        user: m.user?.name ?? "—",
                      }));
                      exportReportPdf({
                        fileName: `inventory-movements-page-${movementPage}.pdf`,
                        title: "Stock movements (page)",
                        branchName: locationId ? "Filtered branch" : "All branches",
                        dateRange: `${movementFilters.from || "…"} → ${movementFilters.to || "…"}`,
                        columns: [
                          { key: "when", label: "When" },
                          { key: "ingredient", label: "Ingredient" },
                          { key: "reason", label: "Reason" },
                          { key: "delta", label: "Δ" },
                          { key: "location", label: "Location" },
                          { key: "user", label: "User" },
                        ],
                        rows,
                      });
                    }}
                  >
                    <Download className="size-3.5" />
                    PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={!movementsRaw?.length}
                    onClick={() => {
                      const rows = (movementsRaw ?? []).map((m) => ({
                        when: m.createdAt ? format(new Date(m.createdAt), "yyyy-MM-dd HH:mm") : "—",
                        ingredient: m.ingredient?.name ?? "—",
                        reason: String(m.reason ?? "—"),
                        delta: Number(m.delta ?? 0),
                        location: m.location?.name ?? m.location?.code ?? "—",
                        user: m.user?.name ?? "—",
                      }));
                      exportReportExcel({
                        fileName: `inventory-movements-page-${movementPage}.xlsx`,
                        branchName: locationId ? "Filtered branch" : "All branches",
                        dateRange: `${movementFilters.from || "…"} → ${movementFilters.to || "…"}`,
                        columns: [
                          { key: "when", label: "When" },
                          { key: "ingredient", label: "Ingredient" },
                          { key: "reason", label: "Reason" },
                          { key: "delta", label: "Δ" },
                          { key: "location", label: "Location" },
                          { key: "user", label: "User" },
                        ],
                        rows,
                      });
                    }}
                  >
                    <FileSpreadsheet className="size-3.5" />
                    Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-0 sm:px-6">
                {movementTotalPages != null && movementTotalPages > 1 ? (
                  <div className="flex flex-wrap items-center gap-2 px-4 sm:px-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={movementPage <= 1 || movementsQuery.isFetching}
                      onClick={() => setMovementPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={movementPage >= movementTotalPages || movementsQuery.isFetching}
                      onClick={() => setMovementPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Ingredient</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>User</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movementsFiltered.map((m) => (
                        <TableRow key={String(m._id)}>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                            {m.createdAt ? format(new Date(m.createdAt), "MMM d, yyyy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{m.ingredient?.name ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {m.reason ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium tabular-nums ${Number(m.delta) < 0 ? "text-destructive" : "text-foreground"}`}
                          >
                            {m.delta ?? 0}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {m.location?.name ?? m.location?.code ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{m.user?.name ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="low-stock" className="mt-0 outline-none">
          {lowStockQuery.isPending ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : lowStock ? (
            lowStock.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle>Nothing below threshold</EmptyTitle>
                  <EmptyDescription>All active ingredients are above their reorder levels.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Low stock</CardTitle>
                    <CardDescription className="space-y-1">
                      <span className="block text-muted-foreground text-xs">
                        Start a purchase order with a suggested order quantity (gap to reorder level). Paged (
                        {lowStockLimit} per page).
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={!lowStock?.length}
                      onClick={() => {
                        if (!lowStock?.length) return;
                        const rows = lowStock.map((ing) => ({
                          name: ing.name ?? "—",
                          sku: ing.sku ?? "—",
                          unit: ing.unit ?? "—",
                          onHand: Number(ing.currentStock ?? 0),
                          reorder: Number(ing.reorderThreshold ?? 0),
                        }));
                        exportReportPdf({
                          fileName: `inventory-low-stock-page-${lowStockPage}.pdf`,
                          title: "Low stock",
                          branchName: locationId ? "Filtered branch" : "All branches",
                          dateRange: format(new Date(), "yyyy-MM-dd"),
                          columns: [
                            { key: "name", label: "Name" },
                            { key: "sku", label: "SKU" },
                            { key: "unit", label: "Unit" },
                            { key: "onHand", label: "On hand" },
                            { key: "reorder", label: "Reorder at" },
                          ],
                          rows,
                        });
                      }}
                    >
                      <Download className="size-3.5" />
                      PDF
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={!lowStock?.length}
                      onClick={() => {
                        if (!lowStock?.length) return;
                        const rows = lowStock.map((ing) => ({
                          name: ing.name ?? "—",
                          sku: ing.sku ?? "—",
                          unit: ing.unit ?? "—",
                          onHand: Number(ing.currentStock ?? 0),
                          reorder: Number(ing.reorderThreshold ?? 0),
                        }));
                        exportReportExcel({
                          fileName: `inventory-low-stock-page-${lowStockPage}.xlsx`,
                          branchName: locationId ? "Filtered branch" : "All branches",
                          dateRange: format(new Date(), "yyyy-MM-dd"),
                          columns: [
                            { key: "name", label: "Name" },
                            { key: "sku", label: "SKU" },
                            { key: "unit", label: "Unit" },
                            { key: "onHand", label: "On hand" },
                            { key: "reorder", label: "Reorder at" },
                          ],
                          rows,
                        });
                      }}
                    >
                      <FileSpreadsheet className="size-3.5" />
                      Excel
                    </Button>
                  </div>
                </CardHeader>
                {lowStock != null && lowStock.length > 0 && lowStockTotal != null && lowStockTotal > lowStockLimit ? (
                  <div className="flex flex-col gap-2 border-b px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-sm">
                      <span className="font-medium text-foreground tabular-nums">{lowStockTotal}</span> ingredient(s) at
                      or below reorder
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={lowStockPage <= 1 || lowStockQuery.isFetching}
                        onClick={() => setLowStockPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="text-muted-foreground text-sm tabular-nums">
                        Page {lowStockPage} of {Math.max(1, Math.ceil(lowStockTotal / lowStockLimit))}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          lowStockPage >= Math.max(1, Math.ceil(lowStockTotal / lowStockLimit)) ||
                          lowStockQuery.isFetching
                        }
                        onClick={() => setLowStockPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : lowStock != null && lowStock.length > 0 && lowStockTotal != null ? (
                  <div className="border-b px-6 py-2">
                    <p className="text-muted-foreground text-sm">
                      <span className="font-medium text-foreground tabular-nums">{lowStockTotal}</span> ingredient(s) at
                      or below reorder
                    </p>
                  </div>
                ) : null}
                <CardContent className="px-0 sm:px-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right">On hand</TableHead>
                          <TableHead className="text-right">Reorder at</TableHead>
                          <TableHead className="w-[120px] text-right">Procurement</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lowStock.map((ing) => (
                          <TableRow key={String(ing._id)}>
                            <TableCell className="font-medium">{ing.name ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{ing.sku ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{ing.unit ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{Number(ing.currentStock ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(ing.reorderThreshold ?? 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
                                <Link
                                  href={`/dashboard/purchase-orders?ingredientId=${encodeURIComponent(ing._id)}&quantity=${encodeURIComponent(String(suggestedPoQuantity(ing)))}`}
                                  prefetch={false}
                                >
                                  <ShoppingCart className="size-3.5 opacity-70" />
                                  Order
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inventory Adjustment</DialogTitle>
            <DialogDescription>Manually correct stock levels or record waste.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onAdjust} className="space-y-4 py-4">
            {adjustError ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" />
                <AlertTitle>Adjustment validation</AlertTitle>
                <AlertDescription>{adjustError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label>Ingredient</Label>
              <Select onValueChange={(v) => setAdjustForm((s) => ({ ...s, ingredientId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ingredient" />
                </SelectTrigger>
                <SelectContent>
                  {report?.ingredients?.map((ing) => (
                    <SelectItem key={ing._id} value={ing._id}>
                      {ing.name} ({ing.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select
                  value={adjustForm.locationId}
                  onValueChange={(v) => setAdjustForm((s) => ({ ...s, locationId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select
                  value={adjustForm.reason}
                  onValueChange={(v) => setAdjustForm((s) => ({ ...s, reason: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual_adjust">Manual Adjust</SelectItem>
                    <SelectItem value="waste">Waste</SelectItem>
                    <SelectItem value="correction">Correction</SelectItem>
                    <SelectItem value="receive">Receive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Quantity Delta
                <span className="ml-2 text-muted-foreground text-xs">
                  Use negative for waste, positive for receipts/corrections. Customer restock: Inventory → Returns.
                </span>
              </Label>
              <Input
                type="number"
                step="0.01"
                value={adjustForm.quantityDelta}
                onChange={(e) => setAdjustForm((s) => ({ ...s, quantityDelta: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Note / Comment</Label>
              <Input
                placeholder="Optional reason for adjustment"
                value={adjustForm.note}
                onChange={(e) => setAdjustForm((s) => ({ ...s, note: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAdjustOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isAdjusting}>
                {isAdjusting && <Spinner className="mr-2 size-4" />}
                Confirm Adjustment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transfer stock</DialogTitle>
            <DialogDescription>
              Moves quantity from one branch to another (
              <span className="font-mono text-xs">POST /api/inventory/transfer</span>). Requires manager/admin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onTransferSubmit} className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>From</Label>
                <Select
                  value={transferForm.fromLocationId || undefined}
                  onValueChange={(v) => setTransferForm((s) => ({ ...s, fromLocationId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Source location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {loc.name || loc.code || loc._id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Select
                  value={transferForm.toLocationId || undefined}
                  onValueChange={(v) => setTransferForm((s) => ({ ...s, toLocationId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {loc.name || loc.code || loc._id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ingredient</Label>
              <Select
                value={transferForm.ingredientId || undefined}
                onValueChange={(v) => setTransferForm((s) => ({ ...s, ingredientId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={transferIngredients == null ? "Loading…" : "Select ingredient"} />
                </SelectTrigger>
                <SelectContent>
                  {(transferIngredients ?? []).map((ing) => (
                    <SelectItem key={ing._id} value={ing._id}>
                      {ing.name ?? ing._id}
                      {ing.unit ? ` (${ing.unit})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity (stock UoM)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={transferForm.quantity}
                onChange={(e) => setTransferForm((s) => ({ ...s, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Input
                value={transferForm.note}
                onChange={(e) => setTransferForm((s) => ({ ...s, note: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTransferOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isTransferring}>
                {isTransferring && <Spinner className="mr-2 size-4" />}
                Transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={planningBalance != null}
        onOpenChange={(open) => {
          if (!open) setPlanningBalance(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Balance planning</DialogTitle>
            <DialogDescription>
              Update reserved, incoming, and max levels 
            </DialogDescription>
          </DialogHeader>
          {planningBalance ? (
            <form onSubmit={onPlanningSubmit} className="space-y-4 py-2">
              <p className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">{planningBalance.ingredient?.name ?? "—"}</span>
                {" · "}
                {planningBalance.location?.name ?? planningBalance.location?.code ?? "—"}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="plan-res">Reserved</Label>
                  <Input
                    id="plan-res"
                    type="number"
                    min="0"
                    step="0.01"
                    value={planningForm.reservedQty}
                    onChange={(e) => setPlanningForm((s) => ({ ...s, reservedQty: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-inc">Incoming</Label>
                  <Input
                    id="plan-inc"
                    type="number"
                    min="0"
                    step="0.01"
                    value={planningForm.incomingQty}
                    onChange={(e) => setPlanningForm((s) => ({ ...s, incomingQty: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-max">Max stock</Label>
                  <Input
                    id="plan-max"
                    type="number"
                    min="0"
                    step="0.01"
                    value={planningForm.maxStockLevel}
                    onChange={(e) => setPlanningForm((s) => ({ ...s, maxStockLevel: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPlanningBalance(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPlanningSaving}>
                  {isPlanningSaving && <Spinner className="mr-2 size-4" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
