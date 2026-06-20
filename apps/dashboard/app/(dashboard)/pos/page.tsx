"use client";

import { useEffect, useState } from "react";

import { PosPageShell } from "@/components/pos-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { posApiFetch } from "@/lib/pos-fetch";

export default function PosOverviewPage() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await posApiFetch("metrics/summary");
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          setError(JSON.stringify(data));
          return;
        }
        setSummary(data);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  return (
    <PosPageShell
      title="POS"
      description="Platform metrics and operations for Point of Sale tenants (proxied to POS backend)."
    >
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary
            ? Object.entries(summary).map(([key, value]) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium capitalize">
                      {key.replace(/([A-Z])/g, " $1")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold tabular-nums">
                    {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
                  </CardContent>
                </Card>
              ))
            : (
                <p className="text-sm text-muted-foreground">Loading POS metrics…</p>
              )}
        </div>
      )}
    </PosPageShell>
  );
}
