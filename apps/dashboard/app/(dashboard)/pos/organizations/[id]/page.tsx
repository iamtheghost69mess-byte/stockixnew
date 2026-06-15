"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PosPageShell } from "@/components/pos-page-shell";
import { posApiFetch } from "@/lib/pos-fetch";

export default function PosOrganizationDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [org, setOrg] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await posApiFetch(`organizations/${id}`);
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError(JSON.stringify(data));
        return;
      }
      setOrg(data.organization && typeof data.organization === "object"
        ? (data.organization as Record<string, unknown>)
        : data);
    })();
  }, [id]);

  return (
    <PosPageShell title="POS organization" description={`Organization ${id}`}>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {org ? (
        <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
          {JSON.stringify(org, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </PosPageShell>
  );
}
