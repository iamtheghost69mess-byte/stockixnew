"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OwnerRowActionItem = {
	readonly id: string;
	readonly label: string;
	readonly onSelect: () => void;
	readonly destructive?: boolean;
	readonly disabled?: boolean;
};

type OwnerRowActionMenuProps = {
	readonly items: readonly OwnerRowActionItem[];
	readonly ariaLabel?: string;
};

/**
 * Compact row actions menu for operator tables (API keys, webhooks, etc.).
 */
export function OwnerRowActionMenu(props: Readonly<OwnerRowActionMenuProps>) {
	const { items, ariaLabel = "Row actions" } = props;
	if (items.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 shrink-0"
					aria-label={ariaLabel}
				>
					<MoreHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-[10rem]">
				{items.map((item) => (
					<DropdownMenuItem
						key={item.id}
						disabled={item.disabled}
						variant={item.destructive ? "destructive" : "default"}
						onSelect={() => {
							item.onSelect();
						}}
					>
						{item.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
