"use client";
import { cn } from "@restaurant-pos/ui";
import { format } from "date-fns";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ResourceField } from "@/lib/resource-config";

interface ResourceTableProps {
	columns: ResourceField[];
	data: any[];
	isLoading?: boolean;
	loadingMessage?: string;
	emptyMessage?: string;
	/**
	 * Callback for interactive fields (e.g. toggling a switch).
	 * Passes the row data, the actionId defined in metadata, and the new value.
	 */
	onAction?: (row: any, actionId: string, value: any) => void;
	/** Optional row click callback for navigation-oriented tables. */
	onRowClick?: (row: any) => void;
}

/**
 * Professional Generic Table Renderer.
 * Supports interactive fields (Switches) and metadata-driven styling.
 */
export function ResourceTable({
	columns,
	data,
	isLoading,
	loadingMessage,
	emptyMessage,
	onAction,
	onRowClick,
}: Readonly<ResourceTableProps>) {
	const getNestedValue = (obj: any, path: string) => {
		return path.split(".").reduce((acc, part) => acc?.[part], obj);
	};

	const displayScalar = (val: unknown): React.ReactNode => {
		if (val == null || val === "") return "---";
		if (typeof val === "object") return JSON.stringify(val);
		return String(val);
	};

	const renderLinkCell = (row: any, field: ResourceField, val: unknown) => (
		<Link
			href={field.href ? field.href(row) : "#"}
			className="text-primary hover:underline font-medium"
		>
			{displayScalar(val)}
		</Link>
	);

	const renderBadgeCell = (field: ResourceField, val: unknown) => (
		<Badge
			variant={field.variant ? field.variant(val) : "default"}
			className={cn(
				"capitalize",
				field.variant?.(val) === "destructive" && "animate-pulse",
			)}
		>
			{displayScalar(val)}
		</Badge>
	);

	const renderDateCell = (val: unknown) => {
		if (!val) return "---";
		const date = new Date(val as string | number | Date);
		if (Number.isNaN(date.getTime())) return "---";
		return (
			<div className="leading-tight">
				<div className="font-medium">{format(date, "PPP")}</div>
				<div className="text-xs text-muted-foreground">{format(date, "p")}</div>
			</div>
		);
	};

	const renderMoneyCell = (val: unknown) => {
		return typeof val === "number" ? `$${val.toFixed(2)}` : "---";
	};

	const renderSwitchCell = (row: any, field: ResourceField, val: unknown) => (
		<div className="flex items-center">
			<Switch
				checked={Boolean(val)}
				onCheckedChange={(checked) =>
					onAction?.(row, field.actionId || field.key, checked)
				}
				disabled={field.disabled?.(row)}
				className={cn(
					field.variant?.(val) === "destructive" &&
						"data-[state=checked]:bg-destructive",
				)}
			/>
		</div>
	);

	const renderProgressCell = (val: unknown) => (
		<div className="flex flex-col gap-1 w-24">
			<Progress value={typeof val === "number" ? val : 0} className="h-1.5" />
			<span className="text-[10px] text-muted-foreground font-mono">
				{typeof val === "number" ? `${val}%` : "---"}
			</span>
		</div>
	);

	const renderCustomCell = (row: any, field: ResourceField) =>
		field.render ? field.render(row) : "---";

	const renderCellByType: Record<
		ResourceField["type"],
		(row: any, field: ResourceField, val: unknown) => React.ReactNode
	> = {
		link: renderLinkCell,
		badge: (_row, field, val) => renderBadgeCell(field, val),
		date: (_row, _field, val) => renderDateCell(val),
		money: (_row, _field, val) => renderMoneyCell(val),
		switch: renderSwitchCell,
		progress: (_row, _field, val) => renderProgressCell(val),
		custom: (row, field) => renderCustomCell(row, field),
		text: (_row, _field, val) => displayScalar(val),
	};

	const renderCell = (row: any, field: ResourceField) => {
		const val = getNestedValue(row, field.key);
		return renderCellByType[field.type]?.(row, field, val) ?? val ?? "---";
	};

	const renderLoadingRow = () => (
		<>
			{Array.from({ length: 6 }).map((_, idx) => (
				<TableRow key={`loading-${idx}`}>
					{columns.map((col) => (
						<TableCell key={`${col.key}-${idx}`} className="py-4">
							<Skeleton className="h-5 w-full max-w-[180px]" />
						</TableCell>
					))}
				</TableRow>
			))}
			<TableRow>
				<TableCell colSpan={columns.length} className="py-3 text-center text-xs text-muted-foreground">
					{loadingMessage || "Synchronizing resource state..."}
				</TableCell>
			</TableRow>
		</>
	);

	const renderEmptyRow = () => (
		<TableRow>
			<TableCell
				colSpan={columns.length}
				className="h-36 text-center text-muted-foreground text-sm"
			>
				<div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2">
					<Inbox className="h-5 w-5 opacity-70" />
					<p className="font-medium">No records found</p>
					<p className="text-xs opacity-80">
						{emptyMessage || "No platform records match the current filters."}
					</p>
				</div>
			</TableCell>
		</TableRow>
	);

	const renderDataRows = () => (
		<>
			{data.map((row, idx) => (
				<TableRow
					key={row._id || idx}
					className={cn(
						"transition-colors hover:bg-muted/40 odd:bg-background even:bg-muted/15",
						onRowClick && "cursor-pointer",
					)}
					onClick={() => onRowClick?.(row)}
				>
					{columns.map((col) => (
						<TableCell
							key={col.key}
							className="py-3 align-middle"
							onClick={(event) => {
								// Prevent row-click navigation when clicking links/switches/custom controls.
								if (
									col.type === "link" ||
									col.type === "switch" ||
									col.type === "custom"
								) {
									event.stopPropagation();
								}
							}}
						>
							{renderCell(row, col)}
						</TableCell>
					))}
				</TableRow>
			))}
		</>
	);

	let tableBodyContent: React.ReactNode;
	if (isLoading) {
		tableBodyContent = renderLoadingRow();
	} else if (data.length === 0) {
		tableBodyContent = renderEmptyRow();
	} else {
		tableBodyContent = renderDataRows();
	}

	return (
		<div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
			<div className="max-h-[68vh] overflow-auto">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-muted/70 backdrop-blur supports-backdrop-filter:bg-muted/55">
					<TableRow>
						{columns.map((col) => (
							<TableHead
								key={col.key}
								className="h-11 whitespace-nowrap border-b border-border/70 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
							>
								{col.label}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
					<TableBody>{tableBodyContent}</TableBody>
				</Table>
			</div>
		</div>
	);
}
