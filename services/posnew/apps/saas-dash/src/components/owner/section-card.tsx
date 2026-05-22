"use client";

import { cn } from "@restaurant-pos/ui";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export type OwnerSectionCardProps = {
	readonly title: string;
	readonly description?: string;
	readonly children: React.ReactNode;
	readonly className?: string;
	readonly headerClassName?: string;
};

/** Titled section wrapper for dense operator detail pages. */
export function OwnerSectionCard({
	title,
	description,
	children,
	className,
	headerClassName,
}: OwnerSectionCardProps) {
	return (
		<Card className={className}>
			<CardHeader className={cn(headerClassName)}>
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
