"use client";

import { useEffect, useState } from "react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

type OccupancyDay = { date: string; occupied: number; rate: number };
type OccupancyReport = {
  totalRooms: number;
  totalBookings: number;
  averageOccupancyRate: number;
  days: OccupancyDay[];
};

type RevenueReport = {
  totalBookings: number;
  totalRevenueCents: number;
  totalCollectedCents: number;
  outstandingCents: number;
  byMonth: Record<string, { bookings: number; revenueCents: number }>;
  byPlatform: Record<string, { bookings: number; revenueCents: number }>;
};

type GuestsReport = {
  totalGuests: number;
  totalBookings: number;
  avgBookingsPerGuest: number;
  byStatus: { confirmed: number; checked_in: number; checked_out: number };
};

export default function PmsReportsPage() {
  const { tenantId } = usePmsTenant();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [occupancy, setOccupancy] = useState<OccupancyReport | null>(null);
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [guests, setGuests] = useState<GuestsReport | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setApiError(null);
    void (async () => {
      try {
        const [occRes, revRes, gRes] = await Promise.all([
          pmsFetch(`reports/occupancy?from=${from}&to=${to}`, tenantId),
          pmsFetch(`reports/revenue?from=${from}&to=${to}`, tenantId),
          pmsFetch("reports/guests", tenantId),
        ]);
        if (!occRes.ok || !revRes.ok || !gRes.ok) {
          setApiError("Failed to load reports. Is the PMS API running?");
          return;
        }
        setOccupancy((await occRes.json()) as OccupancyReport);
        setRevenue((await revRes.json()) as RevenueReport);
        setGuests((await gRes.json()) as GuestsReport);
      } catch {
        setApiError("Network error loading reports.");
      }
    })();
  }, [tenantId, from, to]);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  if (!tenantId) {
    return (
      <PmsPageShell title="Reports">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Reports" description="Occupancy, revenue, and guest analytics.">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
        </div>
      </div>

      {apiError ? (
        <p className="text-sm text-destructive">{apiError}</p>
      ) : null}

      <Tabs defaultValue="occupancy">
        <TabsList>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="guests">Guests</TabsTrigger>
        </TabsList>

        <TabsContent value="occupancy" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Total rooms</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{occupancy?.totalRooms ?? "—"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Active bookings</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{occupancy?.totalBookings ?? "—"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Avg occupancy</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">
                {occupancy ? `${Math.round(occupancy.averageOccupancyRate * 100)}%` : "—"}
              </CardContent>
            </Card>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Occupied rooms</TableHead>
                  <TableHead>Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(occupancy?.days ?? []).slice(0, 31).map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="tabular-nums">{d.date}</TableCell>
                    <TableCell>{d.occupied}</TableCell>
                    <TableCell className="tabular-nums">{Math.round(d.rate * 100)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Bookings</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{revenue?.totalBookings ?? "—"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Total revenue</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">
                {revenue ? fmt(revenue.totalRevenueCents) : "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Collected</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">
                {revenue ? fmt(revenue.totalCollectedCents) : "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold text-yellow-600">
                {revenue ? fmt(revenue.outstandingCents) : "—"}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">By month</p>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Bookings</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(revenue?.byMonth ?? {}).sort(([a], [b]) => b.localeCompare(a)).map(([month, data]) => (
                      <TableRow key={month}>
                        <TableCell className="tabular-nums">{month}</TableCell>
                        <TableCell>{data.bookings}</TableCell>
                        <TableCell className="tabular-nums">{fmt(data.revenueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">By platform</p>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Bookings</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(revenue?.byPlatform ?? {}).sort(([, a], [, b]) => b.revenueCents - a.revenueCents).map(([platform, data]) => (
                      <TableRow key={platform}>
                        <TableCell className="capitalize">{platform}</TableCell>
                        <TableCell>{data.bookings}</TableCell>
                        <TableCell className="tabular-nums">{fmt(data.revenueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="guests" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Unique guests</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{guests?.totalGuests ?? "—"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Total bookings</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{guests?.totalBookings ?? "—"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Bookings / guest</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {guests ? guests.avgBookingsPerGuest.toFixed(1) : "—"}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {guests && Object.entries(guests.byStatus).map(([status, count]) => (
              <Card key={status}>
                <CardHeader className="pb-2"><CardTitle className="text-sm capitalize">{status.replace("_", " ")}</CardTitle></CardHeader>
                <CardContent className="text-2xl font-semibold">{count}</CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </PmsPageShell>
  );
}
