"use client";

import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { shouldUseDevDashboardMocks } from "@/lib/dashboard-dev-mocks";

/** Shown when dashboards are rendering in-memory preview data (development default). */
export function DevDashboardDataNotice() {
  if (!shouldUseDevDashboardMocks()) {
    return null;
  }

  return (
    <Alert className="border-primary/25 bg-primary/5">
      <Info className="size-4 text-primary" aria-hidden />
      <AlertTitle>Preview data</AlertTitle>
      
      <AlertDescription className="text-muted-foreground text-sm">
        Showing development fixtures so layouts and charts are visible without the API. Set{" "}
        <span className="font-mono text-foreground">NEXT_PUBLIC_DASHBOARD_USE_LIVE_DATA=1</span> to use live responses.
      </AlertDescription>
    </Alert>
  );
}
