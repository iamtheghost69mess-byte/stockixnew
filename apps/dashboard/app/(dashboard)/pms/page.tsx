"use client";

import { useEffect, useState } from "react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { fetchPmsTenants, pmsJson, type PmsTenantOption } from "@/lib/pms-api";

type OccupancyData = {
  totalRooms: number;
  totalBookings: number;
  averageOccupancyRate: number;
};

type RevenueData = {
  totalBookings: number;
  totalRevenueCents: number;
  totalCollectedCents: number;
  outstandingCents: number;
};

function formatPercent(rate: number | undefined): string {
  if (typeof rate !== "number" || Number.isNaN(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

function formatMoney(cents: number | undefined): string {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

export default function PmsOverviewPage() {
  const { tenantId, setTenantId } = usePmsTenant();
  const [tenants, setTenants] = useState<PmsTenantOption[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const selectedTenant = tenants.find((t) => t.tenantId === tenantId);

  useEffect(() => {
    void (async () => {
      setTenantsLoading(true);
      const list = await fetchPmsTenants();
      setTenants(list);
      setTenantsLoading(false);
      if (!tenantId && list[0]) setTenantId(list[0].tenantId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      setApiError(null);
      setOccupancy(null);
      setRevenue(null);
      const today = new Date().toISOString().slice(0, 10);
      const [occ, rev] = await Promise.all([
        pmsJson<OccupancyData>(
          `reports/occupancy?from=${today}&to=${today}`,
          tenantId,
        ),
        pmsJson<RevenueData>("reports/revenue", tenantId),
      ]);
      if (!occ.ok || !rev.ok) {
        setApiError(
          "PMS API is not reachable. Restart with pnpm dev and confirm [pms] is listening (port 3003 or next free port).",
        );
        return;
      }
      setOccupancy(occ.data);
      setRevenue(rev.data);
    })();
  }, [tenantId]);

  return (
    <PmsPageShell
      title="PMS"
      description="Property management for tenants with the PMS module licensed."
    >
      <div className="max-w-sm space-y-2">
        {tenantsLoading ? (
          <p className="text-sm text-muted-foreground">Loading tenants…</p>
        ) : (
          <Select
            key={tenants.map((t) => t.tenantId).join(",")}
            value={tenantId || undefined}
            onValueChange={setTenantId}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  selectedTenant
                    ? `${selectedTenant.name} (${selectedTenant.slug})`
                    : "Select tenant"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.tenantId} value={t.tenantId}>
                  {t.name} <span className="text-muted-foreground">({t.slug})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!tenantsLoading && tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tenants have the PMS module. Run{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm db:seed:pms-demo</code>{" "}
            for a local demo tenant, or open{" "}
            <a href="/tenants" className="font-medium text-primary underline-offset-4 hover:underline">
              Tenants
            </a>{" "}
            → add the PMS license.
          </p>
        ) : null}
      </div>

      {apiError ? (
        <Alert variant="destructive">
          <AlertTitle>PMS API unavailable</AlertTitle>
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      ) : null}

      {tenantId ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Rooms</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {occupancy?.totalRooms ?? "—"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Occupancy</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {formatPercent(occupancy?.averageOccupancyRate)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {revenue?.totalBookings ?? "—"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {formatMoney(revenue?.totalRevenueCents)}
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Select a tenant to view data.</p>
      )}
    </PmsPageShell>
  );
}
