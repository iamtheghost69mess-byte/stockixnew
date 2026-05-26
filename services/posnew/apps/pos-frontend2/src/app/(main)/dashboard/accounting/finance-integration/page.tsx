"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchIngredients } from "@/lib/inventory-api";
import { posFetchMenuItems } from "@/lib/pos-catalog-api";
import { posFetchSuppliers } from "@/lib/pos-procurement-api";
import {
  posDeleteIngredientMapping,
  posDeleteItemMapping,
  posDeleteVendorMapping,
  posFetchIngredientMappings,
  posFetchIntegrationEvents,
  posFetchIntegrationOutbox,
  posFetchIntegrationSyncStatus,
  posFetchItemMappings,
  posFetchMappingCoverage,
  posFetchVendorMappings,
  posRetryOutboxRow,
  posTestFinanceConnection,
  posUpsertIngredientMapping,
  posUpsertItemMapping,
  posUpsertVendorMapping,
} from "@/lib/pos-integration-api";
import { posQueryKeys } from "@/lib/pos-query-keys";

function refName(v: string | { _id?: string; name?: string } | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(-8);
  return v.name || String(v._id || "").slice(-8);
}

function refId(v: string | { _id?: string } | undefined): string {
  if (!v) return "";
  return typeof v === "string" ? v : String(v._id || "");
}

type TabKey = "menu" | "ingredients" | "vendors" | "outbox";

