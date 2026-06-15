"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BarChart3, Download, Loader2, RotateCcw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchIngredientPriceHistory,
  fetchIngredients,
  fetchInventoryForecast,
  fetchLocationsList,
  fetchSlowMovingReport,
  fetchValuationReport,
  fetchWasteAnalytics,
  INGREDIENTS_QUERY_KEY,
  INVENTORY_FORECAST_QUERY_KEY,
  INVENTORY_PRICE_HISTORY_QUERY_KEY,
  INVENTORY_SLOW_MOVING_QUERY_KEY,
  INVENTORY_VALUATION_QUERY_KEY,
  INVENTORY_WASTE_QUERY_KEY,
  type IngredientRecord,
  type InventoryCostMethod,
  type LocationRow,
  normalizeLocationsQueryData,
  type ValuationReportRow,
  type WasteAnalyticsRow,
} from "@/lib/inventory-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

type TabKey = "valuation" | "slow" | "forecast" | "waste" | "price";

const TAB_KEYS: TabKey[] = ["valuation", "slow", "forecast", "waste", "price"];

const ANALYTICS_VIEW_STORAGE_KEY = "pos.inventory.analytics.savedView.v1";

type PersistedAnalyticsView = {
  tab: TabKey;
  valuationLocationId: string;
  valuationCostMethod: InventoryCostMethod | "";
  slowDays: string;
  slowDaysDraft: string;
  wasteFrom: string;
  wasteTo: string;
  wasteLocationId: string;
  priceIngredientId: string;
  priceLimit: string;
};

