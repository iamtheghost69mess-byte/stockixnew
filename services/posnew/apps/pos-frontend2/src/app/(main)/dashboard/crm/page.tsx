import type { Metadata } from "next";

import { CrmDashboardClient } from "./crm-dashboard-client";

export const metadata: Metadata = {
  title: "Operations",
};

export default function Page() {
  return <CrmDashboardClient />;
}
