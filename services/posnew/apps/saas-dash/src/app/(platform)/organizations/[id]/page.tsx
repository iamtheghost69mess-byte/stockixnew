"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OrgLicenseDateField } from "@/components/org-license-date-field";
import { OrganizationObservabilitySection } from "@/components/organization-observability-section";
import { HealthDot } from "@/components/owner/health-dot";
import { OwnerSectionCard } from "@/components/owner/section-card";
import {
	type OwnerLifecycleVariant,
	OwnerStatusBadge,
} from "@/components/owner/status-badge";
import { PlatformBreadcrumbs } from "@/components/platform-breadcrumbs";
import { ProvisioningWizard } from "@/components/provisioning-wizard";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	organizationDetailResponseSchema,
	organizationObservabilityResponseSchema,
} from "@/lib/api-schemas/organizations";
import { deriveOwnerHealthLevelFromStatusFamily } from "@/lib/derive-owner-health-level";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { readOrganizationAccessState } from "@/lib/organization-access-state";
import { parseApiResponse } from "@/lib/parse-api-response";
import { P } from "@/lib/permissions";
import { platformEndpoints } from "@/lib/platform-endpoints";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";
import { tenantOrgUrl } from "@/lib/tenant-url";
import { usePermission } from "@/lib/use-permission";

