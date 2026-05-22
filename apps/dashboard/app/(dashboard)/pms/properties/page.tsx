"use client";

import { useEffect, useState } from "react";

export default function PmsPropertiesPage() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("pms-tenant-id");
    if (saved) setTenantId(saved);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    sessionStorage.setItem("pms-tenant-id", tenantId);
    void (async () => {
      const res = await fetch(`/api/pms/properties?tenantId=${tenantId}`);
      setData(await res.json());
    })();
  }, [tenantId]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">PMS properties</h1>
      <input
        className="flex h-9 w-full max-w-md rounded-md border px-3 text-sm"
        placeholder="Tenant UUID"
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
      />
      <pre className="rounded-lg border bg-muted/30 p-4 text-xs">
        {data ? JSON.stringify(data, null, 2) : "Enter tenant id from PMS overview"}
      </pre>
    </div>
  );
}
