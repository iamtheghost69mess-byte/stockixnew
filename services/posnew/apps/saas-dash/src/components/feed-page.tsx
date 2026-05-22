"use client";

import { useQuery } from "@tanstack/react-query";
import type * as z from "zod";
import { AccessGate } from "@/components/access-gate";
import { PlatformOverviewCrumb } from "@/components/platform-overview-crumb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisiblePollingInterval } from "@/hooks/use-visible-polling-interval";
import { parseApiResponse } from "@/lib/parse-api-response";
import type { PlatformPermission } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";

interface FeedPageProps<T> {
	id: string;
	label: string;
	permission: PlatformPermission;
	apiPath: string;
	schema: z.ZodType<any>;
	dataSelector: (parsed: any) => T[];
	renderItem: (item: T) => React.ReactNode;
	title?: string;
	description?: string;
	extraActions?: React.ReactNode;
	/** Optional polling interval in ms. */
	refreshInterval?: number;
	/** When the API path or filters change, pass a stable query key (defaults to id + apiPath). */
	queryKey?: readonly unknown[];
	loadingMessage?: string;
	emptyMessage?: string;
	emptyHint?: string;
}

/**
 * Professional Activity Stream Generator (FeedPage).
 * Optimzied for real-time status feeds, audit signals, and alerting.
 * Complements ResourcePage by providing a card-based activity-first layout.
 */
export function FeedPage<T extends { id: string | number }>({
	id,
	label,
	permission,
	apiPath,
	schema,
	dataSelector,
	renderItem,
	title,
	description,
	extraActions,
	refreshInterval,
	queryKey,
	loadingMessage = "Loading feed…",
	emptyMessage = "No active signals",
	emptyHint,
}: Readonly<FeedPageProps<T>>) {
	const pollMs =
		refreshInterval && refreshInterval > 0 ? refreshInterval : 30_000;
	const visiblePollMs = useVisiblePollingInterval(pollMs);
	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: queryKey ?? [id, "feed", apiPath],
		queryFn: async () => {
			const raw = await platformJson<unknown>(apiPath);
			const parsed = parseApiResponse(schema, raw, label);
			return dataSelector(parsed);
		},
		refetchInterval:
			refreshInterval && refreshInterval > 0 ? visiblePollMs : false,
	});

	return (
		<AccessGate permission={permission}>
			<div className="space-y-6">
				<PlatformOverviewCrumb section={label} />

				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between font-outfit">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">
							{title || label}
						</h1>
						<p className="text-sm text-muted-foreground">
							{description ||
								`Real-time activity and signaling for ${label.toLowerCase()}.`}
						</p>
					</div>
					{extraActions}
				</div>

				{isError && (
					<Alert
						variant="destructive"
						className="border-destructive/10 bg-destructive/5"
					>
						<AlertTitle className="font-semibold">
							Stream Interrupted
						</AlertTitle>
						<AlertDescription className="flex items-center justify-between mt-2">
							<span className="text-sm opacity-90">
								{error instanceof Error
									? error.message
									: "Failed to connect to activity stream."}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void refetch()}
								className="border-destructive/20 hover:bg-destructive/10"
							>
								Re-establish Connection
							</Button>
						</AlertDescription>
					</Alert>
				)}

				<div className="space-y-3">
					{(() => {
						if (isLoading) {
							return (
								<div className="space-y-4">
									<p className="text-sm text-muted-foreground">
										{loadingMessage}
									</p>
									<Skeleton className="h-24 w-full rounded-xl" />
									<Skeleton className="h-24 w-full rounded-xl" />
									<Skeleton className="h-24 w-full rounded-xl" />
								</div>
							);
						}
						if (!data || data.length === 0) {
							return (
								<div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-xl opacity-60">
									<p className="text-muted-foreground font-medium">
										{emptyMessage}
									</p>
									<p className="text-xs text-muted-foreground mt-1 text-balance max-w-xs">
										{emptyHint ||
											`${label} events will appear here as they are broadcast by the platform.`}
									</p>
								</div>
							);
						}
						return data.map((item) => (
							<div key={item.id} className="transition-all duration-200">
								{renderItem(item)}
							</div>
						));
					})()}
				</div>
			</div>
		</AccessGate>
	);
}
