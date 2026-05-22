"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { OrgLicenseDateField } from "@/components/org-license-date-field";
import { ResourcePage } from "@/components/resource-page";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	organizationHealthSummaryResponseSchema,
	organizationListResponseSchema,
} from "@/lib/api-schemas/organizations";
import { setFormDirty } from "@/lib/dirty-form-registry";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { parseApiResponse } from "@/lib/parse-api-response";
import { P } from "@/lib/permissions";
import { platformEndpoints } from "@/lib/platform-endpoints";
import { platformJson } from "@/lib/platform-http";
import { ResourceRegistry } from "@/lib/resource-config";
import { organizationCreateSchema } from "@/lib/schemas/org";
import { usePermission } from "@/lib/use-permission";

const PROVISION_MAX_MS = 30_000;
const PROVISION_POLL_MS = 2_000;
const POS_DOMAIN_SUFFIX = "pos.zerowix.cloud";

function slugifyOrganizationName(value: string): string {
	const ascii = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	const compact = ascii
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!compact) return "org";
	return compact.slice(0, 63);
}

/**
 * Organizations management: metadata-driven list with batch health rollup and canonical access-state visibility.
 */
export default function OrganizationsPage() {
	const router = useRouter();
	const canWrite = usePermission(P.ORG_WRITE);
	const qc = useQueryClient();

	const [provisionWatchOrgId, setProvisionWatchOrgId] = useState<string | null>(
		null,
	);
	const provisionStartedAtRef = useRef<number>(0);
	const provisionTimeoutNotifiedRef = useRef(false);

	const enrichOrgRows = useCallback(async (rows: Record<string, unknown>[]) => {
		const ids = rows
			.map((r) => String(r._id ?? r.id ?? ""))
			.filter((id) => id.length > 0);
		if (ids.length === 0) return rows;
		const url = platformEndpoints.organizations.healthSummary(ids);
		const raw = await platformJson<unknown>(url);
		const parsed = parseApiResponse(
			organizationHealthSummaryResponseSchema,
			raw,
			"organization health summary",
		);
		const list = parsed.data ?? [];
		const map = new Map(list.map((h) => [h.organizationId, h]));
		return rows.map((r) => {
			const id = String(r._id ?? r.id ?? "");
			const h = map.get(id) ?? null;
			return { ...r, ownerHealthSummary: h };
		});
	}, []);

	const idemRef = useRef<string | null>(null);
	const createM = useMutation({
		mutationFn: async (body: unknown) => {
			const key = idemRef.current || crypto.randomUUID();
			idemRef.current = key;
			return platformJson<{
				data?: { _id?: string; id?: string };
				bootstrapMode?: string;
			}>("/organizations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				idempotencyKey: key,
			});
		},
		onSuccess: (data) => {
			const id = data?.data?._id || data?.data?.id;
			const slug = String((data?.data as Record<string, unknown> | undefined)?.slug || "");
			if (id && data?.bootstrapMode === "queue") {
				provisionTimeoutNotifiedRef.current = false;
				provisionStartedAtRef.current = Date.now();
				setProvisionWatchOrgId(String(id));
				toast.loading("Provisioning tenant infrastructure…", {
					id: "org-provision",
				});
				return;
			}
			toast.success("Organization created successfully", {
				description: slug
					? `Your POS URL will be: ${slug}.${POS_DOMAIN_SUFFIX}`
					: undefined,
			});
			if (id) router.push(`/organizations/${id}`);
			invalidateQueriesEverywhere(qc, "orgCreate");
		},
		onError: (e) =>
			toast.error(mutationErrorMessage(e, "Could not create organization")),
	});

	const provisionQ = useQuery({
		queryKey: ["platform", "org", provisionWatchOrgId, "provisioning-status"],
		queryFn: async () => {
			const id = provisionWatchOrgId;
			if (!id) return null;
			return platformJson<{
				data?: { readyForPinLogin?: boolean; slug?: string };
			}>(
				`/organizations/${encodeURIComponent(id)}/provisioning-status`,
			);
		},
		enabled: Boolean(provisionWatchOrgId),
		refetchInterval: (query) => {
			if (
				typeof document !== "undefined" &&
				document.visibilityState !== "visible"
			) {
				return false;
			}
			if (Date.now() - provisionStartedAtRef.current > PROVISION_MAX_MS) {
				return false;
			}
			const d = query.state.data;
			if (d?.data?.readyForPinLogin === true) return false;
			return PROVISION_POLL_MS;
		},
	});

	useEffect(() => {
		if (!provisionWatchOrgId) return;
		if (provisionQ.data?.data?.readyForPinLogin !== true) return;
		provisionTimeoutNotifiedRef.current = false;
		toast.dismiss("org-provision");
		const slug = String(provisionQ.data?.data?.slug || "");
		toast.success("Organization created successfully", {
			description: slug
				? `Your POS URL will be: ${slug}.${POS_DOMAIN_SUFFIX}`
				: undefined,
		});
		router.push(`/organizations/${provisionWatchOrgId}`);
		setProvisionWatchOrgId(null);
		invalidateQueriesEverywhere(qc, "orgCreate");
	}, [provisionWatchOrgId, provisionQ.data, qc, router]);

	useEffect(() => {
		if (!provisionWatchOrgId) return;
		if (Date.now() - provisionStartedAtRef.current <= PROVISION_MAX_MS) return;
		if (provisionQ.data?.data?.readyForPinLogin === true) return;
		if (provisionTimeoutNotifiedRef.current) return;
		provisionTimeoutNotifiedRef.current = true;
		toast.dismiss("org-provision");
		toast.message(
			"Provisioning is still running in the background. Watch the audit feed for completion.",
		);
		setProvisionWatchOrgId(null);
		invalidateQueriesEverywhere(qc, "orgCreate");
	}, [provisionWatchOrgId, provisionQ.data, provisionQ.dataUpdatedAt, qc]);

	return (
		<ResourcePage
			resource={ResourceRegistry.organizations}
			description="Manage tenant metadata, license windows, and deterministic access state."
			enrichRows={enrichOrgRows}
			extraActions={
				canWrite && (
					<CreateOrgDialog
						onCreate={(v) => createM.mutate(v)}
						loading={createM.isPending}
					/>
				)
			}
		/>
	);
}

