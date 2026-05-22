"use client";

import { useEffect, useState } from "react";

export default function PmsBookingsPage() {
  const [tenantId, setTenantId] = useState(sessionStorage.getItem("pms-tenant-id") ?? "");
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const res = await fetch(`/api/pms/bookings?tenantId=${tenantId}`);
      setData(await res.json());
    })();
  }, [tenantId]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">PMS bookings</h1>
      <pre className="rounded-lg border bg-muted/30 p-4 text-xs">
        {data ? JSON.stringify(data, null, 2) : "Set tenant on Properties page first"}
      </pre>
    </div>
  );
}
