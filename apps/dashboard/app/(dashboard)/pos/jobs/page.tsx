"use client";

import { PosPageShell } from "@/components/pos-page-shell";
import { PosResourceTable } from "@/components/pos-resource-table";
import { Badge } from "@/components/ui/badge";

function formatPosJobState(value: unknown): string {
  if (value == null) return "—";
  return String(value);
}

export default function PosJobsPage() {
  return (
    <PosPageShell title="POS jobs" description="BullMQ job console (read-only proxy).">
      <PosResourceTable
        title="Background jobs"
        fetchPath="jobs"
        listKeys={["jobs", "data", "items", "queues"]}
        emptyMessage="No jobs in queue."
        columns={[
          { key: "id", label: "ID", mono: true },
          { key: "name", label: "Name" },
          { key: "queue", label: "Queue" },
          {
            key: "state",
            label: "State",
            render: (value) => (
              <Badge variant="outline">{formatPosJobState(value)}</Badge>
            ),
          },
          { key: "progress", label: "Progress" },
        ]}
      />
    </PosPageShell>
  );
}