function optionalPositiveInt(value: string): number | undefined {
	const t = value.trim();
	if (!t) return undefined;
	const n = Number.parseInt(t, 10);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

function CreateOrgDialog({
	onCreate,
	loading,
}: {
	onCreate: (v: unknown) => void;
	loading: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [discardOpen, setDiscardOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [ownerEmail, setOwnerEmail] = useState("");
	const [ownerName, setOwnerName] = useState("");
	const [maxLocationsStr, setMaxLocationsStr] = useState("");
	const [maxUsersStr, setMaxUsersStr] = useState("");
	const [licenseStart, setLicenseStart] = useState<Date | undefined>(undefined);
	const [licenseEnd, setLicenseEnd] = useState<Date | undefined>(undefined);

	const parsed = useMemo(
		() =>
			organizationCreateSchema.safeParse({
				name,
				slug,
				ownerEmail,
				ownerName,
				maxLocations: optionalPositiveInt(maxLocationsStr),
				maxUsers: optionalPositiveInt(maxUsersStr),
				licenseStartDate: licenseStart ? licenseStart.toISOString() : undefined,
				licenseEndDate: licenseEnd ? licenseEnd.toISOString() : undefined,
			}),
		[
			name,
			slug,
			ownerEmail,
			ownerName,
			maxLocationsStr,
			maxUsersStr,
			licenseStart,
			licenseEnd,
		],
	);
	const isDirty = Boolean(
		name.trim() ||
			slug.trim() ||
			ownerEmail.trim() ||
			ownerName.trim() ||
			maxLocationsStr.trim() ||
			maxUsersStr.trim() ||
			licenseStart ||
			licenseEnd,
	);

	useEffect(() => {
		setFormDirty("org-create-dialog", isDirty);
		return () => setFormDirty("org-create-dialog", false);
	}, [isDirty]);

	useEffect(() => {
		if (slugEdited) return;
		setSlug(slugifyOrganizationName(name));
	}, [name, slugEdited]);

	const slugAvailabilityQ = useQuery({
		queryKey: ["platform", "orgs", "slug-availability", slug],
		queryFn: async () => {
			const raw = await platformJson<unknown>(
				`/organizations?q=${encodeURIComponent(slug)}&limit=10`,
			);
			const parsed = parseApiResponse(
				organizationListResponseSchema,
				raw,
				"organization slug availability",
			);
			return (parsed.data || []).some(
				(org) => String(org.slug || "").toLowerCase() === slug.toLowerCase(),
			);
		},
		enabled: open && slug.trim().length > 1,
		staleTime: 10_000,
	});

	const slugExists = Boolean(slugAvailabilityQ.data);

	const checkSlugExists = useCallback(async (value: string) => {
		const raw = await platformJson<unknown>(
			`/organizations?q=${encodeURIComponent(value)}&limit=10`,
		);
		const parsed = parseApiResponse(
			organizationListResponseSchema,
			raw,
			"organization slug check",
		);
		return (parsed.data || []).some(
			(org) => String(org.slug || "").toLowerCase() === value.toLowerCase(),
		);
	}, []);

	const findAvailableSlug = useCallback(
		async (rawValue: string) => {
			const base = slugifyOrganizationName(rawValue).replace(/^-+|-+$/g, "") || "org";
			for (let i = 1; i <= 200; i += 1) {
				const suffix = i === 1 ? "" : `-${i}`;
				const maxBaseLength = 63 - suffix.length;
				const candidate = `${base.slice(0, maxBaseLength)}${suffix}`;
				// eslint-disable-next-line no-await-in-loop
				const exists = await checkSlugExists(candidate);
				if (!exists) return candidate;
			}
			return `${base.slice(0, 58)}-${crypto.randomUUID().slice(0, 4)}`;
		},
		[checkSlugExists],
	);

	const submit = useCallback(() => {
		const run = async () => {
			if (!parsed.success) return;
			const row = parsed.data;
			let nextSlug = row.slug;
			if (!slugEdited) {
				nextSlug = await findAvailableSlug(row.slug);
				if (nextSlug !== row.slug) {
					setSlug(nextSlug);
				}
			} else {
				const manualExists = await checkSlugExists(row.slug);
				if (manualExists) {
					toast.error("Slug already exists. Pick a different slug.");
					return;
				}
			}
			const body: Record<string, unknown> = {
				name: row.name,
				slug: nextSlug,
				ownerEmail: row.ownerEmail,
				ownerName: row.ownerName,
			};
			if (row.planKey) body.planKey = row.planKey;
			const ent: Record<string, unknown> = {};
			if (row.maxLocations != null) ent.maxLocations = row.maxLocations;
			if (row.maxUsers != null) ent.maxUsers = row.maxUsers;
			if (Object.keys(ent).length) body.entitlements = ent;
			if (row.licenseStartDate) body.licenseStartDate = row.licenseStartDate;
			if (row.licenseEndDate) body.licenseEndDate = row.licenseEndDate;
			onCreate(body);
			setOpen(false);
			setName("");
			setSlug("");
			setSlugEdited(false);
			setOwnerEmail("");
			setOwnerName("");
			setMaxLocationsStr("");
			setMaxUsersStr("");
			setLicenseStart(undefined);
			setLicenseEnd(undefined);
		};
		void run();
	}, [
		checkSlugExists,
		findAvailableSlug,
		onCreate,
		parsed.data,
		parsed.success,
		slugEdited,
	]);

	const requestClose = useCallback(
		(next: boolean) => {
			if (!next && isDirty) {
				setDiscardOpen(true);
				return;
			}
			if (!next) {
				setName("");
				setSlug("");
				setSlugEdited(false);
				setOwnerEmail("");
				setOwnerName("");
				setMaxLocationsStr("");
				setMaxUsersStr("");
				setLicenseStart(undefined);
				setLicenseEnd(undefined);
			}
			setOpen(next);
		},
		[isDirty],
	);

	return (
		<>
			<AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard draft?</AlertDialogTitle>
						<AlertDialogDescription>
							The organization draft will be cleared.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setOpen(false);
								setDiscardOpen(false);
								setName("");
								setSlug("");
								setSlugEdited(false);
								setOwnerEmail("");
								setOwnerName("");
								setMaxLocationsStr("");
								setMaxUsersStr("");
								setLicenseStart(undefined);
								setLicenseEnd(undefined);
							}}
						>
							Discard
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog open={open} onOpenChange={requestClose}>
				<DialogTrigger asChild>
					<Button>New Organization</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create environment</DialogTitle>
						<DialogDescription>
							Configure the initial settings for the new tenant workspace.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-3 py-2">
						<div>
							<Label htmlFor="oname">Tenant Name</Label>
							<Input
								id="oname"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="oslug">Tenant Url Slug</Label>
							<Input
								id="oslug"
								value={slug}
								onChange={(e) => {
									setSlugEdited(true);
									setSlug(slugifyOrganizationName(e.target.value));
								}}
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								Your POS URL will be: {slug || "your-slug"}.{POS_DOMAIN_SUFFIX}
							</p>
							{slugExists ? (
								<p className="mt-1 text-xs font-medium text-destructive">
									This slug is already in use.
								</p>
							) : null}
						</div>
						<div className="pt-2 border-t border-dashed mt-2">
							<Label htmlFor="owner_name">
								Owner Name{" "}
								<span className="font-normal text-xs opacity-50">
									(Optional)
								</span>
							</Label>
							<Input
								id="owner_name"
								value={ownerName}
								onChange={(e) => setOwnerName(e.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="owner_email">
								Owner Email{" "}
								<span className="font-normal text-xs opacity-50">
									(Optional)
								</span>
							</Label>
							<Input
								id="owner_email"
								type="email"
								value={ownerEmail}
								onChange={(e) => setOwnerEmail(e.target.value)}
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-2 border-t border-dashed pt-3 mt-1">
							<div>
								<Label htmlFor="omaxloc">Max locations (optional)</Label>
								<Input
									id="omaxloc"
									inputMode="numeric"
									placeholder="Default from plan"
									value={maxLocationsStr}
									onChange={(e) =>
										setMaxLocationsStr(e.target.value.replace(/\D/g, ""))
									}
								/>
							</div>
							<div>
								<Label htmlFor="omaxusers">Max staff users (optional)</Label>
								<Input
									id="omaxusers"
									inputMode="numeric"
									placeholder="Default from plan"
									value={maxUsersStr}
									onChange={(e) =>
										setMaxUsersStr(e.target.value.replace(/\D/g, ""))
									}
								/>
							</div>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<OrgLicenseDateField
								label="License start (optional)"
								value={licenseStart}
								onChange={setLicenseStart}
								id="org-lic-start"
							/>
							<OrgLicenseDateField
								label="License end (optional)"
								value={licenseEnd}
								onChange={setLicenseEnd}
								id="org-lic-end"
							/>
						</div>
						{!parsed.success && (
							<p className="text-destructive text-sm font-medium">
								{parsed.error.issues[0]?.message}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button onClick={submit} disabled={!parsed.success || loading}>
							{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Provision Workspace
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
