"use client";

import { cn } from "@restaurant-pos/ui";
import { Badge } from "@/components/ui/badge";

export type OwnerLifecycleVariant =
	| "active"
	| "expired"
	| "not_started"
	| "destructive"
	| "muted";

const VARIANT_CLASS: Record<OwnerLifecycleVariant, string> = {
	active: "border-emerald-200 bg-emerald-50 text-emerald-800",
	expired: "border-amber-200 bg-amber-50 text-amber-900",
	not_started: "border-border bg-muted/60 text-foreground",
	destructive: "border-destructive/30 bg-destructive/10 text-destructive",
	muted: "text-muted-foreground",
};

export type OwnerStatusBadgeProps = {
	readonly label: string;
	readonly variant?: OwnerLifecycleVariant;
	readonly className?: string;
};

/** Canonical status chip for control-plane access state. */
export function OwnerStatusBadge({
	label,
	variant = "muted",
	className,
}: OwnerStatusBadgeProps) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"font-medium capitalize",
				VARIANT_CLASS[variant],
				className,
			)}
		>
			{label}
		</Badge>
	);
}
