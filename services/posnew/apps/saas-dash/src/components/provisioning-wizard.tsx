"use client";
import { cn } from "@restaurant-pos/ui";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	Circle,
	Loader2,
	RefreshCcw,
	XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { platformJson } from "@/lib/platform-http";

interface ProvisioningStep {
	step: string;
	status: "pending" | "in_progress" | "completed" | "failed";
	error?: string;
	completedAt?: string;
}

interface ProvisioningWizardProps {
	organizationId: string;
	onComplete?: () => void;
}

/**
 * Professional Step-by-Step Provisioning Wizard.
 * Connects to the platform orchestrator to show real-time tenant setup progress.
 */
export function ProvisioningWizard({
	organizationId,
	onComplete,
}: ProvisioningWizardProps) {
	const { data, refetch } = useQuery({
		queryKey: ["provisioning-status", organizationId],
		queryFn: async () => {
			const raw = await platformJson<any>(
				`/organizations/${organizationId}/provisioning-status`,
			);
			return raw.data;
		},
		refetchInterval: (query) => {
			// Poll every 2s unless completed or failed
			const isDone = query.state.data?.isBootstrapped;
			const hasFailure = query.state.data?.provisioningSteps?.some(
				(s: any) => s.status === "failed",
			);
			return isDone || hasFailure ? false : 2000;
		},
	});

	const retryM = useMutation({
		mutationFn: async () => {
			await platformJson(
				`/organizations/${organizationId}/provisioning/retry`,
				{ method: "POST" },
			);
		},
		onSuccess: () => {
			toast.success("Provisioning restarted");
			refetch();
		},
		onError: () => toast.error("Could not restart provisioning"),
	});

	const steps: ProvisioningStep[] = data?.provisioningSteps || [];
	const isComplete = data?.isBootstrapped;
	const hasFailed = steps.some((s) => s.status === "failed");

	return (
		<div className="rounded-xl border bg-card p-6 shadow-sm">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold">Provisioning Pipeline</h3>
					<p className="text-sm text-muted-foreground">
						Orchestrating infrastructure and identity baseline.
					</p>
				</div>
				{isComplete && (
					<Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
						Resource Ready
					</Badge>
				)}
			</div>

			<div className="space-y-6">
				{steps.map((s, idx) => (
					<div key={s.step} className="flex gap-4">
						<div className="flex flex-col items-center">
							<div
								className={cn(
									"flex h-8 w-8 items-center justify-center rounded-full border-2",
									s.status === "completed"
										? "bg-primary border-primary text-primary-foreground"
										: s.status === "failed"
											? "bg-destructive border-destructive text-destructive-foreground"
											: s.status === "in_progress"
												? "border-primary text-primary"
												: "border-muted text-muted-foreground",
								)}
							>
								{s.status === "completed" ? (
									<CheckCircle2 className="h-5 w-5" />
								) : s.status === "failed" ? (
									<XCircle className="h-5 w-5" />
								) : s.status === "in_progress" ? (
									<Loader2 className="h-5 w-5 animate-spin" />
								) : (
									<span className="text-xs font-bold">{idx + 1}</span>
								)}
							</div>
							{idx < steps.length - 1 && (
								<div
									className={cn(
										"h-full w-0.5 mt-2",
										s.status === "completed" ? "bg-primary" : "bg-muted",
									)}
								/>
							)}
						</div>
						<div className="pb-6">
							<p
								className={cn(
									"font-medium capitalize",
									s.status === "pending" && "text-muted-foreground",
								)}
							>
								{s.step.replace(/_/g, " ")}
							</p>
							{s.status === "failed" && (
								<p className="text-xs text-destructive mt-1 font-mono bg-destructive/5 p-2 rounded border border-destructive/10">
									Error: {s.error}
								</p>
							)}
							{s.status === "completed" && (
								<p className="text-xs text-muted-foreground mt-1">
									Baseline verified.
								</p>
							)}
						</div>
					</div>
				))}
			</div>

			{hasFailed && (
				<div className="mt-4 pt-4 border-t flex items-center justify-between">
					<p className="text-sm text-muted-foreground italic">
						Provisioning stalled at a modular boundary.
					</p>
					<Button
						size="sm"
						variant="outline"
						onClick={() => retryM.mutate()}
						disabled={retryM.isPending}
					>
						{retryM.isPending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<RefreshCcw className="mr-2 h-4 w-4" />
						)}
						Resume Provisioning
					</Button>
				</div>
			)}

			{isComplete && (
				<div className="mt-4 pt-4 border-t">
					<Button className="w-full" onClick={onComplete}>
						Access Environment
					</Button>
				</div>
			)}
		</div>
	);
}

function Badge({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"px-2.5 py-0.5 rounded-full text-xs font-semibold border",
				className,
			)}
		>
			{children}
		</span>
	);
}
