"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OwnerMetricsCard } from "@/components/owner/metrics-card";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisiblePollingInterval } from "@/hooks/use-visible-polling-interval";
import { metricsSummaryResponseSchema } from "@/lib/api-schemas/metrics";
import { metricsAnalyticsResponseSchema } from "@/lib/api-schemas/metrics-analytics";
import { metricsKpisResponseSchema } from "@/lib/api-schemas/metrics-kpis";
import { parseApiResponse } from "@/lib/parse-api-response";
import { P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";
import { usePermission } from "@/lib/use-permission";

const BarChart = dynamic(
	() => import("@/components/metrics-bar").then((m) => m.MetricsBar),
	{
		ssr: false,
		loading: () => <Skeleton className="h-64 w-full" />,
	},
);

function toYmdUtc(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function defaultKpiFromDay(): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - 30);
	return toYmdUtc(d);
}

function showSloStubCard(): boolean {
	if (process.env.NEXT_PUBLIC_PLATFORM_SHOW_SLO_STUB === "true") return true;
	if (process.env.NEXT_PUBLIC_PLATFORM_SHOW_SLO_STUB === "false") return false;
	return process.env.NODE_ENV !== "production";
}

export default function OverviewPage() {
	const router = useRouter();
	const qc = useQueryClient();
	const can = usePermission(P.METRICS_READ);
	const [range, setRange] = useState<"7d" | "snapshot">("7d");
	const [fromDay, setFromDay] = useState(defaultKpiFromDay);
	const [toDay, setToDay] = useState(() => toYmdUtc(new Date()));
	const metricsPoll = useVisiblePollingInterval(15_000);

	useEffect(() => {
		if (can === false) router.replace("/unauthorized");
	}, [can, router]);

	const q = useQuery({
		queryKey: qk.metricsSummary,
		queryFn: async () => {
			const raw = await platformJson<unknown>("/metrics/summary");
			return parseApiResponse(
				metricsSummaryResponseSchema,
				raw,
				"metrics summary",
			);
		},
		enabled: can === true,
		refetchInterval: metricsPoll,
	});

	const qKpis = useQuery({
		queryKey: qk.metricsKpis(fromDay, toDay),
		queryFn: async () => {
			const qs = new URLSearchParams({ from: fromDay, to: toDay });
			const raw = await platformJson<unknown>(`/metrics/kpis?${qs.toString()}`);
			return parseApiResponse(metricsKpisResponseSchema, raw, "metrics kpis");
		},
		enabled: can === true,
		refetchInterval: metricsPoll,
	});

	const qAnalytics = useQuery({
		queryKey: qk.metricsAnalytics(fromDay, toDay),
		queryFn: async () => {
			const qs = new URLSearchParams({ from: fromDay, to: toDay });
			const raw = await platformJson<unknown>(
				`/metrics/analytics?${qs.toString()}`,
			);
			return parseApiResponse(
				metricsAnalyticsResponseSchema,
				raw,
				"metrics analytics",
			);
		},
		enabled: can === true,
		refetchInterval: metricsPoll,
	});

	if (can === undefined) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-8 w-48" />
				<div className="grid gap-4 md:grid-cols-3">
					<Skeleton className="h-24 rounded-xl" />
					<Skeleton className="h-24 rounded-xl" />
					<Skeleton className="h-24 rounded-xl" />
				</div>
				<Skeleton className="h-64 rounded-xl" />
			</div>
		);
	}

	if (can === false) return null;

	const d = q.data?.data;
	const k = qKpis.data?.data;
	const churn = k?.churnAndSeats as
		| {
				staffUsersInActiveOrTrialingOrgs?: number;
		  }
		| undefined;
	const analyticsSeries = qAnalytics.data?.data?.series ?? [];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
				<p className="text-muted-foreground text-sm">
					Snapshot metrics from the platform API, plus owner KPIs and
					rollup-backed analytics for a selected UTC day range (max 366 days).
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<OwnerMetricsCard
					title="Organizations"
					value={d?.organizations}
					loading={q.isLoading}
				/>
				<OwnerMetricsCard
					title="Product events (24h)"
					value={d?.productEvents24h}
					loading={q.isLoading}
				/>
				<OwnerMetricsCard
					title="Platform audits (24h)"
					value={d?.platformAudits24h}
					loading={q.isLoading}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Owner KPIs (control-plane activity)</CardTitle>
					<CardDescription>
						Range applies to KPI aggregates and the analytics chart. Parsed with
						Zod in{" "}
						<code className="rounded bg-muted px-1 py-0.5 text-xs">
							metrics-kpis.ts
						</code>{" "}
						and{" "}
						<code className="rounded bg-muted px-1 py-0.5 text-xs">
							metrics-analytics.ts
						</code>
						.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-end gap-4">
						<div className="space-y-2">
							<Label htmlFor="kpi-from">From (UTC)</Label>
							<Input
								id="kpi-from"
								type="date"
								value={fromDay}
								onChange={(e) => setFromDay(e.target.value)}
								className="w-[160px]"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="kpi-to">To (UTC)</Label>
							<Input
								id="kpi-to"
								type="date"
								value={toDay}
								onChange={(e) => setToDay(e.target.value)}
								className="w-[160px]"
							/>
						</div>
						<Button
							variant="outline"
							size="sm"
							type="button"
							onClick={() => {
								void qc.invalidateQueries({
									queryKey: qk.metricsKpis(fromDay, toDay),
								});
								void qc.invalidateQueries({
									queryKey: qk.metricsAnalytics(fromDay, toDay),
								});
							}}
						>
							Refresh KPIs
						</Button>
					</div>
					{qKpis.isError ? (
						<p className="text-destructive text-sm">Could not load KPIs.</p>
					) : (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<OwnerMetricsCard
								title="Product events (range)"
								value={k?.productEventsInRange}
								loading={qKpis.isLoading}
							/>
							<OwnerMetricsCard
								title="Platform audits (range)"
								value={k?.platformAuditsInRange}
								loading={qKpis.isLoading}
							/>
							<OwnerMetricsCard
								title="Staff in billable orgs"
								value={churn?.staffUsersInActiveOrTrialingOrgs}
								loading={qKpis.isLoading}
							/>
						</div>
					)}
					<div>
						<p className="text-muted-foreground mb-2 text-sm">
							Rollup series (product events / day)
						</p>
						{qAnalytics.isError ? (
							<p className="text-destructive text-sm">
								Could not load analytics series.
							</p>
						) : (
							<BarChart
								data={analyticsSeries}
								emptyHint="No rollup rows for the selected day range."
							/>
						)}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
					<div>
						<CardTitle>Activity</CardTitle>
						<CardDescription>
							Built-in 7-day rollup from summary; independent of the KPI date
							pickers above.
						</CardDescription>
					</div>
					<Select
						value={range}
						onValueChange={(v) => setRange(v as "7d" | "snapshot")}
					>
						<SelectTrigger className="w-[160px]">
							<SelectValue placeholder="Range" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="7d">Last 7 days (rollup)</SelectItem>
							<SelectItem value="snapshot">Snapshot only</SelectItem>
						</SelectContent>
					</Select>
				</CardHeader>
				<CardContent>
					{q.isError ? (
						<div className="space-y-2">
							<p className="text-destructive text-sm">
								Could not load metrics.
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									void qc.invalidateQueries({ queryKey: qk.metricsSummary })
								}
							>
								Retry
							</Button>
						</div>
					) : range === "snapshot" ? (
						<p className="text-muted-foreground text-sm">
							7-day rollup event total:{" "}
							<span className="text-foreground font-medium">
								{d?.productEventRollupEvents7d ?? "—"}
							</span>
						</p>
					) : (
						<BarChart data={d?.productEventRollupSeries7d || []} />
					)}
				</CardContent>
			</Card>

			{d?.slo && showSloStubCard() ? (
				<Card>
					<CardHeader>
						<CardTitle>SLO (development preview)</CardTitle>
						<CardDescription>
							Observed error budget ratio from backend config.
						</CardDescription>
					</CardHeader>
					<CardContent className="text-sm">
						<div>Availability target: {d.slo.availabilityTarget ?? "—"}</div>
						<div>
							Error budget ratio: {d.slo.observedErrorBudgetRatio ?? "—"}
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
