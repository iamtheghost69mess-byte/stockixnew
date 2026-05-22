"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ResourcePage } from "@/components/resource-page";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { platformEndpoints } from "@/lib/platform-endpoints";
import { ResourceRegistry } from "@/lib/resource-config";

const QUEUE_NAMES = [
	"provisioning",
	"webhooks_out",
	"email",
	"exports",
	"compliance",
	"analytics_rollups",
	"fraud_review",
];

const STATUSES = ["active", "waiting", "delayed", "failed", "completed"];

/**
 * Background job monitor with offset pagination (ResourcePage).
 */
export default function JobsListPage() {
	const searchParams = useSearchParams();
	const router = useRouter();

	const currentQueue = searchParams.get("queue") || "all";
	const currentStatus = searchParams.get("status") || "all";

	const updateFilter = (key: string, val: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (val === "all") params.delete(key);
		else params.set(key, val);
		router.replace(`/jobs?${params.toString()}`);
	};

	const extraFilters = (
		<div className="flex items-center gap-3">
			<div className="flex flex-col gap-1">
				<Label className="text-[10px] uppercase font-bold opacity-50">
					Filter Queue
				</Label>
				<Select
					value={currentQueue}
					onValueChange={(v) => updateFilter("queue", v)}
				>
					<SelectTrigger className="h-9 w-36 bg-card/50">
						<SelectValue placeholder="Queue" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Queues</SelectItem>
						{QUEUE_NAMES.map((q) => (
							<SelectItem key={q} value={q}>
								{q}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-1">
				<Label className="text-[10px] uppercase font-bold opacity-50">
					State
				</Label>
				<Select
					value={currentStatus}
					onValueChange={(v) => updateFilter("status", v)}
				>
					<SelectTrigger className="h-9 w-32 bg-card/50">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All States</SelectItem>
						{STATUSES.map((s) => (
							<SelectItem key={s} value={s} className="capitalize">
								{s}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);

	const jobQueryParams = {
		queue: currentQueue === "all" ? undefined : currentQueue,
		status: currentStatus === "all" ? undefined : currentStatus,
	};

	return (
		<ResourcePage
			resource={ResourceRegistry.jobs}
			title="Jobs Control Plane"
			description="Inspect queue workloads, identify failed tasks, and drill into execution details."
			extraActions={extraFilters}
			queryParams={jobQueryParams}
			showSearch={false}
			loadingMessage="Loading queue activity..."
			emptyMessage="No jobs match the selected queue and state filters."
			onRowClick={(row) => {
				const r = row as { queue?: string; id?: string };
				const queue = r.queue || "provisioning";
				const id = r.id;
				if (id) router.push(platformEndpoints.jobs.detail(queue, id));
			}}
		/>
	);
}
