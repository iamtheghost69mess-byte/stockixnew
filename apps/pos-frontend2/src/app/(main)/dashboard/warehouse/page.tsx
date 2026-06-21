import type { Metadata } from "next";

import { WarehouseDashboard } from "./_components/warehouse-dashboard";

export const metadata: Metadata = {
  title: "Warehouse",
  description: "Zones and bins per location",
};

export default function WarehousePage() {
  return <WarehouseDashboard />;
}
