"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type OwnerMetricsCardProps = {
	readonly title: string;
	readonly value?: number | string;
	readonly loading: boolean;
};

/** Reusable KPI tile (overview + org detail). */
export function OwnerMetricsCard({
	title,
	value,
	loading,
}: OwnerMetricsCardProps) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{title}</CardDescription>
				<CardTitle className="text-3xl tabular-nums">
					{loading ? <Skeleton className="h-9 w-16" /> : (value ?? "—")}
				</CardTitle>
			</CardHeader>
		</Card>
	);
}
