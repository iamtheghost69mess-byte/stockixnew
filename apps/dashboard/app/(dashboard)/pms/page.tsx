"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TenantRow = { tenantId: string; name: string; slug: string; modules?: string };

export default function PmsOverviewPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [occupancy, setOccupancy] = useState<unknown>(null);

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
      if (list[0]) setTenantId(list[0].tenantId);
    })();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const res = await fetch(`/api/pms/reports/occupancy?tenantId=${tenantId}`);
      setOccupancy(await res.json());
    })();
  }, [tenantId]);

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">PMS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Property management for tenants with the PMS module licensed.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={tenantId} onValueChange={(v) => setTenantId(v ?? "")}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select tenant" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.tenantId} value={t.tenantId}>
                {t.name} ({t.slug})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link href="/pms/properties" className="text-sm text-primary hover:underline">
          Properties
        </Link>
        <Link href="/pms/bookings" className="text-sm text-primary hover:underline">
          Bookings
        </Link>
        <Link href="/pms/guests" className="text-sm text-primary hover:underline">
          Guests
        </Link>
        <Link href="/pms/channels" className="text-sm text-primary hover:underline">
          iCal channels
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Occupancy</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs">{JSON.stringify(occupancy, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
