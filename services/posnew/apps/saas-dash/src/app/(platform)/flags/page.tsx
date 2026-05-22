"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { toast } from "sonner";
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
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";
import { ResourceRegistry } from "@/lib/resource-config";

/**
 * Modernized Feature Flags Management.
 * Replaces fragmented card-based UI with a high-performance, metadata-driven table.
 * Maintains professional safety checks for high-stakes platform toggles.
 */
export default function FlagsPage() {
	const queryClient = useQueryClient();
	const [pendingFlag, setPendingFlag] = useState<{
		key: string;
		field: string;
		value: boolean;
	} | null>(null);

	const updateMutation = useMutation({
		mutationFn: async (vars: { key: string; [k: string]: any }) => {
			return platformJson("/flags", {
				method: "PUT",
				body: JSON.stringify(vars),
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: qk.flags });
			toast.success("Platform state synchronized successfully.");
			setPendingFlag(null);
		},
		onError: (err: any) => {
			toast.error(err.message || "Failed to commit flag update.");
			setPendingFlag(null);
		},
	});

	const handleAction = (row: any, actionId: string, value: any) => {
		// actionId from registry: 'toggle-default' or 'toggle-kill'
		const field = actionId === "toggle-kill" ? "killSwitch" : "defaultEnabled";
		setPendingFlag({ key: row.key, field, value });
	};

	const confirmUpdate = () => {
		if (!pendingFlag) return;
		updateMutation.mutate({
			key: pendingFlag.key,
			[pendingFlag.field]: pendingFlag.value,
		});
	};

	return (
		<div className="relative">
			<ResourcePage resource={ResourceRegistry.flags} onAction={handleAction} />

			<AlertDialog
				open={!!pendingFlag}
				onOpenChange={() => !updateMutation.isPending && setPendingFlag(null)}
			>
				<AlertDialogContent className="border-destructive/20 shadow-xl">
					<AlertDialogHeader>
						<AlertDialogTitle className="text-xl font-bold flex items-center gap-2">
							Confirm Platform Mutation
						</AlertDialogTitle>
						<AlertDialogDescription className="text-base">
							Changing the{" "}
							<strong>
								{pendingFlag?.field === "killSwitch"
									? "Emergency Kill Switch"
									: "Default Enabled State"}
							</strong>{" "}
							for
							<code className="mx-1 px-2 py-0.5 bg-muted rounded font-mono text-destructive">
								{pendingFlag?.key}
							</code>
							will affect all organizations on the platform immediately.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-4">
						<AlertDialogCancel disabled={updateMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmUpdate}
							disabled={updateMutation.isPending}
							className={
								pendingFlag?.field === "killSwitch"
									? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
									: ""
							}
						>
							{updateMutation.isPending
								? "Propagating Change..."
								: "Confirm & Apply"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
