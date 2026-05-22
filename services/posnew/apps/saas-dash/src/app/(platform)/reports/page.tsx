"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PlatformOverviewCrumb } from "@/components/platform-overview-crumb";
import { OwnerMetricsCard } from "@/components/owner/metrics-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { metricsAnalyticsResponseSchema } from "@/lib/api-schemas/metrics-analytics";
import { metricsSummaryResponseSchema } from "@/lib/api-schemas/metrics";
import { parseApiResponse } from "@/lib/parse-api-response";
import { P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";
import { usePermission } from "@/lib/use-permission";

/**
 * Control-plane intelligence only.
 * Tenant financial runtime reports are intentionally excluded.
 */
export default function ReportsPage() {
  const router = useRouter();
  const canRead = usePermission(P.METRICS_READ);

  useEffect(() => {
    if (canRead === false) {
      router.replace("/unauthorized");
    }
  }, [canRead, router]);

  const summaryQ = useQuery({
    queryKey: qk.metricsSummary,
    queryFn: async () => {
      const raw = await platformJson<unknown>("/metrics/summary");
      return parseApiResponse(metricsSummaryResponseSchema, raw, "metrics summary");
    },
    enabled: canRead === true,
    staleTime: 30_000,
  });

  const analyticsQ = useQuery({
    queryKey: qk.metricsAnalytics("1970-01-01", "9999-12-31"),
    queryFn: async () => {
      const to = new Date();
      const from = new Date(Date.now() - 30 * 86400_000);
      const qs = new URLSearchParams({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      });
      const raw = await platformJson<unknown>(`/metrics/analytics?${qs.toString()}`);
      return parseApiResponse(
        metricsAnalyticsResponseSchema,
        raw,
        "metrics analytics"
      );
    },
    enabled: canRead === true,
    staleTime: 30_000,
  });

  if (canRead === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (canRead === false) return null;

  const summary = summaryQ.data?.data;
  const analytics = analyticsQ.data?.data;

  return (
    <div className="space-y-6">
      <PlatformOverviewCrumb section="Intelligence" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Reports</h1>
        <p className="text-sm text-muted-foreground">
          Control-plane operational reporting only. Tenant business finance reports are excluded by architecture.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <OwnerMetricsCard
          title="Organizations"
          value={summary?.organizations}
          loading={summaryQ.isLoading}
        />
        <OwnerMetricsCard
          title="Product events (24h)"
          value={summary?.productEvents24h}
          loading={summaryQ.isLoading}
        />
        <OwnerMetricsCard
          title="Platform audits (24h)"
          value={summary?.platformAudits24h}
          loading={summaryQ.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rollup Window</CardTitle>
          <CardDescription>Last 30 UTC days of control-plane product-event rollups.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {analyticsQ.isLoading
            ? "Loading rollup window..."
            : analyticsQ.isError
              ? "Could not load rollup data."
              : `Rows: ${analytics?.rollupRowCount ?? 0}, Total events: ${analytics?.totalRollupEvents ?? 0}`}
        </CardContent>
      </Card>
    </div>
  );
}
