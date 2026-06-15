import type { Metadata } from "next";

import { FloorPageClient } from "@/app/(main)/dashboard/floor/_components/floor-page-client";

export const metadata: Metadata = {
  title: "Floor",
  description: "Back-office branch tables and reservations. Use Open POS from the dashboard header for live service.",
};

export default function FloorPage() {
  return <FloorPageClient />;
}
