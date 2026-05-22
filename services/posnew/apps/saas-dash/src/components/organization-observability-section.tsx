"use client";

import type { ReactNode } from "react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { OrganizationObservabilityData } from "@/lib/api-schemas/organizations";

function formatApproxBytes(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let v = n;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i += 1;
	}
	return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]} (approx.)`;
}

export type OrganizationObservabilitySectionProps = {
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly data: OrganizationObservabilityData | undefined;
};

/**
 * Read-only tenant telemetry: HTTP buckets, usage counters, BSON-size proxy, entity counts.
 */
export function OrganizationObservabilitySection(
	props: Readonly<OrganizationObservabilitySectionProps>,
) {
	const { isLoading, isError, data } = props;

	let body: ReactNode;
	if (isLoading) {
		body = <p className="text-sm text-muted-foreground">Loading telemetry…</p>;
	} else if (isError) {
		body = (
			<p className="text-sm text-destructive">
				Could not load observability data.
			</p>
		);
	} else if (data) {
		const top30 = data.apiUsage.windows.topEndpoints.last30d;
		body = (
			<>
				<p className="text-xs text-muted-foreground font-mono">
					Snapshot: {new Date(data.generatedAt).toLocaleString()}
				</p>
				<div className="grid gap-3 sm:grid-cols-3">
					<div className="rounded-md border p-3">
						<p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
							API requests (30d)
						</p>
						<p className="mt-1 text-2xl font-semibold tabular-nums">
							{data.apiUsage.windows.requests.last30d.toLocaleString()}
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							7d: {data.apiUsage.windows.requests.last7d.toLocaleString()} ·
							Today (UTC):{" "}
							{data.apiUsage.windows.requests.last24h.toLocaleString()}
						</p>
						<p className="text-[11px] text-muted-foreground mt-2 leading-snug">
							{data.apiUsage.note}
						</p>
					</div>
					<div className="rounded-md border p-3">
						<p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
							Plan usage (month)
						</p>
						<p className="mt-1 text-sm">
							API calls (period):{" "}
							<span className="font-mono font-medium">
								{data.usageCountersSnapshot?.apiCallsThisMonth ?? "—"}
							</span>
						</p>
						<p className="text-sm">
							Orders (period):{" "}
							<span className="font-mono font-medium">
								{data.usageCountersSnapshot?.ordersThisMonth ?? "—"}
							</span>
						</p>
						<p className="text-xs text-muted-foreground mt-1 font-mono">
							{data.usageCountersSnapshot?.usagePeriodYm || "—"}
						</p>
					</div>
					<div className="rounded-md border p-3">
						<p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
							Storage (subset)
						</p>
						<p className="mt-1 text-2xl font-semibold tabular-nums">
							{formatApproxBytes(data.storage.approximateTotalBytes)}
						</p>
						<p className="text-[11px] text-muted-foreground mt-2 leading-snug">
							{data.storage.note}
						</p>
					</div>
				</div>
				<div>
					<p className="text-sm font-medium mb-2">Entity counts</p>
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
						{(
							[
								["Users", data.entityCounts.users],
								["Locations", data.entityCounts.locations],
								["Menu items", data.entityCounts.menuItems],
								["Orders", data.entityCounts.orders],
								["Payments", data.entityCounts.payments],
							] as const
						).map(([label, count]) => (
							<div
								key={label}
								className="rounded-md border px-3 py-2 flex justify-between gap-2"
							>
								<span className="text-muted-foreground">{label}</span>
								<span className="font-mono tabular-nums">
									{count.toLocaleString()}
								</span>
							</div>
						))}
					</div>
				</div>
				<div>
					<p className="text-sm font-medium mb-2">Top endpoints (30d)</p>
					{top30.length === 0 ? (
						<p className="text-sm text-muted-foreground italic">
							No tenant HTTP telemetry yet. Traffic is recorded when org users
							call tenant APIs after deploy.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Method</TableHead>
									<TableHead>Route pattern</TableHead>
									<TableHead className="text-right">Requests</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{top30.map((row, idx) => (
									<TableRow key={`${row.method}-${row.endpointKey}-${idx}`}>
										<TableCell className="font-mono text-xs">
											{row.method}
										</TableCell>
										<TableCell className="font-mono text-xs break-all">
											{row.endpointKey}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{row.count.toLocaleString()}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>
			</>
		);
	} else {
		body = null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Observability</CardTitle>
				<CardDescription>
					Tenant HTTP volume (UTC day buckets), plan usage counters, and
					approximate BSON footprint for key collections. Refreshes periodically
					while you stay on this page.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">{body}</CardContent>
		</Card>
	);
}
