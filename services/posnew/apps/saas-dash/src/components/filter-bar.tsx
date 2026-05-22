"use client";

import { cn } from "@restaurant-pos/ui";

type FilterBarProps = {
	readonly children: React.ReactNode;
	readonly className?: string;
	/** Optional heading for the filter region (accessibility). */
	readonly "aria-label"?: string;
};

/**
 * Consistent container for table filters (used on audits, jobs, users, etc.).
 */
export function FilterBar(props: Readonly<FilterBarProps>) {
	const { children, className, "aria-label": ariaLabel = "Filters" } = props;
	return (
		<div
			role="region"
			aria-label={ariaLabel}
			className={cn(
				"flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-card/40 p-3",
				className,
			)}
		>
			{children}
		</div>
	);
}
