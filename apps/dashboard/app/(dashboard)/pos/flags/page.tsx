"use client";

import { PosPageShell } from "@/components/pos-page-shell";
import { PosResourceTable } from "@/components/pos-resource-table";
import { Badge } from "@/components/ui/badge";

export default function PosFlagsPage() {
  return (
    <PosPageShell title="POS feature flags" description="Platform-wide feature toggles.">
      <PosResourceTable
        title="Feature flags"
        fetchPath="flags"
        listKeys={["flags", "data", "items"]}
        emptyMessage="No feature flags returned."
        columns={[
          { key: "key", label: "Key", mono: true },
          { key: "name", label: "Name" },
          {
            key: "enabled",
            label: "Enabled",
            render: (value) => (
              <Badge variant={value === true ? "default" : "secondary"}>
                {value === true ? "On" : "Off"}
              </Badge>
            ),
          },
          { key: "description", label: "Description" },
        ]}
      />
    </PosPageShell>
  );
}
