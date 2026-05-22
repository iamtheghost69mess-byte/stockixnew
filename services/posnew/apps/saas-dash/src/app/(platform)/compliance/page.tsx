"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Download,
	ExternalLink,
	LifeBuoy,
	ShieldAlert,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AccessGate } from "@/components/access-gate";
import { PlatformOverviewCrumb } from "@/components/platform-overview-crumb";
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
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { setFormDirty } from "@/lib/dirty-form-registry";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";

type ExportResponse = {
	success?: boolean;
	queued?: boolean;
	jobId?: string | null;
	queue?: string;
	reason?: string;
};

type DeletionResponse = ExportResponse & {
	data?: { deletionScheduledAt?: string };
};

/**
 * Modernized Compliance & Governance Hub.
 * Unified under professional design tokens to ensure high-stakes operations (GDPR/Erasure)
 * are handled with clear visual feedback and link-to-job reliability.
 */
export default function CompliancePage() {
	const qc = useQueryClient();
	const [orgId, setOrgId] = useState("");
	const [cooldown, setCooldown] = useState("72");
	const [lastExportJob, setLastExportJob] = useState<{
		queue: string;
		id: string;
	} | null>(null);
	const [lastDeleteJob, setLastDeleteJob] = useState<{
		queue: string;
		id: string;
	} | null>(null);

	const complianceDirty = Boolean(orgId.trim()) || cooldown !== "72";
	useEffect(() => {
		setFormDirty("compliance", complianceDirty);
		return () => setFormDirty("compliance", false);
	}, [complianceDirty]);

	const exportM = useMutation({
		mutationFn: () =>
			platformJson<ExportResponse>("/compliance/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ organizationId: orgId }),
				idempotencyKey: crypto.randomUUID(),
			}),
		onSuccess: (j) => {
			toast.success("Compliance export provisioned.");
			if (j.jobId && j.queue) setLastExportJob({ queue: j.queue, id: j.jobId });
			invalidateQueriesEverywhere(qc, "complianceExport");
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Provisioning failed")),
	});

	const deleteM = useMutation({
		mutationFn: () =>
			platformJson<DeletionResponse>("/compliance/deletion", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					organizationId: orgId,
					cooldownHours: Number(cooldown) || 72,
				}),
				idempotencyKey: crypto.randomUUID(),
			}),
		onSuccess: (j) => {
			toast.success("Erasure sequence scheduled", {
				description: j.data?.deletionScheduledAt
					? `Commencing at ${j.data.deletionScheduledAt}`
					: "Cooldown activated.",
			});
			if (j.jobId && j.queue) setLastDeleteJob({ queue: j.queue, id: j.jobId });
			invalidateQueriesEverywhere(qc, "complianceDeletion");
		},
		onError: (e) =>
			toast.error(mutationErrorMessage(e, "Erasure sequence failed")),
	});

	const JobLink = ({ job }: { job: { queue: string; id: string } }) => (
		<div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-top-1">
			<div className="flex-1 text-xs font-mono">
				<span className="opacity-50">JOB //</span> {job.queue}:{job.id}
			</div>
			<Link
				href={`/jobs/${job.queue}/${job.id}`}
				className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
			>
				Track Progress <ExternalLink className="h-3 w-3" />
			</Link>
		</div>
	);

	return (
		<AccessGate permission={P.COMPLIANCE_RUN}>
			<div className="space-y-6">
				<PlatformOverviewCrumb section="Governance" />

				<div className="font-outfit">
					<h1 className="text-2xl font-bold tracking-tight">
						Compliance & Data Sovereignty
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Execute high-stakes data operations including GDPR-compliant exports
						and tenant erasure.
					</p>
				</div>

				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					<Card className="md:col-span-2 lg:col-span-1 shadow-sm border-primary/10">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<ShieldAlert className="h-5 w-5 text-primary" />
								Target Identity
							</CardTitle>
							<CardDescription>
								Select the organization for compliance fulfillment.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<Label
									htmlFor="target-org"
									className="text-xs font-bold uppercase opacity-60 font-outfit"
								>
									Organization ID
								</Label>
								<Input
									id="target-org"
									value={orgId}
									onChange={(e) => setOrgId(e.target.value)}
									placeholder="Mongo ObjectId"
									className="bg-muted/30 font-mono text-sm"
								/>
							</div>
						</CardContent>
					</Card>

					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Download className="h-5 w-5 text-primary" />
								Data Portability
							</CardTitle>
							<CardDescription>
								Generate a comprehensive ZIP archive of all tenant records.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col flex-1">
							<Button
								variant="outline"
								className="w-full font-outfit"
								onClick={() => exportM.mutate()}
								disabled={!orgId || exportM.isPending}
							>
								{exportM.isPending
									? "Provisioning Bundle..."
									: "Dispatch Export Job"}
							</Button>
							{lastExportJob && <JobLink job={lastExportJob} />}
						</CardContent>
					</Card>

					<Card className="shadow-sm border-destructive/10 bg-destructive/[0.02]">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg text-destructive">
								<Trash2 className="h-5 w-5" />
								Erasure Protocol
							</CardTitle>
							<CardDescription>
								Schedule a full environment wipe after a cooldown period.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label
									htmlFor="cooldown"
									className="text-xs font-bold uppercase opacity-60 font-outfit"
								>
									Cooldown Hours
								</Label>
								<Input
									id="cooldown"
									value={cooldown}
									onChange={(e) => setCooldown(e.target.value)}
									type="number"
									min={1}
									className="bg-muted/30 font-mono text-sm"
								/>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="destructive"
										className="w-full font-outfit"
										disabled={!orgId}
									>
										Initialize Erasure
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle className="flex items-center gap-2">
											<LifeBuoy className="h-5 w-5 text-destructive" />
											Sovereign Erasure Request
										</AlertDialogTitle>
										<AlertDialogDescription>
											This is a non-reversible operation once the cooldown
											expires. All organization data, identities, and
											infrastructure associations will be permanently purged.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel disabled={deleteM.isPending}>
											Retain Data
										</AlertDialogCancel>
										<AlertDialogAction
											className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
											disabled={deleteM.isPending}
											onClick={() => deleteM.mutate()}
										>
											{deleteM.isPending ? "Scheduling..." : "Confirm Protocol"}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
							{lastDeleteJob && <JobLink job={lastDeleteJob} />}
						</CardContent>
					</Card>
				</div>
			</div>
		</AccessGate>
	);
}
