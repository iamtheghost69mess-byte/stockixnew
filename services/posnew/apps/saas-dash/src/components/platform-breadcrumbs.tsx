import { cn } from "@restaurant-pos/ui";
import Link from "next/link";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** One segment: link, plain label (no route, muted), or current page. */
export type PlatformBreadcrumbSegment =
	| { label: string; href: string }
	| { label: string; plain: true }
	| { label: string; current: true };

export function PlatformBreadcrumbs({
	items,
	className,
}: {
	items: readonly PlatformBreadcrumbSegment[];
	className?: string;
}) {
	return (
		<Breadcrumb className={cn(className)}>
			<BreadcrumbList>
				{items.map((item, i) => (
					<Fragment key={`${i}-${item.label}`}>
						{i > 0 ? <BreadcrumbSeparator /> : null}
						<BreadcrumbItem>
							{"href" in item ? (
								<BreadcrumbLink asChild>
									<Link href={item.href}>{item.label}</Link>
								</BreadcrumbLink>
							) : "current" in item && item.current ? (
								<BreadcrumbPage>{item.label}</BreadcrumbPage>
							) : (
								<span className="text-sm text-muted-foreground">
									{item.label}
								</span>
							)}
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
