"use client";

import { PosPageShell } from "@/components/pos-page-shell";
import { PosResourceTable } from "@/components/pos-resource-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/date-format";

export default function PosNotificationsPage() {
  return (
    <PosPageShell title="POS notifications" description="Operator notifications from POS platform.">
      <PosResourceTable
        title="Notifications"
        fetchPath="notifications"
        listKeys={["notifications", "data", "items"]}
        emptyMessage="No notifications."
        columns={[
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          {
            key: "read",
            label: "Read",
            render: (value) => (
              <Badge variant={value === true ? "secondary" : "default"}>
                {value === true ? "Read" : "Unread"}
              </Badge>
            ),
          },
          {
            key: "createdAt",
            label: "Created",
            render: (value) =>
              typeof value === "string" ? formatDateTime(value) : "—",
          },
        ]}
      />
    </PosPageShell>
  );
}
