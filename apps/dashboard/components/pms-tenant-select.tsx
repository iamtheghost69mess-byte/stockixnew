"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { fetchPmsTenants, type PmsTenantOption } from "@/lib/pms-api";

export function PmsTenantSelect({ className }: { className?: string }) {
  const { tenantId, setTenantId, ready } = usePmsTenant();
  const [tenants, setTenants] = useState<PmsTenantOption[]>([]);
  const [loading, setLoading] = useState(true);

  const items = useMemo(
    () =>
      tenants.map((t) => ({
        value: t.tenantId,
        label: `${t.name} (${t.slug})`,
      })),
    [tenants],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const list = await fetchPmsTenants();
      setTenants(list);
      setLoading(false);
      if (list.length === 0) return;
      const valid = list.some((t) => t.tenantId === tenantId);
      if (!tenantId || !valid) {
        setTenantId(list[0]!.tenantId, list[0]!.name, list[0]!.slug);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading tenants…</p>;
  }

  if (tenants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenants have the PMS module. Run{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm db:seed:pms-demo</code>{" "}
        for a local demo tenant, or open{" "}
        <a href="/tenants" className="font-medium text-primary underline-offset-4 hover:underline">
          Tenants
        </a>{" "}
        → add the PMS license.
      </p>
    );
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading selection…</p>;
  }

  return (
    <Select
      items={items}
      value={tenantId}
      onValueChange={(id) => {
        const t = tenants.find((x) => x.tenantId === id);
        if (t) setTenantId(t.tenantId, t.name, t.slug);
      }}
    >
      <SelectTrigger className={className ?? "w-full max-w-sm"}>
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
  );
}