function parseEntitlements(raw: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function stringifyEntitlements(v: Record<string, unknown>): string {
	return JSON.stringify(v, null, 2);
}

function maskStaffPin(pin: string | undefined): string {
	const s = String(pin || "");
	if (!s) return "—";
	if (!/^\d{4,6}$/.test(s)) return "••••••";
	return `••••${s.slice(-2)}`;
}

function accessStateVariant(
	status: "active" | "expired" | "not_started",
): OwnerLifecycleVariant {
	if (status === "active") return "active";
	if (status === "not_started") return "not_started";
	if (status === "expired") return "expired";
	return "muted";
}

/** Match backend defaults in `entitlementService` / `DEFAULT_ORG_ENTITLEMENTS` when org JSON omits keys */
const DEFAULT_ENT_MAX_LOCATIONS = 5;
const DEFAULT_ENT_MAX_USERS = 25;

export default function OrganizationDetailPage() {
	const params = useParams();
	const id = String(params.id || "");
	const router = useRouter();
	const canRead = usePermission(P.ORG_READ);
	const canWrite = usePermission(P.ORG_WRITE);
	const canImpersonate = usePermission(P.IMPERSONATE);
	const qc = useQueryClient();

	const orgQ = useQuery({
		queryKey: qk.orgDetail(id),
		queryFn: async () => {
			const raw = await platformJson<unknown>(`/organizations/${id}`);
			return parseApiResponse(
				organizationDetailResponseSchema,
				raw,
				"organization detail",
			);
		},
		enabled: !!id && canRead === true,
	});

	const observabilityQ = useQuery({
		queryKey: qk.orgObservability(id),
		queryFn: async () => {
			const raw = await platformJson<unknown>(
				platformEndpoints.organizations.observability(id),
			);
			return parseApiResponse(
				organizationObservabilityResponseSchema,
				raw,
				"organization observability",
			);
		},
		enabled: !!id && canRead === true && !!orgQ.data?.data?.isBootstrapped,
		staleTime: 30_000,
	});

	const [entJson, setEntJson] = useState("{}");
	const [pinVisible, setPinVisible] = useState<Record<string, boolean>>({});
	const [licStart, setLicStart] = useState<Date | undefined>(undefined);
	const [licEnd, setLicEnd] = useState<Date | undefined>(undefined);
	const [copiedTenantUrl, setCopiedTenantUrl] = useState(false);

	useEffect(() => {
		if (canRead === false) router.replace("/unauthorized");
	}, [canRead, router]);

	useEffect(() => {
		const o = orgQ.data?.data;
		if (o?.entitlements && typeof o.entitlements === "object") {
			try {
				setEntJson(JSON.stringify(o.entitlements, null, 2));
			} catch {
				setEntJson("{}");
			}
		}
	}, [orgQ.data]);

	useEffect(() => {
		const org = orgQ.data?.data;
		if (!org) return;
		const startRaw = org.licenseStartDate ?? org.licenseStartsAt;
		const endRaw = org.licenseEndDate ?? org.licenseEndsAt;
		if (startRaw != null && String(startRaw).length > 0) {
			const d = new Date(String(startRaw));
			setLicStart(Number.isNaN(d.getTime()) ? undefined : d);
		} else {
			setLicStart(undefined);
		}
		if (endRaw != null && String(endRaw).length > 0) {
			const d = new Date(String(endRaw));
			setLicEnd(Number.isNaN(d.getTime()) ? undefined : d);
		} else {
			setLicEnd(undefined);
		}
	}, [
		orgQ.data?.data?.licenseStartDate,
		orgQ.data?.data?.licenseEndDate,
		orgQ.data?.data?.licenseStartsAt,
		orgQ.data?.data?.licenseEndsAt,
	]);

	const deleteM = useMutation({
		mutationFn: () =>
			platformJson(`/organizations/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			toast.success("Organization deleted successfully");
			router.replace("/organizations");
			invalidateQueriesEverywhere(qc, "orgDelete");
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Deletion failed")),
	});

	const entM = useMutation({
		mutationFn: () => {
			const raw = JSON.parse(entJson) as Record<string, unknown>;
			const entitlements: Record<string, unknown> = { ...raw };
			if (
				typeof entitlements.maxLocations !== "number" ||
				Number.isNaN(entitlements.maxLocations)
			) {
				entitlements.maxLocations = DEFAULT_ENT_MAX_LOCATIONS;
			}
			if (
				typeof entitlements.maxUsers !== "number" ||
				Number.isNaN(entitlements.maxUsers)
			) {
				entitlements.maxUsers = DEFAULT_ENT_MAX_USERS;
			}
			const ver = Number(orgQ.data?.data?.entitlementsSchemaVersion) || 1;
			return platformJson<unknown>(`/organizations/${id}/entitlements`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ entitlements, entitlementsSchemaVersion: ver }),
			});
		},
		onSuccess: () => {
			toast.success("Entitlements saved");
			invalidateQueriesEverywhere(qc, "orgEntitlements");
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Save failed")),
	});

	const licenseM = useMutation({
		mutationFn: () =>
			platformJson<unknown>(`/organizations/${id}/license`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					licenseStartDate: licStart ? licStart.toISOString() : null,
					licenseEndDate: licEnd ? licEnd.toISOString() : null,
				}),
			}),
		onSuccess: () => {
			toast.success("License dates saved");
			invalidateQueriesEverywhere(qc, "orgEntitlements");
		},
		onError: (e) =>
			toast.error(mutationErrorMessage(e, "License update failed")),
	});

	const resetRolePinM = useMutation({
		mutationFn: (role: string) =>
			platformJson<any>(
				`/organizations/${id}/credentials/${encodeURIComponent(role)}/reset-pin`,
				{
					method: "PATCH",
				},
			),
		onSuccess: (res) => {
			const role = res?.data?.role;
			const pin = res?.data?.pin;
			invalidateQueriesEverywhere(qc, "orgAdminPinReset");
			if (role && pin) {
				setPinVisible((v) => ({ ...v, [role]: true }));
				setTimeout(
					() => setPinVisible((v) => ({ ...v, [role]: false })),
					10000,
				);
			}
			toast.success(`PIN reset for ${role}`);
		},
	});

	const impersonateM = useMutation({
		mutationFn: () =>
			platformJson<{ data: { redirectUrl: string } }>(
				"/impersonation/session",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ organizationId: id }),
				},
			),
		onSuccess: (res) => {
			if (res.data?.redirectUrl) {
				globalThis.location.href = res.data.redirectUrl;
			}
		},
	});

	if (canRead === undefined) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-48 rounded-xl" />
			</div>
		);
	}

	if (canRead === false) return null;

	const o = orgQ.data?.data;
	const accessState = readOrganizationAccessState(o?.accessState);
	const obsData = observabilityQ.data?.data;
	const trafficHealth = deriveOwnerHealthLevelFromStatusFamily(
		obsData?.apiUsage?.windows?.byStatusFamily?.last24h,
	);
	const ent = parseEntitlements(entJson);
	const modules =
		ent.modules && typeof ent.modules === "object" ? (ent.modules as any) : {};
	const storedMaxLocations =
		typeof ent.maxLocations === "number" && !Number.isNaN(ent.maxLocations)
			? ent.maxLocations
			: undefined;
	const storedMaxUsers =
		typeof ent.maxUsers === "number" && !Number.isNaN(ent.maxUsers)
			? ent.maxUsers
			: undefined;
	const effectiveMaxLocations = storedMaxLocations ?? DEFAULT_ENT_MAX_LOCATIONS;
	const effectiveMaxUsers = storedMaxUsers ?? DEFAULT_ENT_MAX_USERS;
	const maxLocationsInput =
		storedMaxLocations !== undefined
			? String(storedMaxLocations)
			: String(DEFAULT_ENT_MAX_LOCATIONS);
	const maxUsersInput =
		storedMaxUsers !== undefined
			? String(storedMaxUsers)
			: String(DEFAULT_ENT_MAX_USERS);
	const usingDefaultMaxUsers = storedMaxUsers === undefined;
	const usingDefaultMaxLocations = storedMaxLocations === undefined;
	const staffUsedTelemetry =
		typeof obsData?.entityCounts?.users === "number"
			? obsData.entityCounts.users
			: null;
	const locationsUsedTelemetry =
		typeof obsData?.entityCounts?.locations === "number"
			? obsData.entityCounts.locations
			: null;
	const tenantHref = useMemo(() => {
		const fromConfig = tenantOrgUrl(o?.slug);
		if (fromConfig) return fromConfig;
		const slug = String(o?.slug || "").trim();
		if (!slug) return null;
		if (typeof window === "undefined") return null;
		const host = window.location.hostname.toLowerCase();
		const isLocalHost =
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "::1" ||
			host.endsWith(".localhost");
		if (!isLocalHost) return null;
		const protocol = window.location.protocol || "http:";
		const port = window.location.port ? `:${window.location.port}` : "";
		return `${protocol}//${encodeURIComponent(slug)}.localhost${port}`;
	}, [o?.slug]);
	const tenantAccessUrl = tenantHref || "—";
	const createdAt = o?.createdAt
		? new Date(String(o.createdAt)).toLocaleString()
		: "—";
	const defaultCredRows = Array.isArray(o?.defaultCredentials)
		? o.defaultCredentials
		: [];

	const copyTenantAccessUrl = async () => {
		if (!tenantHref) return;
		try {
			await navigator.clipboard.writeText(tenantHref);
			setCopiedTenantUrl(true);
			toast.success("Access URL copied");
			setTimeout(() => setCopiedTenantUrl(false), 1500);
		} catch {
			toast.error("Could not copy access URL");
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<PlatformBreadcrumbs
						items={[
							{ label: "Organizations", href: "/organizations" },
							{
								label: orgQ.isLoading ? "Loading…" : o?.name || "Organization",
								current: true,
							},
						]}
					/>
					<h1 className="text-2xl font-semibold flex items-center gap-2">
						{orgQ.isLoading ? <Skeleton className="h-8 w-48" /> : o?.name}
						{o?.isBootstrapped ? <HealthDot level={trafficHealth} /> : null}
					</h1>
					<p className="text-muted-foreground text-sm font-mono">ID: {id}</p>
				</div>

				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								disabled={
									!canImpersonate ||
									impersonateM.isPending ||
									!o?.isBootstrapped
								}
								onClick={() => impersonateM.mutate()}
								className="gap-2"
							>
								{impersonateM.isPending ? "Connecting..." : "Impersonate"}
							</Button>
						</TooltipTrigger>
						{!canImpersonate && (
							<TooltipContent>Insufficient permissions</TooltipContent>
						)}
						{!o?.isBootstrapped && (
							<TooltipContent>Only available after provisioning</TooltipContent>
						)}
					</Tooltip>
				</TooltipProvider>
			</div>

			{orgQ.isError && (
				<p className="text-destructive">Could not load organization.</p>
			)}

			{!o?.isBootstrapped && o && (
				<div className="max-w-2xl mx-auto py-10">
					<ProvisioningWizard
						organizationId={id}
						onComplete={() =>
							invalidateQueriesEverywhere(qc, "bootstrapComplete")
						}
					/>
				</div>
			)}

			{o?.isBootstrapped && (
				<>
					<OwnerSectionCard
						title="Identity & access"
						description="Key organization details and current operating status."
					>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="rounded-md border p-3">
								<p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
									Access State
								</p>
								<div className="mt-1 space-y-1">
									<OwnerStatusBadge
										label={accessState.status.replace("_", " ")}
										variant={accessStateVariant(accessState.status)}
									/>
									<p className="text-xs text-muted-foreground">
										{accessState.reason}
									</p>
								</div>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
									Provisioning
								</p>
								<div className="mt-1">
									<OwnerStatusBadge
										label="Verified & active"
										variant="active"
									/>
								</div>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
									Plan
								</p>
								<p className="mt-1 font-medium capitalize">
									{(o?.planKey || "standard").replace("_", " ")}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
									Access URL
								</p>
								<div className="mt-2 flex flex-wrap items-center gap-2">
									<Input
										readOnly
										value={tenantAccessUrl}
										aria-label="Tenant access URL"
										className="h-9 flex-1 min-w-[280px] font-mono text-xs"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-9 shrink-0 gap-1.5"
										onClick={() => void copyTenantAccessUrl()}
										disabled={!tenantHref}
									>
										{copiedTenantUrl ? (
											<Check className="h-3.5 w-3.5" aria-hidden />
										) : (
											<Copy className="h-3.5 w-3.5" aria-hidden />
										)}
										Copy
									</Button>
									<Button
										variant="default"
										size="sm"
										className="h-9 shrink-0 gap-1.5"
										disabled={!tenantHref}
										asChild
									>
										<a
											href={tenantHref || "#"}
											target="_blank"
											rel="noopener noreferrer"
										>
											<ExternalLink className="h-3.5 w-3.5" aria-hidden />
											Open
										</a>
									</Button>
								</div>
							</div>
						</div>
					</OwnerSectionCard>

					<OrganizationObservabilitySection
						isLoading={observabilityQ.isLoading}
						isError={observabilityQ.isError}
						data={observabilityQ.data?.data}
					/>

					<OwnerSectionCard
						title="Default staff credentials"
						description="Initial staff PINs. After reset, PIN stays visible for 10s."
					>
						{defaultCredRows.length === 0 ? (
							<p className="text-muted-foreground text-sm italic">
								No default credentials found.
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Role</TableHead>
										<TableHead>Username</TableHead>
										<TableHead>PIN</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{defaultCredRows.map((row) => {
										const roleKey = String(row.role);
										const revealed = Boolean(pinVisible[roleKey]);
										return (
											<TableRow key={roleKey}>
												<TableCell className="font-medium">
													{row.role}
												</TableCell>
												<TableCell>
													{row.username || row.name || row.role}
												</TableCell>
												<TableCell className="font-mono">
													{revealed ? row.pin : maskStaffPin(row.pin)}
												</TableCell>
												<TableCell className="text-right flex items-center justify-end gap-2">
													<Button
														variant="ghost"
														size="sm"
														onClick={() =>
															setPinVisible((v) => ({
																...v,
																[roleKey]: !v[roleKey],
															}))
														}
													>
														{revealed ? (
															<EyeOff className="h-4 w-4" />
														) : (
															<Eye className="h-4 w-4" />
														)}
													</Button>
													{canWrite && (
														<Button
															variant="outline"
															size="sm"
															onClick={() => resetRolePinM.mutate(roleKey)}
														>
															Reset
														</Button>
													)}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						)}
					</OwnerSectionCard>

					<OwnerSectionCard title="Profile">
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="rounded-md border p-3">
								<Label className="text-xs opacity-70">Owner Email</Label>
								<p className="text-sm font-medium">
									{o?.ownerEmail || "Not set"}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<Label className="text-xs opacity-70">Joined</Label>
								<p className="text-sm">{createdAt}</p>
							</div>
						</div>
					</OwnerSectionCard>

					<OwnerSectionCard
						title="Commercial license"
						description="Tenant-facing license window. Stored on the organization record."
					>
						<div className="grid gap-4 sm:grid-cols-2">
							<OrgLicenseDateField
								label="License start"
								value={licStart}
								onChange={setLicStart}
								disabled={!canWrite}
							/>
							<OrgLicenseDateField
								label="License end"
								value={licEnd}
								onChange={setLicEnd}
								disabled={!canWrite}
							/>
						</div>
						{canWrite ? (
							<Button
								className="mt-3"
								onClick={() => licenseM.mutate()}
								disabled={licenseM.isPending}
							>
								{licenseM.isPending ? "Saving…" : "Save license dates"}
							</Button>
						) : null}
					</OwnerSectionCard>

					<OwnerSectionCard title="Plan & entitlements">
						<div className="space-y-4">
							<div className="rounded-md border p-3 text-sm">
								<span className="text-muted-foreground">
									Staff usage (telemetry)
								</span>
								<p className="mt-1 font-medium tabular-nums">
									{staffUsedTelemetry != null ? staffUsedTelemetry : "—"} /{" "}
									{effectiveMaxUsers} max staff
									{usingDefaultMaxUsers ? (
										<span className="mt-1 block font-normal text-muted-foreground text-xs">
											Cap uses plan default ({DEFAULT_ENT_MAX_USERS}) until
											stored on this org — adjust below and save to persist.
										</span>
									) : null}
								</p>
								<span className="mt-3 block text-muted-foreground">
									Branches (telemetry)
								</span>
								<p className="mt-1 font-medium tabular-nums">
									{locationsUsedTelemetry != null
										? locationsUsedTelemetry
										: "—"}{" "}
									/ {effectiveMaxLocations} max locations
									{usingDefaultMaxLocations ? (
										<span className="mt-1 block font-normal text-muted-foreground text-xs">
											Cap uses plan default ({DEFAULT_ENT_MAX_LOCATIONS}) until
											stored — save entitlements to persist.
										</span>
									) : null}
								</p>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label>Max Locations</Label>
									<Input
										value={maxLocationsInput}
										onChange={(e) =>
											setEntJson(
												stringifyEntitlements({
													...ent,
													maxLocations: Math.max(
														0,
														Math.floor(Number(e.target.value)) || 0,
													),
												}),
											)
										}
										disabled={!canWrite}
									/>
								</div>
								<div className="space-y-2">
									<Label>Max staff users</Label>
									<Input
										value={maxUsersInput}
										onChange={(e) =>
											setEntJson(
												stringifyEntitlements({
													...ent,
													maxUsers: Math.max(
														0,
														Math.floor(Number(e.target.value)) || 0,
													),
												}),
											)
										}
										disabled={!canWrite}
									/>
								</div>
								<div className="space-y-2 sm:col-span-2">
									<Label>Feature Modules</Label>
									<div className="flex gap-4">
										<Badge
											variant={modules.accounting ? "default" : "outline"}
											className="cursor-pointer"
											onClick={() =>
												canWrite &&
												setEntJson(
													stringifyEntitlements({
														...ent,
														modules: {
															...modules,
															accounting: !modules.accounting,
														},
													}),
												)
											}
										>
											Accounting
										</Badge>
									</div>
								</div>
							</div>
							{canWrite && (
								<Button onClick={() => entM.mutate()} disabled={entM.isPending}>
									Update Entitlements
								</Button>
							)}
						</div>
					</OwnerSectionCard>

					<OwnerSectionCard
						title="Danger zone"
						headerClassName="text-destructive [&_h3]:text-destructive"
					>
						<div className="flex flex-wrap items-center gap-4">
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="ghost" className="text-destructive ml-auto">
										Delete Org
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Destructive Action</AlertDialogTitle>
										<AlertDialogDescription>
											Delete this organization forever? This cannot be undone.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											className="bg-destructive"
											onClick={() => deleteM.mutate()}
										>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</OwnerSectionCard>
				</>
			)}
		</div>
	);
}
