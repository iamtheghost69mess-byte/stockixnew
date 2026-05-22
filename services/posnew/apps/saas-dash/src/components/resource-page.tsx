"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessGate } from "@/components/access-gate";
import { PlatformOverviewCrumb } from "@/components/platform-overview-crumb";
import { ResourceTable } from "@/components/resource-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { parseApiResponse } from "@/lib/parse-api-response";
import { platformJson } from "@/lib/platform-http";
import type { ResourceDefinition } from "@/lib/resource-config";
import { buildResourceListQueryKey } from "@/lib/resource-query-key";

type PagedListResult<T> = {
	readonly rows: T[];
	readonly nextCursor: string | null;
	readonly hasMore: boolean;
};

interface ResourcePageProps {
	resource: ResourceDefinition;
	/** Optional: extra title or description overrides. */
	title?: string;
	description?: string;
	/** If true, breadcrumbs and headers are hidden (useful for tabs). */
	minimal?: boolean;
	/** Extra primary actions (e.g. Create button). */
	extraActions?: React.ReactNode;
	/** Optional full-width row under the title (e.g. filter bars). */
	toolbar?: React.ReactNode;
	/** Optional query params to append to resource API requests. */
	queryParams?: Record<string, string | number | boolean | undefined>;
	/** If false, search input is hidden and no search param is sent. */
	showSearch?: boolean;
	/** Optional custom placeholder for search input. */
	searchPlaceholder?: string;
	/** Optional loading copy override for the table. */
	loadingMessage?: string;
	/** Optional empty-state copy override for the table. */
	emptyMessage?: string;
	/**
	 * Optional custom action handler.
	 * If provided, it overrides the default logic for interactive fields.
	 */
	onAction?: (row: unknown, actionId: string, value: unknown) => void;
	/** Optional row click callback for table navigation flows. */
	onRowClick?: (row: unknown) => void;
	/**
	 * Optional async row enrichment (e.g. batch health summary for organizations).
	 * Receives the current page rows; return extended objects for the table.
	 */
	enrichRows?: (
		rows: Record<string, unknown>[],
	) => Promise<Record<string, unknown>[]>;
}

function isPagedResult(v: unknown): v is PagedListResult<unknown> {
	return (
		typeof v === "object" &&
		v !== null &&
		"rows" in v &&
		Array.isArray((v as PagedListResult<unknown>).rows)
	);
}

/** Stable empty list so `data ?? []` does not allocate a new [] every render (breaks enrichRows effect deps). */
const EMPTY_RESOURCE_ROWS: unknown[] = [];

/**
 * Professional Platform Master Dashboard Generator.
 * Optimized for enterprise performance with debounced searching and interactive row support.
 */
