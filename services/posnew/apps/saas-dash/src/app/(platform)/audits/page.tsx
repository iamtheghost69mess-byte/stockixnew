"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterBar } from "@/components/filter-bar";
import { ResourcePage } from "@/components/resource-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { organizationListResponseSchema } from "@/lib/api-schemas/organizations";
import { platformGlobalUserListResponseSchema } from "@/lib/api-schemas/users";
import { parseApiResponse } from "@/lib/parse-api-response";
import { useOperatorPrefsStore } from "@/lib/operator-prefs-store";
import { platformJson } from "@/lib/platform-http";
import { ResourceRegistry } from "@/lib/resource-config";
import { cn } from "@/lib/utils";

function parseDateParam(value: string | null): Date | undefined {
	if (!value) return undefined;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toIsoDateParam(value: Date | undefined): string | undefined {
	if (!value) return undefined;
	return format(value, "yyyy-MM-dd");
}

/**
 * URL query params win over locally pinned default org (operator prefs).
 * Backend: GET /audits supports organizationId, action, userId, from, to, limit.
 */
export default function AuditsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const orgFromUrl = searchParams.get("organizationId");
	const actionFilter = searchParams.get("action");
	const userIdFilter = searchParams.get("userId");
	const fromFilter = searchParams.get("from");
	const toFilter = searchParams.get("to");
	const auditsDefaultOrgId = useOperatorPrefsStore((s) => s.auditsDefaultOrgId);
	const setAuditsDefaultOrgId = useOperatorPrefsStore(
		(s) => s.setAuditsDefaultOrgId,
	);
	const [liveAt, setLiveAt] = useState<number | null>(null);

	const [draftOrg, setDraftOrg] = useState("");
	const [draftAction, setDraftAction] = useState("");
	const [draftUserId, setDraftUserId] = useState("");
	const [draftFromDate, setDraftFromDate] = useState<Date | undefined>(undefined);
	const [draftToDate, setDraftToDate] = useState<Date | undefined>(undefined);

	const organizationsQ = useQuery({
		queryKey: ["platform", "audits", "filter", "organizations"],
		queryFn: async () => {
			const raw = await platformJson<unknown>("/organizations?limit=200");
			const parsed = parseApiResponse(
				organizationListResponseSchema,
				raw,
				"audits organizations filters",
			);
			return parsed.data || [];
		},
		staleTime: 5 * 60 * 1000,
	});

	const usersQ = useQuery({
		queryKey: ["platform", "audits", "filter", "users"],
		queryFn: async () => {
			const raw = await platformJson<unknown>("/users/global?limit=200&skip=0");
			const parsed = parseApiResponse(
				platformGlobalUserListResponseSchema,
				raw,
				"audits users filters",
			);
			return parsed.data.users || [];
		},
		staleTime: 5 * 60 * 1000,
	});

	useEffect(() => {
		setDraftOrg(orgFromUrl ?? "");
		setDraftAction(actionFilter ?? "");
		setDraftUserId(userIdFilter ?? "");
		setDraftFromDate(parseDateParam(fromFilter));
		setDraftToDate(parseDateParam(toFilter));
	}, [orgFromUrl, actionFilter, userIdFilter, fromFilter, toFilter]);

	const effectiveOrgId =
		orgFromUrl?.trim() || auditsDefaultOrgId.trim() || undefined;

	useEffect(() => {
		const onSse = () => setLiveAt(Date.now());
		window.addEventListener("platform-audit-sse", onSse);
		return () => window.removeEventListener("platform-audit-sse", onSse);
	}, []);

	const isLive = liveAt !== null && Date.now() - liveAt < 120_000;

	const auditQueryParams = useMemo(
		() => ({
			organizationId: effectiveOrgId,
			action: actionFilter?.trim() || undefined,
			userId: userIdFilter?.trim() || undefined,
			from: fromFilter?.trim() || undefined,
			to: toFilter?.trim() || undefined,
			limit: 100,
		}),
		[effectiveOrgId, actionFilter, userIdFilter, fromFilter, toFilter],
	);

	const applyFilters = () => {
		const p = new URLSearchParams();
		const o = draftOrg.trim();
		if (o) p.set("organizationId", o);
		const a = draftAction.trim();
		if (a) p.set("action", a);
		const u = draftUserId.trim();
		if (u) p.set("userId", u);
		const f = toIsoDateParam(draftFromDate)?.trim();
		if (f) p.set("from", f);
		const t = toIsoDateParam(draftToDate)?.trim();
		if (t) p.set("to", t);
		router.replace(`/audits?${p.toString()}`);
	};

	const toolbar = (
		<FilterBar>
			<div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<div className="space-y-1">
					<Label className="text-xs">Organization</Label>
					<Select value={draftOrg || "__all"} onValueChange={(v) => setDraftOrg(v === "__all" ? "" : v)}>
						<SelectTrigger className="h-9 text-xs">
							<SelectValue placeholder={organizationsQ.isLoading ? "Loading..." : "All organizations"} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all">All organizations</SelectItem>
							{(organizationsQ.data || []).map((org) => (
								<SelectItem key={org._id} value={org._id}>
									{org.name} ({org.slug})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Action contains</Label>
					<Input
						className="h-9 text-xs"
						value={draftAction}
						onChange={(e) => setDraftAction(e.target.value)}
						placeholder="Regex-friendly substring"
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Actor user</Label>
					<Select
						value={draftUserId || "__all"}
						onValueChange={(v) => setDraftUserId(v === "__all" ? "" : v)}
					>
						<SelectTrigger className="h-9 text-xs">
							<SelectValue placeholder={usersQ.isLoading ? "Loading..." : "All users"} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all">All users</SelectItem>
							{(usersQ.data || []).map((user) => (
								<SelectItem key={user._id} value={user._id}>
									{user.email || user.name || "Unknown user"}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">From date</Label>
					<Popover>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="outline"
								className={cn(
									"h-9 w-full justify-start text-left text-xs font-normal",
									!draftFromDate && "text-muted-foreground",
								)}
							>
								<CalendarIcon className="mr-2 h-4 w-4" />
								{draftFromDate ? format(draftFromDate, "PPP") : "Pick date"}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<Calendar
								mode="single"
								selected={draftFromDate}
								onSelect={setDraftFromDate}
								initialFocus
							/>
						</PopoverContent>
					</Popover>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">To date</Label>
					<Popover>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="outline"
								className={cn(
									"h-9 w-full justify-start text-left text-xs font-normal",
									!draftToDate && "text-muted-foreground",
								)}
							>
								<CalendarIcon className="mr-2 h-4 w-4" />
								{draftToDate ? format(draftToDate, "PPP") : "Pick date"}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<Calendar
								mode="single"
								selected={draftToDate}
								onSelect={setDraftToDate}
								initialFocus
							/>
						</PopoverContent>
					</Popover>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button type="button" size="sm" onClick={applyFilters}>
					Apply filters
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						setDraftOrg("");
						setDraftAction("");
						setDraftUserId("");
						setDraftFromDate(undefined);
						setDraftToDate(undefined);
					}}
				>
					Clear
				</Button>
			</div>
		</FilterBar>
	);

	const extraActions = (
		<div className="flex items-center gap-2">
			{effectiveOrgId && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						setAuditsDefaultOrgId(effectiveOrgId);
						toast.success("Default organization filter saved locally.");
					}}
					className="text-xs font-outfit"
				>
					Pin Org Context
				</Button>
			)}
			<Badge
				variant={isLive ? "secondary" : "outline"}
				className={isLive ? "animate-pulse" : "opacity-50"}
			>
				{isLive ? "Observing Live Flux" : "SSE Idle"}
			</Badge>
		</div>
	);

	return (
		<ResourcePage
			resource={ResourceRegistry.audits}
			title={
				effectiveOrgId
					? `Audit Log: ${effectiveOrgId}`
					: "Platform Audit History"
			}
			description="Cryptographically traceable record of all mutations across the platform ecosystem."
			toolbar={toolbar}
			extraActions={extraActions}
			queryParams={auditQueryParams}
		/>
	);
}
