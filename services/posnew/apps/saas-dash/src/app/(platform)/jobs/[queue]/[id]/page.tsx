"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlatformBreadcrumbs } from "@/components/platform-breadcrumbs";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { jobDetailResponseSchema } from "@/lib/api-schemas/jobs";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { parseApiResponse } from "@/lib/parse-api-response";
import { P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";
import { usePermission } from "@/lib/use-permission";

function JobDetailSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-9 w-24" />
			<Skeleton className="h-8 w-3/4 max-w-md" />
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-24" />
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
					</div>
					<Skeleton className="h-9 w-48" />
				</CardContent>
			</Card>
		</div>
	);
}

export default function JobDetailPage() {
	const params = useParams();
	const queue = String(params.queue || "");
	const id = String(params.id || "");
	const router = useRouter();
	const queryClient = useQueryClient();
	const can = usePermission(P.QUEUE_ADMIN);
	const [pollFailures, setPollFailures] = useState(0);
	const [rawOpen, setRawOpen] = useState(false);

	const q = useQuery({
		queryKey: qk.job(queue, id),
		queryFn: async () => {
			try {
				const raw = await platformJson<unknown>(
					`/jobs/${encodeURIComponent(queue)}/${encodeURIComponent(id)}`,
				);
				const j = parseApiResponse(jobDetailResponseSchema, raw, "job detail");
				setPollFailures(0);
				return j;
			} catch (e) {
				setPollFailures((c) => c + 1);
				throw e;
			}
		},
		enabled: !!queue && !!id && can === true,
		refetchInterval: () => {
			if (
				typeof document !== "undefined" &&
				document.visibilityState === "hidden"
			) {
				return 120_000;
			}
			const state = q.data?.data?.state;
			if (state === "completed" || state === "failed") return false;
			const base = 4000;
			const max = 60_000;
			if (pollFailures === 0) return base;
			const mult = 2 ** Math.min(pollFailures, 4);
			return Math.min(max, base * mult);
		},
		refetchIntervalInBackground: false,
		retry: (failureCount, err) => {
			const st = (err as { status?: number })?.status;
			if (st === 404 || st === 401 || st === 403) return false;
			return failureCount < 2;
		},
	});

	const retryM = useMutation({
		mutationFn: async () => {
			return platformJson<{ success?: boolean; data?: { retried?: boolean } }>(
				`/jobs/${encodeURIComponent(queue)}/${encodeURIComponent(id)}/retry`,
				{
					method: "POST",
					idempotencyKey: crypto.randomUUID(),
				},
			);
		},
		onSuccess: () => {
			toast.success("Job re-queued", {
				description: "Status will update when the worker picks it up.",
			});
			invalidateQueriesEverywhere(queryClient, "jobRetry");
			void q.refetch();
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Could not retry job")),
	});

	useEffect(() => {
		if (can === false) router.replace("/unauthorized");
	}, [can, router]);

	if (can === undefined) {
		return <JobDetailSkeleton />;
	}

	if (can === false) return null;

	if (q.isLoading) {
		return <JobDetailSkeleton />;
	}

	const status = q.data?.data;
	const state = status?.state;
	const canRetry = state === "failed";

	return (
		<div className="space-y-4">
			<PlatformBreadcrumbs
				items={[
					{ label: "Jobs", href: "/jobs" },
					{ label: queue, plain: true },
					{
						label: id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id,
						current: true,
					},
				]}
			/>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-mono text-xl">
					{queue}/{id}
				</h1>
				{canRetry ? (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="secondary" size="sm" disabled={retryM.isPending}>
								{retryM.isPending ? "Re-queueing…" : "Retry failed job"}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Re-queue this job?</AlertDialogTitle>
								<AlertDialogDescription>
									Only jobs in the <strong>failed</strong> state can be retried.
									BullMQ will run the job again from the start of the worker
									handler.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={retryM.isPending}>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									disabled={retryM.isPending}
									onClick={() => retryM.mutate()}
								>
									Re-queue
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				) : null}
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Status</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{q.isError ? (
						<div className="space-y-2">
							<p className="text-destructive text-sm">
								Job not found or queue unavailable.
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void q.refetch()}
							>
								Retry load
							</Button>
						</div>
					) : (
						<>
							<dl className="grid gap-2 text-sm sm:grid-cols-2">
								<div>
									<dt className="text-muted-foreground">State</dt>
									<dd className="font-medium">{state ?? "—"}</dd>
								</div>
								{typeof status?.progress === "number" ? (
									<div>
										<dt className="text-muted-foreground">Progress</dt>
										<dd className="font-medium">{status.progress}</dd>
									</div>
								) : null}
								{status?.failedReason ? (
									<div className="sm:col-span-2">
										<dt className="text-muted-foreground">Failure</dt>
										<dd className="text-destructive">
											{String(status.failedReason)}
										</dd>
									</div>
								) : null}
								{status?.processedOn != null ? (
									<div>
										<dt className="text-muted-foreground">Processed</dt>
										<dd className="font-mono text-xs">
											{String(status.processedOn)}
										</dd>
									</div>
								) : null}
								{status?.finishedOn != null ? (
									<div>
										<dt className="text-muted-foreground">Finished</dt>
										<dd className="font-mono text-xs">
											{String(status.finishedOn)}
										</dd>
									</div>
								) : null}
							</dl>
							<Collapsible open={rawOpen} onOpenChange={setRawOpen}>
								<CollapsibleTrigger asChild>
									<Button variant="outline" size="sm" type="button">
										{rawOpen ? "Hide" : "Show"} raw JSON (support)
									</Button>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<pre className="mt-2 max-h-[320px] overflow-auto rounded-md bg-muted p-3 text-xs">
										{JSON.stringify(q.data, null, 2)}
									</pre>
								</CollapsibleContent>
							</Collapsible>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
