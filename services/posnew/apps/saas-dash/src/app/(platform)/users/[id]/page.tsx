"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Ban,
	Loader2,
	MailWarning,
	Play,
	UserCog,
	UserRoundX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { platformGlobalUserDetailResponseSchema } from "@/lib/api-schemas/users";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { parseApiResponse } from "@/lib/parse-api-response";
import { P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";
import { usePermission } from "@/lib/use-permission";

async function createImpersonationSession(
	userId: string,
): Promise<{ redirectUrl?: string }> {
	const response = await platformJson<{ data?: { redirectUrl?: string } }>(
		"/impersonation/session",
		{
			method: "POST",
			body: JSON.stringify({ userId }),
		},
	);
	return response.data || {};
}

export default function GlobalUserDetailPage({
	params,
}: Readonly<{ params: { id: string } }>) {
	const router = useRouter();
	const qc = useQueryClient();
	const canRead = usePermission(P.ORG_READ);
	const canWrite = usePermission(P.ORG_WRITE);

	useEffect(() => {
		if (canRead === false) {
			router.replace("/unauthorized");
		}
	}, [canRead, router]);

	const { data: user, isLoading } = useQuery({
		queryKey: qk.usersGlobalDetail(params.id),
		queryFn: async () => {
			const raw = await platformJson<unknown>(`/users/global/${params.id}`);
			const parsed = parseApiResponse(
				platformGlobalUserDetailResponseSchema,
				raw,
				"global user detail",
			);
			return parsed.data;
		},
		enabled: canRead === true,
	});

	const { mutate: mutateStatus, isPending: statusPending } = useMutation({
		mutationFn: async (status: string) => {
			await platformJson(`/users/global/${params.id}/status`, {
				method: "PATCH",
				body: JSON.stringify({ status }),
			});
		},
		onSuccess: () => {
			toast.success("User status updated");
			invalidateQueriesEverywhere(qc, "globalUserStatus");
		},
	});

	const { mutate: resetPassword, isPending: resetPending } = useMutation({
		mutationFn: async () => {
			await platformJson(`/users/global/${params.id}/reset`, {
				method: "POST",
			});
		},
		onSuccess: () => {
			toast.success("User credentials successfully purged.");
			invalidateQueriesEverywhere(qc, "globalUserReset");
		},
	});

	const { mutate: startImpersonation, isPending: impersonatePending } =
		useMutation({
			mutationFn: () => createImpersonationSession(params.id),
			onSuccess: (data) => {
				if (data?.redirectUrl) {
					window.open(data.redirectUrl, "_blank");
				}
			},
			onError: (err: unknown) => {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				toast.error(`Impersonation failed: ${errorMessage}`);
			},
		});

	if (canRead === undefined) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-9 w-full max-w-md" />
				<div className="grid gap-6 md:grid-cols-2">
					<Skeleton className="h-40 rounded-xl" />
					<Skeleton className="h-40 rounded-xl" />
				</div>
			</div>
		);
	}

	if (canRead === false) return null;

	if (isLoading) {
		return (
			<div className="space-y-6">
				<PlatformBreadcrumbs
					items={[
						{ label: "Global users", href: "/users" },
						{ label: "Loading…", current: true },
					]}
				/>
				<Skeleton className="h-9 w-full max-w-md" />
				<div className="grid gap-6 md:grid-cols-2">
					<Skeleton className="h-72 rounded-lg" />
					<Skeleton className="h-72 rounded-lg" />
				</div>
			</div>
		);
	}

	if (!user) {
		return (
			<div className="space-y-6">
				<PlatformBreadcrumbs
					items={[
						{ label: "Global users", href: "/users" },
						{ label: "Not found", current: true },
					]}
				/>
				<Empty className="border bg-card">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<UserRoundX className="text-muted-foreground" />
						</EmptyMedia>
						<EmptyTitle>User not found</EmptyTitle>
						<EmptyDescription>
							This id is not in the global directory, or you may lack access.
							Return to the directory to search again.
						</EmptyDescription>
					</EmptyHeader>
					<Button asChild variant="secondary">
						<Link href="/users">Back to global users</Link>
					</Button>
				</Empty>
			</div>
		);
	}

	const heading = [user.name, user.email].filter(Boolean).join(" · ");

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<PlatformBreadcrumbs
					items={[
						{ label: "Global users", href: "/users" },
						{ label: heading, current: true },
					]}
				/>
				<h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
				<p className="text-sm text-muted-foreground">
					{user.email || "No email on file"}
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				{/* Details Card */}
				<div className="rounded-lg border bg-card p-6 shadow-sm">
					<h2 className="text-lg font-semibold mb-4">Master Record</h2>
					<div className="space-y-3 text-sm">
						<div className="flex justify-between border-b pb-2">
							<span className="text-muted-foreground">Internal ID</span>
							<span className="font-mono">{user._id}</span>
						</div>
						<div className="flex justify-between border-b pb-2">
							<span className="text-muted-foreground">Privilege Chain</span>
							<span className="font-semibold capitalize">{user.role}</span>
						</div>
						<div className="flex justify-between border-b pb-2">
							<span className="text-muted-foreground">Organization Tenant</span>
							<span>{user.organization?.name || "None Associated"}</span>
						</div>
						<div className="flex justify-between border-b pb-2">
							<span className="text-muted-foreground">Status Flag</span>
							<span
								className={`font-semibold capitalize ${user.status === "suspended" ? "text-destructive" : "text-green-500"}`}
							>
								{user.status}
							</span>
						</div>
						<div className="flex justify-between border-b pb-2">
							<span className="text-muted-foreground">CreatedAt</span>
							<span>
								{user.createdAt
									? new Date(user.createdAt).toLocaleDateString()
									: "—"}
							</span>
						</div>
					</div>
				</div>

				{/* Danger Zone Actions */}
				{canWrite && (
					<div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 shadow-sm">
						<h2 className="text-lg font-semibold text-destructive mb-4">
							Operations & Lifecycles
						</h2>

						<div className="space-y-4">
							<Button
								variant="outline"
								className="w-full justify-start"
								onClick={() => startImpersonation()}
								disabled={impersonatePending}
							>
								{impersonatePending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<UserCog className="mr-2 h-4 w-4" />
								)}{" "}
								Impersonate Session in New Tab
							</Button>

							{user.status === "active" ? (
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button
											variant="destructive"
											className="w-full justify-start"
											disabled={statusPending}
										>
											{statusPending ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<Ban className="mr-2 h-4 w-4" />
											)}{" "}
											Suspend Tenant Access
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent className="border-destructive/50">
										<AlertDialogHeader>
											<AlertDialogTitle>Suspend Worker?</AlertDialogTitle>
										</AlertDialogHeader>
										<AlertDialogDescription>
											They will immediately lose access to the tenant portal,
											API payloads, and POS architecture.
										</AlertDialogDescription>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												onClick={() => mutateStatus("suspended")}
												className="bg-destructive hover:bg-destructive/90"
											>
												Confirm Suspension
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							) : (
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button
											variant="outline"
											className="w-full justify-start"
											disabled={statusPending}
										>
											{statusPending ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin text-green-500" />
											) : (
												<Play className="mr-2 h-4 w-4 text-green-500" />
											)}{" "}
											Reactivate access
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Restore access?</AlertDialogTitle>
											<AlertDialogDescription>
												This user will be able to sign in and use the tenant
												again according to their role.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel disabled={statusPending}>
												Cancel
											</AlertDialogCancel>
											<AlertDialogAction
												disabled={statusPending}
												onClick={() => mutateStatus("active")}
											>
												Reactivate
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							)}

							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="outline"
										className="w-full justify-start text-orange-500 hover:text-orange-600 border-orange-500/20 hover:bg-orange-500/10"
										disabled={resetPending}
									>
										{resetPending ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<MailWarning className="mr-2 h-4 w-4" />
										)}{" "}
										Trigger Credential Wipe
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent className="border-orange-500/50">
									<AlertDialogHeader>
										<AlertDialogTitle>Reset Credentials</AlertDialogTitle>
									</AlertDialogHeader>
									<AlertDialogDescription>
										This irreversibly purges their PIN combinations and Web
										hashes natively. They will be immediately blocked and forced
										to set a new PIN via account recovery flows.
									</AlertDialogDescription>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											onClick={() => resetPassword()}
											className="bg-orange-500 hover:bg-orange-600"
										>
											Force Scramble Reset
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
