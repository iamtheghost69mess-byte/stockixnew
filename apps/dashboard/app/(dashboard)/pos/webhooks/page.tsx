"use client";

import { useEffect, useState } from "react";

import { PosPageShell } from "@/components/pos-page-shell";
import { posApiFetch } from "@/lib/pos-fetch";

export default function PosWebhooksPage() {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    void (async () => {
      const res = await posApiFetch("webhooks");
      setData(await res.json());
    })();
  }, []);

  return (
    <PosPageShell title="POS webhooks" description="Webhook endpoints and delivery outbox.">
      <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
        {data ? JSON.stringify(data, null, 2) : "Loading…"}
      </pre>
    </PosPageShell>
  );
}
