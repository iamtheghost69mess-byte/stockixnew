"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Globe2,
  Info,
  Landmark,
  Loader2,
  Percent,
  Receipt,
  RotateCcw,
  Save,
  Scale,
} from "lucide-react";
import { toast } from "sonner";

import { TaxFxRatesPanel } from "./tax-fx-rates-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AccountingConfigDoc, posFetchAccountingConfig, posUpdateAccountingConfig } from "@/lib/pos-accounting-api";
import { posFetchTaxConfig, posUpdateTaxConfig } from "@/lib/pos-config-api";
import { getPosLocationScopeId } from "@/lib/pos-location-scope";
import { posQueryKeys } from "@/lib/pos-query-keys";
import { cn } from "@/lib/utils";

type TaxPageQueryData = {
  accountingConfig: AccountingConfigDoc | null;
  legacyRatePercent: number;
};

function getReferenceId(value: string | { _id?: string } | null | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && typeof value._id === "string" && value._id.trim()) return value._id;
  return null;
}

function normalizeTaxCode(code: string | undefined): string {
  return (code || "").trim().toLowerCase();
}

function resolveInitialRatePercent(data: TaxPageQueryData | undefined): number {
  if (!data) return 15;
  const taxRates = Array.isArray(data.accountingConfig?.taxRates) ? data.accountingConfig.taxRates : [];
  const standardSalesRate = taxRates.find(
    (row) => normalizeTaxCode(row.code) === "standard" && (row.kind || "sales") === "sales",
  );
  if (typeof standardSalesRate?.rate === "number") return standardSalesRate.rate;
  const firstSalesRate = taxRates.find((row) => (row.kind || "sales") === "sales");
  if (typeof firstSalesRate?.rate === "number") return firstSalesRate.rate;
  return data.legacyRatePercent;
}

function branchVatRateFromConfig(
  accountingConfig: AccountingConfigDoc | null | undefined,
  locationId: string | null,
): number | null {
  if (!locationId) return null;
  const rows = Array.isArray(accountingConfig?.branchVatRates) ? accountingConfig.branchVatRates : [];
  const row = rows.find((entry) => {
    const loc = entry?.location;
    if (typeof loc === "string") return loc === locationId;
    if (loc && typeof loc === "object" && typeof loc._id === "string") return loc._id === locationId;
    return false;
  });
  const value = Number(row?.ratePercent);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function TaxPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 md:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-9 w-44 shrink-0" />
      </div>
      <Skeleton className="h-12 w-full max-w-lg rounded-lg" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full sm:w-32" />
        </CardFooter>
      </Card>
    </div>
  );
}

