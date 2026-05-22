"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessGate } from "@/components/access-gate";
import { OrganizationSelector } from "@/components/organization-selector";
import { PlatformOverviewCrumb } from "@/components/platform-overview-crumb";
import { ResourceTable } from "@/components/resource-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DeviceRow } from "@/lib/api-schemas/devices";
import {
	approveDevice,
	type DeviceStatusFilter,
	listDevices,
	revokeDevice,
	updateDeviceNickname,
} from "@/lib/devices-api";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { useOperatorPrefsStore } from "@/lib/operator-prefs-store";
import { P } from "@/lib/permissions";
import { qk } from "@/lib/query-keys";
import type { ResourceField } from "@/lib/resource-config";

function truncateUuid(uuid: string): string {
	if (uuid.length <= 14) return uuid;
	return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
}

function formatTimestamp(value?: string | null): string {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Unknown";
	return date.toLocaleString();
}

function statusBadge(status: "pending" | "approved" | "revoked") {
	if (status === "pending") return <Badge variant="outline">Pending</Badge>;
	if (status === "approved") return <Badge>Approved</Badge>;
	return <Badge variant="destructive">Revoked</Badge>;
}

function resolveDeviceOrganizationId(
	row: DeviceRow,
	selectedOrganizationId: string | undefined,
): string | undefined {
	if (selectedOrganizationId) return selectedOrganizationId;
	const raw = row.organization;
	if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
	return undefined;
}

