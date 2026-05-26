"use client";

import { PosPageShell } from "@/components/pos-page-shell";
import { PosResourceTable } from "@/components/pos-resource-table";
import { Badge } from "@/components/ui/badge";

export default function PosWebhooksPage() {
  return (
    <PosPageShell title="POS webhooks" description="Webhook endpoints and delivery outbox.">
      <PosResourceTable
        title="Configured webhooks"
        fetchPath="webhooks"
        listKeys={["webhooks", "data", "items"]}
        emptyMessage="No webhooks configured."
        columns={[
          { key: "url", label: "URL", mono: true },
          { key: "events", label: "Events" },
          {
            key: "active",
            label: "Status",
            render: (value) => (
              <Badge variant={value === true || value === "active" ? "default" : "secondary"}>
                {value === true || value === "active" ? "Active" : "Inactive"}
              </Badge>
            ),
          },
          { key: "name", label: "Name" },
        ]}
      />
    </PosPageShell>
  );
}
