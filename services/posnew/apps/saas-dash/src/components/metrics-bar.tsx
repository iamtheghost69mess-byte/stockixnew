"use client";

import {
	Bar,
	CartesianGrid,
	BarChart as RBarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export function MetricsBar({
	data,
	emptyHint = "No rollup data for this range.",
}: {
	data: { dayUtc: string; events: number }[];
	emptyHint?: string;
}) {
	if (!data.length) {
		return <p className="text-muted-foreground text-sm">{emptyHint}</p>;
	}
	const chart = data.map((r) => ({
		day: String(r.dayUtc).slice(5),
		events: r.events,
	}));
	return (
		<div className="w-full min-w-0" aria-label="Daily metrics events bar chart">
			<ResponsiveContainer width="100%" height={350}>
				<RBarChart
					data={chart}
					margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-border-tertiary)"
					/>
					<XAxis
						dataKey="day"
						tick={{ fontSize: 11, fill: "var(--color-text-primary)" }}
						axisLine={{ stroke: "var(--color-border-tertiary)" }}
					/>
					<YAxis
						width={40}
						tick={{ fontSize: 11, fill: "var(--color-text-primary)" }}
						axisLine={{ stroke: "var(--color-border-tertiary)" }}
					/>
					<Tooltip
						content={({ active, payload }) => {
							if (active && payload && payload.length) {
								return (
									<div className="rounded-md border border-[var(--color-border-tertiary)] bg-[var(--color-background-secondary)] p-2 text-[var(--color-text-primary)] shadow-md">
										<p className="font-medium text-xs">
											{payload[0].payload.day}
										</p>
										<p className="text-sm font-bold">
											{payload[0].value} events
										</p>
									</div>
								);
							}
							return null;
						}}
					/>
					<Bar
						dataKey="events"
						fill="var(--color-primary)"
						radius={[4, 4, 0, 0]}
					/>
				</RBarChart>
			</ResponsiveContainer>
			<div className="sr-only">
				Bar chart showing daily metric events. Max events:{" "}
				{Math.max(...chart.map((c) => c.events))}.
			</div>
		</div>
	);
}
