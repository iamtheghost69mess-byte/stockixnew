import type { Metadata } from "next";

import { DashboardHome } from "@/components/dashboard-home";

export const metadata: Metadata = {
  title: "Overview",
};

export default function DashboardHomePage() {
  return <DashboardHome />;
}