export function TaxSettingsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabFromUrl: "vat" | "fx" = searchParams.get("tab") === "fx" ? "fx" : "vat";
  const [activeTab, setActiveTabState] = useState<"vat" | "fx">(tabFromUrl);

  useEffect(() => {
    setActiveTabState(tabFromUrl);
  }, [tabFromUrl]);

  const setActiveTab = useCallback(
    (next: "vat" | "fx") => {
      setActiveTabState(next);
      const base = pathname.split("?")[0] ?? pathname;
      router.replace(next === "fx" ? `${base}?tab=fx` : base, { scroll: false });
    },
    [pathname, router],
  );

  const queryClient = useQueryClient();
  const [ratePercent, setRatePercent] = useState<number>(15);
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [serviceChargeRate, setServiceChargeRate] = useState<number>(0);
  const [locationScopeId, setLocationScopeId] = useState<string | null>(null);

  useEffect(() => {
    setLocationScopeId(getPosLocationScopeId());
  }, []);

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["tax-config-page"],
    queryFn: async (): Promise<TaxPageQueryData> => {
      const [accountingConfig, legacyTaxConfig] = await Promise.all([posFetchAccountingConfig(), posFetchTaxConfig()]);
      return {
        accountingConfig,
        legacyRatePercent: legacyTaxConfig.data?.ratePercent ?? 0,
      };
    },
  });

  useEffect(() => {
    const branchRate = branchVatRateFromConfig(pageData?.accountingConfig, locationScopeId);
    setRatePercent(branchRate ?? resolveInitialRatePercent(pageData));
    setServiceChargeEnabled(pageData?.accountingConfig?.serviceChargeEnabled === true);
    setServiceChargeRate(Number(pageData?.accountingConfig?.serviceChargeRate ?? 0));
  }, [locationScopeId, pageData]);

  const updateMutation = useMutation({
    mutationFn: async (payload: { ratePercent: number }) => {
      const nextRatePercent = Number(payload.ratePercent);
      if (Number.isNaN(nextRatePercent) || nextRatePercent < 0 || nextRatePercent > 100) {
        throw new Error("Tax rate must be between 0 and 100.");
      }
      const nextServiceChargeRate = Number(serviceChargeRate);
      if (Number.isNaN(nextServiceChargeRate) || nextServiceChargeRate < 0 || nextServiceChargeRate > 100) {
        throw new Error("Service charge rate must be between 0 and 100.");
      }

      const accountingConfig = pageData?.accountingConfig;
      if (!accountingConfig) {
        throw new Error("Accounting config is missing. Open Accounting Settings and click Ensure Defaults first.");
      }

      const currentTaxRates = Array.isArray(accountingConfig.taxRates) ? accountingConfig.taxRates : [];
      const standardSalesIndex = currentTaxRates.findIndex(
        (row) => normalizeTaxCode(row.code) === "standard" && (row.kind || "sales") === "sales",
      );
      const firstSalesIndex = currentTaxRates.findIndex((row) => (row.kind || "sales") === "sales");
      const targetIndex = standardSalesIndex >= 0 ? standardSalesIndex : firstSalesIndex;

      const defaultTaxPayableAccountId = getReferenceId(accountingConfig.defaultTaxPayableAccount);
      const existingAccountId = targetIndex >= 0 ? getReferenceId(currentTaxRates[targetIndex]?.account) : null;
      const resolvedAccountId = existingAccountId ?? defaultTaxPayableAccountId;

      if (!resolvedAccountId) {
        throw new Error("Set a Tax payable account in Accounting Settings before saving VAT here.");
      }
      if (serviceChargeEnabled && !getReferenceId(accountingConfig.defaultServiceChargePayableAccount)) {
        throw new Error("Set Service charge payable account in Accounting Settings before enabling service charge.");
      }

      const nextTaxRates =
        targetIndex >= 0
          ? currentTaxRates.map((row, index) =>
              index === targetIndex ? { ...row, rate: nextRatePercent, account: resolvedAccountId } : row,
            )
          : [
              ...currentTaxRates,
              {
                code: "standard",
                name: "VAT",
                rate: nextRatePercent,
                kind: "sales" as const,
                account: resolvedAccountId,
              },
            ];

      const accountingPayload: Parameters<typeof posUpdateAccountingConfig>[0] = {
        serviceChargeEnabled,
        serviceChargeRate: Number(nextServiceChargeRate.toFixed(2)),
      };
      if (locationScopeId) {
        accountingPayload.branchVatRatePercent = nextRatePercent;
      } else {
        accountingPayload.taxRates = nextTaxRates;
      }
      await Promise.all([
        posUpdateAccountingConfig(accountingPayload),
        posUpdateTaxConfig({ ratePercent: nextRatePercent }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-config-page"] });
      queryClient.invalidateQueries({ queryKey: ["tax-config"] });
      queryClient.invalidateQueries({ queryKey: posQueryKeys.accountingConfig() });
      toast.success("Tax configuration updated.");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to update tax.";
      toast.error(message);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ ratePercent: Number(ratePercent.toFixed(2)) });
  };

  if (isLoading) {
    return <TaxPageSkeleton />;
  }

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-8 px-4 py-8 md:px-6 md:py-10">
      {/* Breadcrumb trail */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm">
        <Link href="/dashboard" className="transition-colors hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
        <span className="font-medium text-foreground">Tax &amp; treasury</span>
      </nav>

      {/* Page hero */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl",
              "bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20",
            )}
          >
            <Scale className="size-7" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h1 className="font-semibold text-2xl text-foreground tracking-tight md:text-3xl">Tax &amp; treasury</h1>
            <p className="max-w-xl text-muted-foreground text-sm leading-relaxed md:text-[15px]">
              Configure VAT, service charge, and foreign-exchange spot rates for this organization. Accounting GL
              links are managed in settings.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 shadow-xs" asChild>
          <Link href="/dashboard/accounting/settings">
            <Landmark className="mr-2 size-4" />
            GL settings
          </Link>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "vat" | "fx")} className="flex flex-col gap-6">
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2 gap-1 p-1 sm:inline-flex sm:w-full sm:max-w-xl">
          <TabsTrigger value="vat" className="gap-2 px-4 py-3 sm:flex-1">
            <Percent className="size-4 shrink-0 opacity-70" />
            <span className="flex flex-col items-start gap-0.5 text-left">
              <span className="leading-none">VAT &amp; charges</span>
              <span className="font-normal text-[11px] text-muted-foreground leading-tight sm:inline">
                Rates &amp; fees
              </span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="fx" className="gap-2 px-4 py-3 sm:flex-1">
            <Globe2 className="size-4 shrink-0 opacity-70" />
            <span className="flex flex-col items-start gap-0.5 text-left">
              <span className="leading-none">Exchange rates</span>
              <span className="font-normal text-[11px] text-muted-foreground leading-tight sm:inline">
                Multi-currency
              </span>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vat" className="mt-0 space-y-6 outline-none focus-visible:outline-none">
          <Alert className="border-border/80 shadow-xs">
            <Info className="size-4" />
            <AlertTitle>Before you save</AlertTitle>
            <AlertDescription className="text-muted-foreground leading-relaxed">
              Align percentages with your jurisdiction. Updates apply to <strong className="text-foreground">new</strong>{" "}
              orders and the accounting tax table. Map tax and service accounts under GL settings if prompted.
            </AlertDescription>
          </Alert>

          <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
            <CardHeader className="border-b bg-muted/30 pb-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">Branch tax settings</CardTitle>
                  <CardDescription>Standard VAT, display defaults, and optional service charge (one save).</CardDescription>
                </div>
                <CardAction>
                  <span className="inline-flex items-center rounded-md border bg-background px-2 py-1 font-mono text-muted-foreground text-xs tabular-nums">
                    VAT {Number.isFinite(ratePercent) ? ratePercent : 0}%
                  </span>
                </CardAction>
              </div>
            </CardHeader>

            <CardContent className="space-y-8 pt-6">
              <section className="space-y-4" aria-labelledby="tax-vat-heading">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Percent className="size-4" />
                  </div>
                  <h2 id="tax-vat-heading" className="font-medium text-base text-foreground">
                    Value added tax
                  </h2>
                </div>
                {locationScopeId ? (
                  <p className="text-muted-foreground text-xs">Editing VAT for current branch scope.</p>
                ) : (
                  <p className="text-muted-foreground text-xs">No branch scope selected. Editing default organization VAT.</p>
                )}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vat-rate" className="text-foreground">
                      Standard rate (%)
                    </Label>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      Applied to taxable sales (F&amp;B). Synced to the accounting tax rate table.
                    </p>
                    <div className="relative">
                      <Input
                        id="vat-rate"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={ratePercent}
                        onChange={(e) => setRatePercent(parseFloat(e.target.value) || 0)}
                        className="h-11 pr-9 font-mono tabular-nums"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground text-sm">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vat-label" className="text-foreground">
                      Register label
                    </Label>
                    <p className="text-muted-foreground text-xs leading-relaxed">Shown on receipts and tax lines.</p>
                    <Input id="vat-label" defaultValue="VAT" disabled className="h-11 bg-muted/40" />
                  </div>
                </div>

                <div
                  className={cn(
                    "flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between",
                    "transition-colors hover:bg-muted/25",
                  )}
                >
                  <div className="space-y-1">
                    <Label htmlFor="prices-tax-switch" className="text-foreground">
                      Prices include tax
                    </Label>
                    <p className="max-w-md text-muted-foreground text-xs leading-relaxed">
                      When enabled, menu prices are gross of VAT (informational; full pricing rules may live in menu
                      tools).
                    </p>
                  </div>
                  <Switch id="prices-tax-switch" defaultChecked className="shrink-0" />
                </div>
              </section>

              <Separator />

              <section className="space-y-4" aria-labelledby="tax-sc-heading">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Receipt className="size-4 opacity-80" />
                  </div>
                  <h2 id="tax-sc-heading" className="font-medium text-base text-foreground">
                    Service charge
                  </h2>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Optional percentage on order subtotal. Requires a payable account in GL settings when enabled.
                </p>
                <div
                  className={cn(
                    "flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
                  )}
                >
                  <div className="space-y-1">
                    <Label htmlFor="sc-enabled" className="text-foreground">
                      Enable on orders
                    </Label>
                    <p className="text-muted-foreground text-xs">Adds the configured % to eligible subtotals.</p>
                  </div>
                  <Switch
                    id="sc-enabled"
                    checked={serviceChargeEnabled}
                    onCheckedChange={setServiceChargeEnabled}
                    className="shrink-0"
                  />
                </div>
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="sc-rate" className={cn(!serviceChargeEnabled && "text-muted-foreground")}>
                    Charge rate (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="sc-rate"
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={serviceChargeRate}
                      onChange={(e) => setServiceChargeRate(parseFloat(e.target.value) || 0)}
                      disabled={!serviceChargeEnabled}
                      className="h-11 pr-9 font-mono tabular-nums disabled:opacity-60"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                </div>
              </section>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 py-5 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" type="button" onClick={() => setRatePercent(15)} className="text-muted-foreground">
                <RotateCcw className="mr-2 size-4" />
                Reset VAT to 15%
              </Button>
              <Button type="button" size="lg" className="min-w-[160px] shadow-sm" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 size-4" />
                    Save changes
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="fx" className="mt-0 outline-none focus-visible:outline-none">
          <TaxFxRatesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
