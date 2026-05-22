"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OrgLicenseDateFieldProps = {
	readonly label: string;
	readonly value: Date | undefined;
	readonly onChange: (next: Date | undefined) => void;
	readonly disabled?: boolean;
	readonly id?: string;
};

/**
 * Shadcn Calendar inside a Popover for owner-console license dates.
 */
export function OrgLicenseDateField({
	label,
	value,
	onChange,
	disabled,
	id,
}: OrgLicenseDateFieldProps) {
	return (
		<div className="space-y-2">
			<span className="text-sm font-medium leading-none">{label}</span>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						id={id}
						type="button"
						variant="outline"
						disabled={disabled}
						className={cn(
							"w-full justify-start text-left font-normal",
							!value && "text-muted-foreground",
						)}
					>
						<CalendarIcon
							className="mr-2 h-4 w-4 shrink-0 opacity-60"
							aria-hidden
						/>
						{value ? format(value, "PPP") : "Pick a date"}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={value}
						onSelect={onChange}
						initialFocus
					/>
				</PopoverContent>
			</Popover>
			{value ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					disabled={disabled}
					onClick={() => onChange(undefined)}
				>
					Clear
				</Button>
			) : null}
		</div>
	);
}