export default function DevicesPage() {
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<DeviceStatusFilter>("pending");
	const [organizationId, setOrganizationId] = useState(
		useOperatorPrefsStore.getState().auditsDefaultOrgId || undefined,
	);
	const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
	const [nicknameDraft, setNicknameDraft] = useState("");

	const devicesQuery = useQuery({
		queryKey: qk.devicesList({ status: tab, organizationId }),
		queryFn: () =>
			listDevices({
				status: tab,
				...(organizationId ? { organizationId } : {}),
			}),
	});

	const allDevicesQuery = useQuery({
		queryKey: qk.devicesList({ status: "all", organizationId }),
		queryFn: () =>
			listDevices({
				status: "all",
				...(organizationId ? { organizationId } : {}),
			}),
	});

	const invalidateDeviceQueries = () => {
		void queryClient.invalidateQueries({ queryKey: qk.devicesListRoot });
		void queryClient.invalidateQueries({ queryKey: qk.devicesPendingCount() });
	};

	const approveMutation = useMutation({
		mutationFn: ({
			deviceId,
			organizationId: orgId,
		}: {
			deviceId: string;
			organizationId: string;
		}) => approveDevice(deviceId, orgId),
		onSuccess: () => {
			invalidateDeviceQueries();
			toast.success("Device approved.");
		},
		onError: (error) =>
			toast.error(mutationErrorMessage(error, "Approve failed")),
	});

	const revokeMutation = useMutation({
		mutationFn: ({
			deviceId,
			organizationId: orgId,
		}: {
			deviceId: string;
			organizationId: string;
		}) => revokeDevice(deviceId, orgId),
		onSuccess: () => {
			invalidateDeviceQueries();
			toast.success("Device revoked.");
		},
		onError: (error) =>
			toast.error(mutationErrorMessage(error, "Revoke failed")),
	});

	const nicknameMutation = useMutation({
		mutationFn: ({
			id,
			nickname,
			organizationId: orgId,
		}: {
			id: string;
			nickname: string;
			organizationId: string;
		}) => updateDeviceNickname(id, orgId, nickname),
		onSuccess: () => {
			setEditingDeviceId(null);
			setNicknameDraft("");
			invalidateDeviceQueries();
			toast.success("Nickname updated.");
		},
		onError: (error) =>
			toast.error(mutationErrorMessage(error, "Nickname update failed")),
	});

	const devices = devicesQuery.data ?? [];
	const counts = useMemo(() => {
		const source = allDevicesQuery.data ?? [];
		return source.reduce(
			(acc, row) => {
				acc.all += 1;
				acc[row.status] += 1;
				return acc;
			},
			{ all: 0, pending: 0, approved: 0, revoked: 0 },
		);
	}, [allDevicesQuery.data]);

	const mutationPending =
		approveMutation.isPending ||
		revokeMutation.isPending ||
		nicknameMutation.isPending;

	const columns: ResourceField[] = useMemo(
		() => [
			{
				key: "nickname",
				label: "Nickname",
				type: "custom",
				render: (rowRaw) => {
					const row = rowRaw as DeviceRow;
					const isEditing = editingDeviceId === row._id;
					const orgForNickname = resolveDeviceOrganizationId(
						row,
						organizationId,
					);
					if (!isEditing) return row.nickname || "—";
					return (
						<div className="flex items-center gap-2">
							<Input
								value={nicknameDraft}
								onChange={(event) => setNicknameDraft(event.target.value)}
								placeholder="Device nickname"
								className="h-8"
							/>
							<Button
								size="sm"
								disabled={mutationPending || !orgForNickname}
								onClick={() => {
									if (!orgForNickname) return;
									nicknameMutation.mutate({
										id: row._id,
										nickname: nicknameDraft,
										organizationId: orgForNickname,
									});
								}}
							>
								Save
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setEditingDeviceId(null);
									setNicknameDraft("");
								}}
							>
								Cancel
							</Button>
						</div>
					);
				},
			},
			{
				key: "uuid",
				label: "UUID",
				type: "custom",
				render: (rowRaw) => {
					const row = rowRaw as DeviceRow;
					return <span className="font-mono">{truncateUuid(row.uuid)}</span>;
				},
			},
			{
				key: "status",
				label: "Status",
				type: "custom",
				render: (rowRaw) => {
					const row = rowRaw as DeviceRow;
					return statusBadge(row.status);
				},
			},
			{
				key: "lastSeenAt",
				label: "Last Seen",
				type: "custom",
				render: (rowRaw) => {
					const row = rowRaw as DeviceRow;
					return formatTimestamp(row.lastSeenAt);
				},
			},
			{
				key: "actions",
				label: "Actions",
				type: "custom",
				render: (rowRaw) => {
					const row = rowRaw as DeviceRow;
					const orgForMutation = resolveDeviceOrganizationId(
						row,
						organizationId,
					);
					const canMutateOrg = Boolean(orgForMutation);
					return (
						<div className="flex justify-end gap-2">
							{row.status === "pending" ? (
								<>
									<Button
										size="sm"
										disabled={mutationPending || !canMutateOrg}
										onClick={() => {
											if (!orgForMutation) return;
											approveMutation.mutate({
												deviceId: row._id,
												organizationId: orgForMutation,
											});
										}}
									>
										Approve
									</Button>
									<Button
										size="sm"
										variant="destructive"
										disabled={mutationPending || !canMutateOrg}
										onClick={() => {
											if (!orgForMutation) return;
											revokeMutation.mutate({
												deviceId: row._id,
												organizationId: orgForMutation,
											});
										}}
									>
										Reject
									</Button>
								</>
							) : (
								<>
									<Button
										size="sm"
										variant="outline"
										onClick={() => {
											setEditingDeviceId(row._id);
											setNicknameDraft(row.nickname ?? "");
										}}
									>
										Edit Nickname
									</Button>
									<Badge variant="secondary">Final decision</Badge>
								</>
							)}
						</div>
					);
				},
			},
		],
		[
			approveMutation,
			editingDeviceId,
			mutationPending,
			nicknameDraft,
			nicknameMutation,
			organizationId,
			revokeMutation,
		],
	);

	return (
		<AccessGate permission={P.ORG_READ}>
			<div className="space-y-6">
				<PlatformOverviewCrumb section="Security" />
				<div className="flex items-start justify-between gap-3">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Devices</h1>
						<p className="text-sm text-muted-foreground">
							Approve and revoke POS terminals across organizations.
						</p>
					</div>
					<div className="rounded-xl border bg-card p-2">
						<Monitor className="h-5 w-5 text-muted-foreground" />
					</div>
				</div>

				<div className="grid gap-4 sm:grid-cols-3">
					<Card>
						<CardHeader className="pb-2">
							<CardDescription>Total Devices</CardDescription>
							<CardTitle>{counts.all}</CardTitle>
						</CardHeader>
					</Card>
					<Card>
						<CardHeader className="pb-2">
							<CardDescription>Pending Approval</CardDescription>
							<CardTitle>{counts.pending}</CardTitle>
						</CardHeader>
					</Card>
					<Card>
						<CardHeader className="pb-2">
							<CardDescription>Revoked</CardDescription>
							<CardTitle>{counts.revoked}</CardTitle>
						</CardHeader>
					</Card>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Managed Devices</CardTitle>
						<CardDescription>
							Default view is pending approvals. Approve/reject is one-time and
							immutable.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<Tabs
							value={tab}
							onValueChange={(value) => setTab(value as DeviceStatusFilter)}
						>
							<TabsList>
								<TabsTrigger value="pending">Pending</TabsTrigger>
								<TabsTrigger value="all">All</TabsTrigger>
								<TabsTrigger value="approved">Approved</TabsTrigger>
								<TabsTrigger value="revoked">Revoked</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="max-w-sm">
							<OrganizationSelector
								value={organizationId}
								onChange={setOrganizationId}
							/>
						</div>
						{!organizationId ? (
							<p className="text-sm text-muted-foreground">
								All orgs: showing devices across every organization.
								Approve/reject uses each device&apos;s organization
								automatically.
							</p>
						) : null}

						{devicesQuery.isLoading ? (
							<Skeleton className="h-[220px] w-full" />
						) : (
							<ResourceTable
								columns={columns}
								data={[...devices]}
								emptyMessage="No devices for this filter."
							/>
						)}
					</CardContent>
				</Card>
			</div>
		</AccessGate>
	);
}