export function ResourcePage(props: Readonly<ResourcePageProps>) {
	const {
		resource,
		title,
		description,
		minimal,
		extraActions,
		toolbar,
		queryParams,
		showSearch = true,
		searchPlaceholder,
		loadingMessage,
		emptyMessage,
		onAction,
		onRowClick,
		enrichRows,
	} = props;
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 400);
	const [pageCursor, setPageCursor] = useState<string | null>(null);
	const [cursorBackStack, setCursorBackStack] = useState<(string | null)[]>([]);
	const [pageOffset, setPageOffset] = useState(0);

	const pageSize = resource.pagination?.pageSize ?? 50;

	const filterFingerprint = useMemo(
		() => JSON.stringify({ search: debouncedSearch, qp: queryParams || {} }),
		[debouncedSearch, queryParams],
	);

	useEffect(() => {
		if (!resource.pagination) return;
		setPageCursor(null);
		setCursorBackStack([]);
		setPageOffset(0);
	}, [filterFingerprint, resource.pagination]);

	const queryKey = buildResourceListQueryKey(resource, {
		search: debouncedSearch,
		queryParams: queryParams || {},
		...(resource.pagination?.kind === "cursor" ? { pageCursor } : {}),
		...(resource.pagination?.kind === "offset" ? { pageOffset } : {}),
	});

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey,
		queryFn: async (): Promise<unknown[] | PagedListResult<unknown>> => {
			const params = new URLSearchParams();
			if (showSearch) {
				const param = resource.searchParam || "search";
				if (debouncedSearch) params.set(param, debouncedSearch);
			}
			if (queryParams) {
				for (const [key, value] of Object.entries(queryParams)) {
					if (value === undefined) continue;
					params.set(key, String(value));
				}
			}
			if (resource.pagination?.kind === "cursor") {
				params.set(resource.pagination.limitParam ?? "limit", String(pageSize));
				if (pageCursor) {
					params.set(resource.pagination.cursorParam ?? "cursor", pageCursor);
				}
			}
			if (resource.pagination?.kind === "offset") {
				params.set(resource.pagination.limitParam ?? "limit", String(pageSize));
				params.set(
					resource.pagination.offsetParam ?? "offset",
					String(pageOffset),
				);
			}

			const suffix = params.toString();
			let url = resource.apiPath;
			if (suffix) {
				const separator = resource.apiPath.includes("?") ? "&" : "?";
				url = `${resource.apiPath}${separator}${suffix}`;
			}
			const raw = await platformJson<unknown>(url);
			const parsed = parseApiResponse(resource.schema, raw, resource.label);
			const rows = resource.dataSelector(parsed);

			if (!resource.pagination || !resource.listMetaSelector) {
				return rows;
			}

			const meta = resource.listMetaSelector(
				parsed as Record<string, unknown>,
				{
					pageOffset,
					pageSize,
				},
			);

			if (resource.pagination.kind === "cursor") {
				const nc = meta.nextCursor ?? null;
				return {
					rows,
					nextCursor: nc,
					hasMore: Boolean(nc),
				};
			}

			return {
				rows,
				nextCursor: null,
				hasMore: Boolean(meta.hasMore),
			};
		},
	});

	const tableRows: unknown[] = useMemo(() => {
		if (isPagedResult(data)) return data.rows;
		if (Array.isArray(data)) return data;
		return EMPTY_RESOURCE_ROWS;
	}, [data]);

	const paged = isPagedResult(data) ? data : null;

	const rowIdsFingerprint = useMemo(
		() =>
			(tableRows as Record<string, unknown>[])
				.map((r) => String(r._id ?? r.id ?? ""))
				.join(","),
		[tableRows],
	);

	const [enrichedRows, setEnrichedRows] = useState<
		Record<string, unknown>[] | null
	>(null);
	const enrichGen = useRef(0);

	useEffect(() => {
		if (!enrichRows) {
			setEnrichedRows(null);
			return;
		}
		const base = tableRows as Record<string, unknown>[];
		setEnrichedRows(null);
		if (base.length === 0) {
			setEnrichedRows([]);
			return;
		}
		const gen = ++enrichGen.current;
		let cancelled = false;
		void enrichRows(base).then(
			(next) => {
				if (cancelled || gen !== enrichGen.current) return;
				setEnrichedRows(next);
			},
			() => {
				if (cancelled || gen !== enrichGen.current) return;
				setEnrichedRows(base);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [enrichRows, rowIdsFingerprint, tableRows]);

	const displayRows: unknown[] =
		enrichRows && enrichedRows !== null ? enrichedRows : tableRows;

	const canCursorPrev =
		resource.pagination?.kind === "cursor" && cursorBackStack.length > 0;
	const canCursorNext =
		resource.pagination?.kind === "cursor" && Boolean(paged?.nextCursor);

	const onCursorNext = () => {
		const nc = paged?.nextCursor;
		if (!nc) return;
		setCursorBackStack((s) => [...s, pageCursor]);
		setPageCursor(nc);
	};

	const onCursorPrev = () => {
		setCursorBackStack((s) => {
			if (s.length === 0) return s;
			const prev = s[s.length - 1] ?? null;
			setPageCursor(prev);
			return s.slice(0, -1);
		});
	};

	const canOffsetPrev =
		resource.pagination?.kind === "offset" && pageOffset > 0;
	const canOffsetNext =
		resource.pagination?.kind === "offset" && Boolean(paged?.hasMore);

	const onOffsetNext = () => {
		if (!paged?.hasMore) return;
		setPageOffset((o) => o + pageSize);
	};

	const onOffsetPrev = () => {
		setPageOffset((o) => Math.max(0, o - pageSize));
	};

	const showPager = Boolean(resource.pagination);

	return (
		<AccessGate permission={resource.permission}>
			<div className="space-y-6">
				{!minimal && (
					<>
						<PlatformOverviewCrumb section={resource.label} />

						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between font-outfit">
							<div>
								<h1 className="text-2xl font-bold tracking-tight">
									{title || resource.label}
								</h1>
								<p className="text-sm text-muted-foreground">
									{description ||
										`Manage platform-wide ${resource.label.toLowerCase()} operations.`}
								</p>
							</div>
							<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
								{showSearch && (
									<div className="w-full sm:w-64">
										<Input
											placeholder={
												searchPlaceholder ||
												`Search ${resource.label.toLowerCase()}...`
											}
											value={search}
											onChange={(e) => setSearch(e.target.value)}
											className="bg-card/50"
										/>
									</div>
								)}
								{extraActions}
							</div>
						</div>
						{toolbar ? <div className="w-full">{toolbar}</div> : null}
					</>
				)}

				{isError && (
					<Alert
						variant="destructive"
						className="border-destructive/10 bg-destructive/5"
					>
						<AlertTitle className="font-semibold">Sync Failure</AlertTitle>
						<AlertDescription className="flex items-center justify-between mt-2">
							<span className="text-sm opacity-90">
								{error instanceof Error
									? error.message
									: "The platform resource could not be fetched."}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void refetch()}
								className="border-destructive/20 hover:bg-destructive/10"
							>
								Retry Connection
							</Button>
						</AlertDescription>
					</Alert>
				)}

				<ResourceTable
					columns={resource.columns}
					data={displayRows as Record<string, unknown>[]}
					isLoading={isLoading}
					loadingMessage={loadingMessage}
					emptyMessage={emptyMessage}
					onAction={onAction}
					onRowClick={onRowClick}
				/>

				{showPager && !minimal && (
					<div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={
								resource.pagination?.kind === "cursor"
									? !canCursorPrev
									: !canOffsetPrev
							}
							onClick={() =>
								resource.pagination?.kind === "cursor"
									? onCursorPrev()
									: onOffsetPrev()
							}
						>
							Previous
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={
								resource.pagination?.kind === "cursor"
									? !canCursorNext
									: !canOffsetNext
							}
							onClick={() =>
								resource.pagination?.kind === "cursor"
									? onCursorNext()
									: onOffsetNext()
							}
						>
							Next
						</Button>
					</div>
				)}
			</div>
		</AccessGate>
	);
}
