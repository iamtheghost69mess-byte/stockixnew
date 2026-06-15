import type { Metadata } from "next";

import { InventoryAdminDashboard } from "./_components/inventory-admin-dashboard";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Stock balances, movements, and low-stock alerts",
};

export default function InventoryPage() {
  return <InventoryAdminDashboard />;
}
