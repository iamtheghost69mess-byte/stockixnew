"use client";

import { useEffect, useState } from "react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PmsTenantSelect } from "@/components/pms-tenant-select";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsJson } from "@/lib/pms-api";

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
  const { tenantId, ready } = usePmsTenant();
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !tenantId) return;
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
          "PMS API is not reachable. Run pnpm dev in the repo root (starts PMS on port 3003 and tenant UI on 3004), then refresh.",
        );
        return;
      }
      setOccupancy(occ.data);
      setRevenue(rev.data);
    })();
  }, [tenantId, ready]);

  return (
    <PmsPageShell
      title="PMS"
      description="Property management for tenants with the PMS module licensed."
    >
      <PmsTenantSelect />

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
