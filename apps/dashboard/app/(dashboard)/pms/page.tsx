"use client";

import { useEffect, useState } from "react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

type TenantRow = { tenantId: string; name: string; slug: string; modules?: string };

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

export default function PmsOverviewPage() {
  const { tenantId, setTenantId } = usePmsTenant();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/tenants?pageSize=100");
      const data = (await res.json()) as { tenants?: TenantRow[] };
      const list = (data.tenants ?? []).filter((t) => {
        try {
          const mods = JSON.parse(t.modules ?? '["accounting"]') as string[];
          return mods.includes("pms");
        } catch {
          return false;
        }
      });
      setTenants(list);
      if (!tenantId && list[0]) setTenantId(list[0].tenantId);
    })();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [occRes, revRes] = await Promise.all([
        pmsFetch(`reports/occupancy?from=${today}&to=${today}`, tenantId),
        pmsFetch("reports/revenue", tenantId),
      ]);
      setOccupancy((await occRes.json()) as OccupancyData);
      setRevenue((await revRes.json()) as RevenueData);
    })();
  }, [tenantId]);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  return (
    <PmsPageShell
      title="PMS"
      description="Property management for tenants with the PMS module licensed."
    >
      <div className="max-w-sm space-y-2">
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger>
            <SelectValue placeholder="Select tenant" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.tenantId} value={t.tenantId}>
                {t.name} <span className="text-muted-foreground">({t.slug})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tenants have the PMS module. Run{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm db:seed:pms-demo</code>{" "}
            for a local demo tenant, or open{" "}
            <a href="/tenants" className="font-medium text-primary underline-offset-4 hover:underline">
              Tenants
            </a>{" "}
            → pick a tenant → add the PMS license under Licensed modules.
          </p>
        ) : null}
      </div>

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
              <CardTitle className="text-sm font-medium">Today's Occupancy</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {occupancy ? `${Math.round(occupancy.averageOccupancyRate * 100)}%` : "—"}
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
              {revenue ? fmt(revenue.totalRevenueCents) : "—"}
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Select a tenant to view data.</p>
      )}
    </PmsPageShell>
  );
}
