"use client";

import { useEffect, useState } from "react";

import { PosPageShell } from "@/components/pos-page-shell";
import { posApiFetch } from "@/lib/pos-fetch";

export default function PosMetricsPage() {
  const [kpis, setKpis] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await posApiFetch("metrics/kpis");
      const data = await res.json();
      if (!res.ok) {
        setError(JSON.stringify(data));
        return;
      }
      setKpis(data);
    })();
  }, []);

  return (
    <PosPageShell title="POS metrics" description="KPIs from the POS platform API.">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
        {kpis ? JSON.stringify(kpis, null, 2) : "Loading…"}
      </pre>
    </PosPageShell>
  );
}
