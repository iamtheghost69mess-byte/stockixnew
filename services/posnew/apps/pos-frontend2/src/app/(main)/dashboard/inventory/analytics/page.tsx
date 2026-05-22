import type { Metadata } from "next";

import { AccessGate } from "@/components/access-gate";

import { InventoryAnalyticsDashboard } from "./_components/inventory-analytics-dashboard";

export const metadata: Metadata = {
  title: "Inventory analytics",
  description: "Valuation, slow-moving, forecast, waste, and price history",
};

export default function InventoryAnalyticsPage() {
  return (
    <AccessGate permission="backoffice.inventory.read">
      <InventoryAnalyticsDashboard />
    </AccessGate>
  );
}