const valuationChartConfig = {
  value: { label: "Value", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

const wasteChartConfig = {
  cost: { label: "Cost", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const slowChartConfig = {
  value: { label: "Stock value", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

const forecastChartConfig = {
  days: { label: "Days to zero", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig;

const priceChartConfig = {
  price: { label: "Unit price", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;

function isTabKey(v: unknown): v is TabKey {
  return typeof v === "string" && (TAB_KEYS as string[]).includes(v);
}

function parsePersistedView(raw: string): Partial<PersistedAnalyticsView> | null {
  try {
    const p = JSON.parse(raw) as Partial<PersistedAnalyticsView>;
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
}

function aggregateWasteCostByReason(rows: WasteAnalyticsRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = row.wasteReasonCode?.trim() ? row.wasteReasonCode : "(no reason)";
    const add = Number.isFinite(row.costTotal) ? row.costTotal : 0;
    map.set(k, (map.get(k) ?? 0) + add);
  }
  return [...map.entries()].map(([reason, cost]) => ({ reason, cost })).sort((a, b) => b.cost - a.cost);
}

function escapeCsvCell(value: string) {
  const s = value ?? "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsvFile(filename: string, header: string[], rows: string[][]) {
  const lines = [
    header.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map((c) => escapeCsvCell(String(c))).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtQty(n: number) {
  if (!Number.isFinite(n)) return "—";
  return Number(n.toFixed(4)).toString();
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function locationLabel(loc: ValuationReportRow["location"]) {
  if (loc == null) return "—";
  if (typeof loc === "object" && loc !== null && "name" in loc && loc.name) return String(loc.name);
  return String(loc);
}

export function InventoryAnalyticsDashboard() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canCostAnalytics = useMemo(() => posCan(permissions, "backoffice.inventory.cost.read"), [permissions]);

  const [tab, setTab] = useState<TabKey>("valuation");

  const [valuationLocationId, setValuationLocationId] = useState("");
  const [valuationCostMethod, setValuationCostMethod] = useState<InventoryCostMethod | "">("");

  const [slowDays, setSlowDays] = useState("30");
  const [slowDaysDraft, setSlowDaysDraft] = useState("30");

  const [wasteFrom, setWasteFrom] = useState("");
  const [wasteTo, setWasteTo] = useState("");
  const [wasteLocationId, setWasteLocationId] = useState("");

  const [priceIngredientId, setPriceIngredientId] = useState<string>("__all__");
  const [priceLimit, setPriceLimit] = useState("200");

  const [viewHydrated, setViewHydrated] = useState(false);

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
    enabled: canCostAnalytics,
  });

  const ingredientsQuery = useQuery({
    /** Scoped key: other screens use the same base key but cache the full `posApiJson` envelope. */
    queryKey: [...INGREDIENTS_QUERY_KEY, "analytics-price", { status: "active" as const }] as const,
    queryFn: async () => {
      const res = await fetchIngredients({ status: "active" });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: tab === "price" && canCostAnalytics,
  });

  const priceTabIngredients = useMemo((): IngredientRecord[] => {
    const raw = ingredientsQuery.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
      return (raw as { data: IngredientRecord[] }).data;
    }
    return [];
  }, [ingredientsQuery.data]);

  const locations: LocationRow[] = normalizeLocationsQueryData(locationsQuery.data);

  const valuationQuery = useQuery({
    queryKey: [...INVENTORY_VALUATION_QUERY_KEY, valuationLocationId || null, valuationCostMethod || null],
    queryFn: async () => {
      const res = await fetchValuationReport({
        locationId: valuationLocationId || undefined,
        costMethod: valuationCostMethod || undefined,
      });
      return res.data ?? null;
    },
    enabled: tab === "valuation" && canCostAnalytics,
  });

  const slowParsed = useMemo(() => {
    const n = Number(slowDays);
    return Number.isInteger(n) && n > 0 ? n : 30;
  }, [slowDays]);

  const slowQuery = useQuery({
    queryKey: [...INVENTORY_SLOW_MOVING_QUERY_KEY, slowParsed],
    queryFn: async () => {
      const res = await fetchSlowMovingReport({ days: slowParsed });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: tab === "slow" && canCostAnalytics,
  });

  const forecastQuery = useQuery({
    queryKey: INVENTORY_FORECAST_QUERY_KEY,
    queryFn: async () => {
      const res = await fetchInventoryForecast();
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: tab === "forecast" && canCostAnalytics,
  });

  const wasteQuery = useQuery({
    queryKey: [...INVENTORY_WASTE_QUERY_KEY, wasteFrom, wasteTo, wasteLocationId],
    queryFn: async () => {
      const res = await fetchWasteAnalytics({
        from: wasteFrom || undefined,
        to: wasteTo || undefined,
        locationId: wasteLocationId || undefined,
      });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: tab === "waste" && canCostAnalytics,
  });

  const priceLimitParsed = useMemo(() => {
    const n = Number(priceLimit);
    if (!Number.isFinite(n) || n <= 0) return 200;
    return Math.min(Math.floor(n), 500);
  }, [priceLimit]);

  const priceQuery = useQuery({
    queryKey: [...INVENTORY_PRICE_HISTORY_QUERY_KEY, priceIngredientId, priceLimitParsed],
    queryFn: async () => {
      const res = await fetchIngredientPriceHistory({
        ingredientId: priceIngredientId === "__all__" ? undefined : priceIngredientId,
        limit: priceLimitParsed,
      });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: tab === "price" && canCostAnalytics,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(ANALYTICS_VIEW_STORAGE_KEY);
      if (raw) {
        const p = parsePersistedView(raw);
        if (p) {
          if (isTabKey(p.tab)) setTab(p.tab);
          if (typeof p.valuationLocationId === "string") setValuationLocationId(p.valuationLocationId);
          if (
            p.valuationCostMethod === "" ||
            p.valuationCostMethod === "weighted_average" ||
            p.valuationCostMethod === "fifo" ||
            p.valuationCostMethod === "lifo" ||
            p.valuationCostMethod === "standard"
          ) {
            setValuationCostMethod(p.valuationCostMethod);
          }
          if (typeof p.slowDays === "string") setSlowDays(p.slowDays);
          if (typeof p.slowDaysDraft === "string") setSlowDaysDraft(p.slowDaysDraft);
          if (typeof p.wasteFrom === "string") setWasteFrom(p.wasteFrom);
          if (typeof p.wasteTo === "string") setWasteTo(p.wasteTo);
          if (typeof p.wasteLocationId === "string") setWasteLocationId(p.wasteLocationId);
          if (typeof p.priceIngredientId === "string") setPriceIngredientId(p.priceIngredientId);
          if (typeof p.priceLimit === "string") setPriceLimit(p.priceLimit);
        }
      }
    } catch {
      /* ignore corrupt storage */
    } finally {
      setViewHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!viewHydrated || typeof window === "undefined") return;
    const payload: PersistedAnalyticsView = {
      tab,
      valuationLocationId,
      valuationCostMethod,
      slowDays,
      slowDaysDraft,
      wasteFrom,
      wasteTo,
      wasteLocationId,
      priceIngredientId,
      priceLimit,
    };
    try {
      localStorage.setItem(ANALYTICS_VIEW_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / private mode */
    }
  }, [
    viewHydrated,
    tab,
    valuationLocationId,
    valuationCostMethod,
    slowDays,
    slowDaysDraft,
    wasteFrom,
    wasteTo,
    wasteLocationId,
    priceIngredientId,
    priceLimit,
  ]);

  function resetAnalyticsView() {
    setTab("valuation");
    setValuationLocationId("");
    setValuationCostMethod("");
    setSlowDays("30");
    setSlowDaysDraft("30");
    setWasteFrom("");
    setWasteTo("");
    setWasteLocationId("");
    setPriceIngredientId("__all__");
    setPriceLimit("200");
    try {
      localStorage.removeItem(ANALYTICS_VIEW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    toast.success("Analytics filters reset for this browser.");
  }

  const valuationTopChartData = useMemo(() => {
    const rows = valuationQuery.data?.rows ?? [];
    const sorted = [...rows]
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    return sorted.map((row) => ({
      label: `${row.ingredient?.name ?? "—"} · ${locationLabel(row.location)}`.slice(0, 42),
      value: row.value,
    }));
  }, [valuationQuery.data]);

  const slowChartData = useMemo(() => {
    const rows = [...(slowQuery.data ?? [])].sort((a, b) => b.stockValue - a.stockValue).slice(0, 12);
    return rows.map((row) => ({
      label: (row.ingredient?.name ?? "—").slice(0, 36),
      value: row.stockValue,
    }));
  }, [slowQuery.data]);

  const forecastChartData = useMemo(() => {
    const rows = (forecastQuery.data ?? []).filter(
      (r) => r.daysToZero != null && Number.isFinite(r.daysToZero) && r.daysToZero >= 0,
    );
    const sorted = [...rows].sort((a, b) => (a.daysToZero ?? 1e9) - (b.daysToZero ?? 1e9)).slice(0, 12);
    return sorted.map((r) => ({
      label: (r.ingredient?.name ?? "—").slice(0, 32),
      days: Math.min(Number(r.daysToZero), 3650),
    }));
  }, [forecastQuery.data]);

  const wasteByReasonChartData = useMemo(() => aggregateWasteCostByReason(wasteQuery.data ?? []), [wasteQuery.data]);

  const priceTrendChartData = useMemo(() => {
    const rows = [...(priceQuery.data ?? [])].reverse();
    return rows.map((r, i) => ({
      label: r.createdAt ? format(new Date(r.createdAt), "MMM d") : `Row ${i + 1}`,
      price: Number.isFinite(r.unitPrice) ? r.unitPrice : 0,
    }));
  }, [priceQuery.data]);

  function applySlowFilters() {
    const n = Number(slowDaysDraft);
    if (!Number.isInteger(n) || n <= 0 || n > 3650) {
      setSlowDays("30");
      return;
    }
    setSlowDays(String(n));
  }

  function exportValuationCsv() {
    const data = valuationQuery.data;
    if (!data?.rows.length) {
      toast.error("Nothing to export.");
      return;
    }
    const header = ["Ingredient", "SKU", "Unit", "Location", "Qty", "Unit cost", "Value"];
    const rows = data.rows.map((row) => [
      row.ingredient?.name ?? "",
      row.ingredient?.sku ?? "",
      row.ingredient?.unit ?? "",
      locationLabel(row.location),
      fmtQty(row.quantity),
      fmtMoney(row.unitCost),
      fmtMoney(row.value),
    ]);
    downloadCsvFile(`inventory-valuation-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, header, rows);
    toast.success(`Exported ${rows.length} row(s).`);
  }

  function exportSlowMovingCsv() {
    const data = slowQuery.data;
    if (!data?.length) {
      toast.error("Nothing to export.");
      return;
    }
    const header = [
      "Ingredient",
      "SKU",
      "On hand",
      "Unit",
      "Stock value",
      "Last consumption (ISO)",
      "Days since last consumption",
    ];
    const rows = data.map((row) => {
      const d = row.daysSinceLastConsumption;
      const daysLabel = !Number.isFinite(d) || d === Infinity ? "" : String(Math.floor(d));
      return [
        row.ingredient?.name ?? "",
        row.ingredient?.sku ?? "",
        fmtQty(row.currentStock),
        row.ingredient?.unit ?? "",
        fmtMoney(row.stockValue),
        row.lastMovementDate ? new Date(row.lastMovementDate).toISOString() : "",
        daysLabel,
      ];
    });
    downloadCsvFile(`inventory-slow-moving-${slowParsed}d-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, header, rows);
    toast.success(`Exported ${rows.length} row(s).`);
  }

  function exportForecastCsv() {
    const data = forecastQuery.data;
    if (!data?.length) {
      toast.error("Nothing to export.");
      return;
    }
    const header = [
      "Ingredient",
      "Unit",
      "On hand",
      "Rate per day",
      "Days to zero",
      "Projected stock-out (ISO)",
      "Reorder alert",
    ];
    const rows = data.map((row) => [
      row.ingredient?.name ?? "",
      row.ingredient?.unit ?? "",
      fmtQty(row.currentStock),
      fmtQty(row.currentRate),
      row.daysToZero == null ? "" : fmtQty(row.daysToZero),
      row.projectedStockOutDate ? new Date(row.projectedStockOutDate).toISOString() : "",
      row.reorderAlert ? "yes" : "",
    ]);
    downloadCsvFile(`inventory-forecast-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, header, rows);
    toast.success(`Exported ${rows.length} row(s).`);
  }

  function exportWasteCsv() {
    const data = wasteQuery.data;
    if (!data?.length) {
      toast.error("Nothing to export.");
      return;
    }
    const header = ["Ingredient", "SKU", "Reason", "Quantity delta", "Movement count", "Cost total"];
    const rows = data.map((row) => [
      row.ingredient?.name ?? "",
      row.ingredient?.sku ?? "",
      row.wasteReasonCode ?? "",
      fmtQty(row.quantityDelta),
      String(row.movementCount ?? ""),
      fmtMoney(row.costTotal),
    ]);
    downloadCsvFile(`inventory-waste-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, header, rows);
    toast.success(`Exported ${rows.length} row(s).`);
  }

  function exportPriceHistoryCsv() {
    const data = priceQuery.data;
    if (!data?.length) {
      toast.error("Nothing to export.");
      return;
    }
    const header = ["When (ISO)", "Ingredient", "SKU", "Source", "Unit price", "Note"];
    const rows = data.map((row) => [
      row.createdAt ? new Date(row.createdAt).toISOString() : "",
      row.ingredient?.name ?? "",
      row.ingredient?.sku ?? "",
      row.source ?? "",
      fmtMoney(row.unitPrice),
      row.note ?? "",
    ]);
    downloadCsvFile(`inventory-price-history-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, header, rows);
    toast.success(`Exported ${rows.length} row(s).`);
  }

  if (!canCostAnalytics) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">Inventory analytics</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Cost and valuation analytics require an extra permission beyond inventory read access.
          </p>
        </div>
        <Alert>
          <AlertTitle>Permission required</AlertTitle>
          <AlertDescription>
            Ask an administrator to grant <span className="font-mono text-xs">backoffice.inventory.cost.read</span> or{" "}
            <span className="font-mono text-xs">backoffice.*</span> on your role. Without it, valuation, slow-moving,
            forecast, waste cost, and purchase price history APIs return 403.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">Inventory analytics</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Read-only reports from <span className="font-mono text-xs">/api/inventory/report/*</span> and{" "}
            <span className="font-mono text-xs">/api/inventory/analytics/*</span>. Adjust stock from{" "}
            <Link href="/dashboard/inventory" className="text-primary underline-offset-4 hover:underline">
              Inventory
            </Link>
            . v1 scope: interactive tables, CSV export, lightweight charts; huge exports remain client-bounded.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
            <span>Tab and filters are saved in this browser.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={resetAnalyticsView}
            >
              <RotateCcw className="size-3" />
              Reset saved filters
            </Button>
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="valuation" className="gap-1">
            <BarChart3 className="size-3.5 opacity-70" />
            Valuation
          </TabsTrigger>
          <TabsTrigger value="slow">Slow-moving</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="waste">Waste</TabsTrigger>
          <TabsTrigger value="price">Price history</TabsTrigger>
        </TabsList>

        <TabsContent value="valuation" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Valuation</CardTitle>
              <CardDescription>
                Stock value by ingredient and location using the selected cost method (or org default).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <div className="space-y-2 sm:min-w-[200px]">
                  <Label>Location</Label>
                  <Select
                    value={valuationLocationId || "__all__"}
                    onValueChange={(v) => setValuationLocationId(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All locations</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l._id} value={l._id}>
                          {l.name || l.code || l._id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:min-w-[200px]">
                  <Label>Cost method</Label>
                  <Select
                    value={valuationCostMethod || "__default__"}
                    onValueChange={(v) => setValuationCostMethod(v === "__default__" ? "" : (v as InventoryCostMethod))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Org default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Org default</SelectItem>
                      <SelectItem value="weighted_average">Weighted average</SelectItem>
                      <SelectItem value="fifo">FIFO layers</SelectItem>
                      <SelectItem value="lifo">LIFO layers</SelectItem>
                      <SelectItem value="standard">Standard cost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {valuationQuery.isLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              ) : valuationQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load valuation</AlertTitle>
                  <AlertDescription>
                    {valuationQuery.error instanceof Error ? valuationQuery.error.message : "Unknown error"}
                  </AlertDescription>
                </Alert>
              ) : valuationQuery.data ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Grand total:</span>{" "}
                      <span className="font-semibold">{fmtMoney(valuationQuery.data.grandTotal)}</span>
                      <span className="text-muted-foreground"> · Method: </span>
                      <span className="font-mono text-xs">{String(valuationQuery.data.costMethod)}</span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1"
                      disabled={valuationQuery.data.rows.length === 0}
                      onClick={exportValuationCsv}
                    >
                      <Download className="size-3.5" />
                      Export CSV
                    </Button>
                  </div>
                  {valuationTopChartData.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Top lines by value
                      </p>
                      <ChartContainer config={valuationChartConfig} className="aspect-[unset] h-72 w-full">
                        <BarChart
                          accessibilityLayer
                          data={valuationTopChartData}
                          layout="vertical"
                          margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.3} />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) =>
                              typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                            }
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={120}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={14} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : null}
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit cost</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {valuationQuery.data.rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                              No positive balances match the filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          valuationQuery.data.rows.map((row, i) => (
                            <TableRow key={`${String(row.ingredient?._id)}-${i}`}>
                              <TableCell>
                                <div className="font-medium">{row.ingredient?.name || "—"}</div>
                                <div className="text-muted-foreground text-xs">
                                  {row.ingredient?.sku ? `SKU ${row.ingredient.sku}` : row.ingredient?._id}
                                  {row.ingredient?.unit ? ` · ${row.ingredient.unit}` : ""}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {locationLabel(row.location)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtQty(row.quantity)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtMoney(row.unitCost)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtMoney(row.value)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slow" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Slow-moving</CardTitle>
              <CardDescription>
                Ingredients with no sale/consume movement in the last N days but non-zero stock (sorted by stock value).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="slow-days">Days window</Label>
                  <Input
                    id="slow-days"
                    type="number"
                    min={1}
                    max={3650}
                    className="w-28"
                    value={slowDaysDraft}
                    onChange={(e) => setSlowDaysDraft(e.target.value)}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={applySlowFilters}>
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={slowQuery.isLoading || slowQuery.isError || !slowQuery.data?.length}
                  onClick={exportSlowMovingCsv}
                >
                  <Download className="size-3.5" />
                  Export CSV
                </Button>
              </div>

              {slowQuery.isLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              ) : slowQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load slow-moving report</AlertTitle>
                  <AlertDescription>
                    {slowQuery.error instanceof Error ? slowQuery.error.message : "Unknown error"}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {slowChartData.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Top stock value (slow-moving)
                      </p>
                      <ChartContainer config={slowChartConfig} className="aspect-[unset] h-72 w-full">
                        <BarChart
                          accessibilityLayer
                          data={slowChartData}
                          layout="vertical"
                          margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.3} />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) =>
                              typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                            }
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={112}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} barSize={14} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : null}
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead className="text-right">On hand</TableHead>
                          <TableHead className="text-right">Stock value</TableHead>
                          <TableHead>Last consumption</TableHead>
                          <TableHead className="text-right">Days since</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slowQuery.data?.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                              No slow-moving rows for the last {slowParsed} days.
                            </TableCell>
                          </TableRow>
                        ) : (
                          slowQuery.data?.map((row) => {
                            const d = row.daysSinceLastConsumption;
                            const daysLabel = !Number.isFinite(d) || d === Infinity ? "—" : String(Math.floor(d));
                            return (
                              <TableRow key={String(row.ingredient?._id)}>
                                <TableCell>
                                  <div className="font-medium">{row.ingredient?.name || "—"}</div>
                                  <div className="text-muted-foreground text-xs">
                                    {row.ingredient?.sku ? `SKU ${row.ingredient.sku}` : ""}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {fmtQty(row.currentStock)}
                                  {row.ingredient?.unit ? ` ${row.ingredient.unit}` : ""}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {fmtMoney(row.stockValue)}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {row.lastMovementDate
                                    ? format(new Date(row.lastMovementDate), "yyyy-MM-dd HH:mm")
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">{daysLabel}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Consumption forecast</CardTitle>
              <CardDescription>
                Heuristic from recent movements: projected run-out ordering and reorder flags vs lead time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forecastQuery.isLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              ) : forecastQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load forecast</AlertTitle>
                  <AlertDescription>
                    {forecastQuery.error instanceof Error ? forecastQuery.error.message : "Unknown error"}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {forecastChartData.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Soonest run-out (days to zero)
                      </p>
                      <ChartContainer config={forecastChartConfig} className="aspect-[unset] h-72 w-full">
                        <BarChart
                          accessibilityLayer
                          data={forecastChartData}
                          layout="vertical"
                          margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.3} />
                          <XAxis type="number" tickLine={false} axisLine={false} />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={112}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="days" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} barSize={14} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={!forecastQuery.data?.length}
                        onClick={exportForecastCsv}
                      >
                        <Download className="size-3.5" />
                        Export CSV
                      </Button>
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ingredient</TableHead>
                            <TableHead className="text-right">On hand</TableHead>
                            <TableHead className="text-right">Rate / day</TableHead>
                            <TableHead className="text-right">Days to zero</TableHead>
                            <TableHead>Projected stock-out</TableHead>
                            <TableHead>Reorder</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {forecastQuery.data?.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                                No ingredients to forecast.
                              </TableCell>
                            </TableRow>
                          ) : (
                            forecastQuery.data?.map((row) => (
                              <TableRow key={String(row.ingredient?._id)}>
                                <TableCell>
                                  <div className="font-medium">{row.ingredient?.name || "—"}</div>
                                  <div className="text-muted-foreground text-xs">{row.ingredient?.unit || ""}</div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {fmtQty(row.currentStock)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {fmtQty(row.currentRate)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {row.daysToZero == null ? "—" : fmtQty(row.daysToZero)}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {row.projectedStockOutDate
                                    ? format(new Date(row.projectedStockOutDate), "yyyy-MM-dd")
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  {row.reorderAlert ? (
                                    <span className="font-medium text-amber-600 text-sm">Alert</span>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waste" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Waste</CardTitle>
              <CardDescription>Aggregated waste movements by ingredient and reason code.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <div className="space-y-2">
                  <Label htmlFor="waste-from">From</Label>
                  <DatePicker
                    id="waste-from"
                    value={wasteFrom}
                    onValueChange={setWasteFrom}
                    className="w-full min-w-[220px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waste-to">To</Label>
                  <DatePicker
                    id="waste-to"
                    value={wasteTo}
                    onValueChange={setWasteTo}
                    className="w-full min-w-[220px]"
                  />
                </div>
                <div className="space-y-2 sm:min-w-[200px]">
                  <Label>Location</Label>
                  <Select
                    value={wasteLocationId || "__all__"}
                    onValueChange={(v) => setWasteLocationId(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All locations</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l._id} value={l._id}>
                          {l.name || l.code || l._id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {wasteQuery.isLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              ) : wasteQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load waste analytics</AlertTitle>
                  <AlertDescription>
                    {wasteQuery.error instanceof Error ? wasteQuery.error.message : "Unknown error"}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {wasteByReasonChartData.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Waste cost by reason
                      </p>
                      <ChartContainer config={wasteChartConfig} className="aspect-[unset] h-64 w-full">
                        <BarChart
                          accessibilityLayer
                          data={wasteByReasonChartData}
                          margin={{ left: 4, right: 8, top: 8, bottom: 36 }}
                        >
                          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                          <XAxis
                            dataKey="reason"
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                            tick={{ fontSize: 10 }}
                            angle={-22}
                            textAnchor="end"
                            height={52}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) =>
                              typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                            }
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="cost" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={52} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={!wasteQuery.data?.length}
                        onClick={exportWasteCsv}
                      >
                        <Download className="size-3.5" />
                        Export CSV
                      </Button>
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ingredient</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead className="text-right">Δ qty</TableHead>
                            <TableHead className="text-right">Movements</TableHead>
                            <TableHead className="text-right">Cost total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wasteQuery.data?.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                                No waste rows for this range.
                              </TableCell>
                            </TableRow>
                          ) : (
                            wasteQuery.data?.map((row, i) => (
                              <TableRow
                                key={`${row.ingredientId ?? row.ingredient?.name ?? "x"}-${row.wasteReasonCode}-${i}`}
                              >
                                <TableCell>
                                  <div className="font-medium">{row.ingredient?.name || "—"}</div>
                                  <div className="text-muted-foreground text-xs">
                                    {row.ingredient?.sku ? `SKU ${row.ingredient.sku}` : ""}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{row.wasteReasonCode || "—"}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {fmtQty(row.quantityDelta)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">{row.movementCount}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {fmtMoney(row.costTotal)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="price" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Ingredient price history</CardTitle>
              <CardDescription>Recorded unit costs from receiving and adjustments (newest first).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <div className="space-y-2 sm:min-w-[240px]">
                  <Label>Ingredient</Label>
                  <Select value={priceIngredientId} onValueChange={setPriceIngredientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="All ingredients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All ingredients</SelectItem>
                      {priceTabIngredients.map((ing) => (
                        <SelectItem key={ing._id} value={ing._id}>
                          {ing.name || ing._id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price-limit">Limit</Label>
                  <Input
                    id="price-limit"
                    type="number"
                    min={1}
                    max={500}
                    className="w-28"
                    value={priceLimit}
                    onChange={(e) => setPriceLimit(e.target.value)}
                  />
                </div>
              </div>

              {priceQuery.isLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              ) : priceQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load price history</AlertTitle>
                  <AlertDescription>
                    {priceQuery.error instanceof Error ? priceQuery.error.message : "Unknown error"}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {priceIngredientId !== "__all__" && priceTrendChartData.length >= 2 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Unit price trend (oldest → newest in range)
                      </p>
                      <ChartContainer config={priceChartConfig} className="aspect-[unset] h-56 w-full">
                        <LineChart
                          accessibilityLayer
                          data={priceTrendChartData}
                          margin={{ left: 4, right: 8, top: 8, bottom: 8 }}
                        >
                          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={48}
                            tickFormatter={(v) => (typeof v === "number" ? fmtMoney(v) : String(v))}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="hsl(var(--chart-5))"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "hsl(var(--chart-5))" }}
                          />
                        </LineChart>
                      </ChartContainer>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={!priceQuery.data?.length}
                        onClick={exportPriceHistoryCsv}
                      >
                        <Download className="size-3.5" />
                        Export CSV
                      </Button>
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>When</TableHead>
                            <TableHead>Ingredient</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-right">Unit price</TableHead>
                            <TableHead>Note</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {priceQuery.data?.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                                No price history rows.
                              </TableCell>
                            </TableRow>
                          ) : (
                            priceQuery.data?.map((row) => (
                              <TableRow key={row._id}>
                                <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                                  {row.createdAt ? format(new Date(row.createdAt), "yyyy-MM-dd HH:mm") : "—"}
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{row.ingredient?.name || "—"}</div>
                                  <div className="text-muted-foreground text-xs">
                                    {row.ingredient?.sku ? `SKU ${row.ingredient.sku}` : ""}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{row.source || "—"}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {fmtMoney(row.unitPrice)}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                                  {row.note || "—"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
