"use client";

import { cn } from "@restaurant-pos/ui";

export type OwnerHealthLevel = "ok" | "degraded" | "down" | "unknown";

const LABEL: Record<OwnerHealthLevel, string> = {
	ok: "Healthy",
	degraded: "Degraded",
	down: "Critical",
	unknown: "No signal",
};

const COLOR: Record<OwnerHealthLevel, string> = {
	ok: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]",
	degraded: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.45)]",
	down: "bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.45)]",
	unknown: "bg-muted-foreground/35",
};

export type HealthDotProps = {
	readonly level: OwnerHealthLevel;
	readonly className?: string;
};

/**
 * Traffic / error-budget signal for operator tables (batch health-summary or derived observability).
 */
export function HealthDot({ level, className }: HealthDotProps) {
	return (
		<span
			role="img"
			aria-label={LABEL[level]}
			title={LABEL[level]}
			className={cn(
				"inline-block h-2.5 w-2.5 shrink-0 rounded-full",
				COLOR[level],
				level === "unknown" && "animate-pulse",
				className,
			)}
		/>
	);
}
