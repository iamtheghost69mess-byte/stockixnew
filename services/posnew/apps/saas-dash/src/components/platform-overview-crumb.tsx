import { cn } from "@restaurant-pos/ui";
import { PlatformBreadcrumbs } from "@/components/platform-breadcrumbs";

/** Standard trail: dashboard home → current section (list and settings pages). */
export function PlatformOverviewCrumb({
	section,
	className,
}: {
	section: string;
	className?: string;
}) {
	return (
		<PlatformBreadcrumbs
			className={cn("mb-2", className)}
			items={[
				{ label: "Overview", href: "/" },
				{ label: section, current: true },
			]}
		/>
	);
}