export default function FinanceIntegrationPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("menu");

  const [menuItemId, setMenuItemId] = useState("");
  const [menuFinanceItemId, setMenuFinanceItemId] = useState("");
  const [menuFinanceItemName, setMenuFinanceItemName] = useState("");

  const [ingredientId, setIngredientId] = useState("");
  const [ingFinanceItemId, setIngFinanceItemId] = useState("");
  const [ingFinanceItemName, setIngFinanceItemName] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [financeVendorId, setFinanceVendorId] = useState("");
  const [financeVendorName, setFinanceVendorName] = useState("");

  const syncQ = useQuery({
    queryKey: ["integration", "sync-status"],
    queryFn: posFetchIntegrationSyncStatus,
    refetchInterval: 30_000,
  });

  const coverageQ = useQuery({
    queryKey: ["integration", "mapping-coverage"],
    queryFn: posFetchMappingCoverage,
  });

  const itemMappingsQ = useQuery({
    queryKey: ["integration", "item-mappings"],
    queryFn: posFetchItemMappings,
  });

  const ingredientMappingsQ = useQuery({
    queryKey: ["integration", "ingredient-mappings"],
    queryFn: posFetchIngredientMappings,
  });

  const vendorMappingsQ = useQuery({
    queryKey: ["integration", "vendor-mappings"],
    queryFn: posFetchVendorMappings,
  });

  const outboxQ = useQuery({
    queryKey: ["integration", "outbox"],
    queryFn: () => posFetchIntegrationOutbox({ limit: 40 }),
    refetchInterval: 30_000,
  });

  const eventsQ = useQuery({
    queryKey: ["integration", "events"],
    queryFn: posFetchIntegrationEvents,
  });

  const menuItemsQ = useQuery({
    queryKey: posQueryKeys.menuItems(),
    queryFn: () => posFetchMenuItems({ available: true }),
  });

  const ingredientsQ = useQuery({
    queryKey: ["ingredients", "active"],
    queryFn: () => fetchIngredients({ status: "active" }),
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await posFetchSuppliers({ limit: 200 })).data,
  });

  const testConnection = useMutation({
    mutationFn: posTestFinanceConnection,
    onSuccess: (res) => {
      if (res?.success) toast.success(res.message || "Finance connection OK");
      else toast.error("Connection check failed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connection failed"),
  });

  const saveMenuMapping = useMutation({
    mutationFn: () =>
      posUpsertItemMapping({
        posMenuItemId: menuItemId,
        bigcapitalItemId: Number(menuFinanceItemId),
        bigcapitalItemName: menuFinanceItemName || undefined,
      }),
    onSuccess: () => {
      toast.success("Menu item mapping saved");
      void queryClient.invalidateQueries({ queryKey: ["integration"] });
      setMenuFinanceItemId("");
      setMenuFinanceItemName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const saveIngredientMapping = useMutation({
    mutationFn: () =>
      posUpsertIngredientMapping({
        posIngredientId: ingredientId,
        bigcapitalItemId: Number(ingFinanceItemId),
        bigcapitalItemName: ingFinanceItemName || undefined,
      }),
    onSuccess: () => {
      toast.success("Ingredient mapping saved");
      void queryClient.invalidateQueries({ queryKey: ["integration"] });
      setIngFinanceItemId("");
      setIngFinanceItemName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const saveVendorMapping = useMutation({
    mutationFn: () =>
      posUpsertVendorMapping({
        posSupplierId: supplierId,
        bigcapitalVendorId: Number(financeVendorId),
        bigcapitalVendorName: financeVendorName || undefined,
      }),
    onSuccess: () => {
      toast.success("Vendor mapping saved");
      void queryClient.invalidateQueries({ queryKey: ["integration"] });
      setFinanceVendorId("");
      setFinanceVendorName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const coverage = coverageQ.data;
  const sync = syncQ.data;

  const bridgeReady = coverage?.bridgeReady ?? false;

  const tabButtons: { key: TabKey; label: string }[] = [
    { key: "menu", label: "Menu items" },
    { key: "ingredients", label: "Ingredients" },
    { key: "vendors", label: "Vendors" },
    { key: "outbox", label: "Sync outbox" },
  ];

  const unmappedMenu = useMemo(
    () => coverage?.sales.unmappedMenuItems ?? [],
    [coverage]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Accounting
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Finance bridge</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            Map POS catalog and inventory to Stockix Finance before paid orders and GRNs sync.
            Partial unmapped menu lines block sale receipts by default.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testConnection.isPending}
            onClick={() => testConnection.mutate()}
          >
            {testConnection.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : null}
            Test connection
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["integration"] });
            }}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Integration</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {sync?.enabled ? (
              <Badge variant="secondary" className="mb-2">
                Enabled
              </Badge>
            ) : (
              <Badge variant="outline" className="mb-2">
                Disabled
              </Badge>
            )}
            <p className="text-muted-foreground">
              Status: <span className="font-mono">{sync?.syncStatus ?? "—"}</span>
            </p>
            {sync?.lastSyncError ? (
              <p className="mt-1 text-destructive text-xs">{sync.lastSyncError}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales mapping</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              {coverage?.sales.mappedMenuItemCount ?? 0} /{" "}
              {coverage?.sales.sellableMenuItemCount ?? 0} sellable items mapped
            </p>
            {coverage?.sales.ready ? (
              <p className="mt-2 flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Ready
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <TriangleAlert className="h-4 w-4" /> Incomplete
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Inventory mapping</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              {coverage?.inventory.mappedIngredientCount ?? 0} /{" "}
              {coverage?.inventory.ingredientCount ?? 0} ingredients
            </p>
            <p className="text-muted-foreground">
              Default vendor ID:{" "}
              <span className="font-mono">
                {coverage?.inventory.defaultVendorId ?? "—"}
              </span>
            </p>
            {coverage?.inventory.ready ? (
              <p className="mt-2 flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Ready
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <TriangleAlert className="h-4 w-4" /> Incomplete
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={bridgeReady ? "border-emerald-600/40" : "border-amber-600/40"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {bridgeReady ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-600" />
            )}
            Bridge {bridgeReady ? "ready" : "not ready"}
          </CardTitle>
          <CardDescription>
            Finance tenant ID:{" "}
            <span className="font-mono">{coverage?.financeTenantId ?? "—"}</span>
            {sync?.queueAvailable ? (
              <>
                {" "}
                · Queue waiting {sync.queue?.waiting ?? 0}, failed{" "}
                {sync.queue?.failed ?? 0}
              </>
            ) : (
              " · Redis queue unavailable — outbox will drain on worker interval"
            )}
          </CardDescription>
        </CardHeader>
        {unmappedMenu.length > 0 && tab !== "menu" ? (
          <CardContent className="text-sm text-muted-foreground">
            {unmappedMenu.length} unmapped menu item(s) — open Menu items tab to fix.
          </CardContent>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabButtons.map((t) => (
          <Button
            key={t.key}
            type="button"
            size="sm"
            variant={tab === t.key ? "default" : "ghost"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "menu" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add menu → Finance item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>POS menu item</Label>
                <Select value={menuItemId} onValueChange={setMenuItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {(menuItemsQ.data ?? []).map((m) => (
                      <SelectItem key={m._id} value={m._id}>
                        {m.name}
                        {m.sku ? ` (${m.sku})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Finance item ID</Label>
                <Input
                  value={menuFinanceItemId}
                  onChange={(e) => setMenuFinanceItemId(e.target.value)}
                  placeholder="e.g. 42"
                />
              </div>
              <div className="space-y-2">
                <Label>Finance item name (optional)</Label>
                <Input
                  value={menuFinanceItemName}
                  onChange={(e) => setMenuFinanceItemName(e.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={!menuItemId || !menuFinanceItemId || saveMenuMapping.isPending}
                onClick={() => saveMenuMapping.mutate()}
              >
                Save mapping
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Existing mappings</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {(itemMappingsQ.data ?? []).map((row) => (
                <div
                  key={row._id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{refName(row.posMenuItemId)}</p>
                    <p className="text-muted-foreground text-xs font-mono">
                      Finance #{row.bigcapitalItemId}
                      {row.bigcapitalItemName ? ` · ${row.bigcapitalItemName}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void posDeleteItemMapping(refId(row.posMenuItemId)).then(() => {
                        toast.success("Removed");
                        void queryClient.invalidateQueries({ queryKey: ["integration"] });
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "ingredients" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add ingredient → Finance item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>POS ingredient</Label>
                <Select value={ingredientId} onValueChange={setIngredientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ingredient" />
                  </SelectTrigger>
                  <SelectContent>
                    {(ingredientsQ.data ?? []).map((ing) => (
                      <SelectItem key={ing._id} value={ing._id}>
                        {ing.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Finance inventory item ID</Label>
                <Input
                  value={ingFinanceItemId}
                  onChange={(e) => setIngFinanceItemId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input
                  value={ingFinanceItemName}
                  onChange={(e) => setIngFinanceItemName(e.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={
                  !ingredientId || !ingFinanceItemId || saveIngredientMapping.isPending
                }
                onClick={() => saveIngredientMapping.mutate()}
              >
                Save mapping
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ingredient mappings</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {(ingredientMappingsQ.data ?? []).map((row) => (
                <div
                  key={row._id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{refName(row.posIngredientId)}</p>
                    <p className="text-muted-foreground text-xs font-mono">
                      Finance item #{row.bigcapitalItemId}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void posDeleteIngredientMapping(refId(row.posIngredientId)).then(
                        () => {
                          toast.success("Removed");
                          void queryClient.invalidateQueries({
                            queryKey: ["integration"],
                          });
                        }
                      );
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "vendors" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add supplier → Finance vendor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>POS supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(suppliersQ.data) ? suppliersQ.data : []).map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Finance vendor ID</Label>
                <Input
                  value={financeVendorId}
                  onChange={(e) => setFinanceVendorId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input
                  value={financeVendorName}
                  onChange={(e) => setFinanceVendorName(e.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={
                  !supplierId || !financeVendorId || saveVendorMapping.isPending
                }
                onClick={() => saveVendorMapping.mutate()}
              >
                Save mapping
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendor mappings</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {(vendorMappingsQ.data ?? []).map((row) => (
                <div
                  key={row._id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{refName(row.posSupplierId)}</p>
                    <p className="text-muted-foreground text-xs font-mono">
                      Finance vendor #{row.bigcapitalVendorId}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void posDeleteVendorMapping(refId(row.posSupplierId)).then(() => {
                        toast.success("Removed");
                        void queryClient.invalidateQueries({ queryKey: ["integration"] });
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "outbox" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event types</CardTitle>
              <CardDescription>Cross-product bridge catalog (read-only)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {(eventsQ.data ?? []).map((ev) => (
                <div key={ev.eventType} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-mono font-medium">{ev.eventType}</p>
                  <p className="text-muted-foreground text-xs">{ev.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent outbox</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(outboxQ.data ?? []).map((row) => (
                <div
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-mono">
                      {row.eventType} · {row.status}
                    </p>
                    <p className="text-muted-foreground text-xs truncate">
                      {row.originatedBy || "—"} · {row.idempotencyKey}
                    </p>
                    {row.lastError ? (
                      <p className="text-destructive text-xs">{row.lastError}</p>
                    ) : null}
                  </div>
                  {row.status === "failed" || row.status === "pending" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void posRetryOutboxRow(row._id).then(() => {
                          toast.success("Retry queued");
                          void queryClient.invalidateQueries({
                            queryKey: ["integration", "outbox"],
                          });
                        });
                      }}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
