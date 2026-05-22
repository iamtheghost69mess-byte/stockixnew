"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { OwnerRowActionMenu } from "@/components/owner/owner-row-action-menu";
import { ResourcePage } from "@/components/resource-page";
import { ManualEnqueueDialog } from "@/components/webhooks/manual-enqueue-dialog";
import { RegisterWebhookDialog } from "@/components/webhooks/register-webhook-dialog";
import { WebhookOutboxLog } from "@/components/webhooks/webhook-outbox-log";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { platformJson } from "@/lib/platform-http";
import { type ResourceField, ResourceRegistry } from "@/lib/resource-config";

/**
 * Webhook endpoints and outbox. DELETE /webhooks/endpoints/:id soft-disables the endpoint.
 */
export default function WebhooksPage() {
	const qc = useQueryClient();

	const disableM = useMutation({
		mutationFn: (id: string) =>
			platformJson(`/webhooks/endpoints/${encodeURIComponent(id)}`, {
				method: "DELETE",
				idempotencyKey: crypto.randomUUID(),
			}),
		onSuccess: () => {
			toast.success("Webhook endpoint disabled.");
			invalidateQueriesEverywhere(qc, "webhookRevoke");
		},
		onError: (e) =>
			toast.error(mutationErrorMessage(e, "Could not disable endpoint")),
	});

	const actionsColumn: ResourceField = useMemo(
		() => ({
			key: "_actions",
			label: "",
			type: "custom",
			render: (row: { _id?: string; disabled?: boolean }) => {
				const id = row._id;
				const isOff = Boolean(row.disabled);
				return (
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
					>
						{isOff ? (
							<span className="text-muted-foreground text-xs tabular-nums">
								Disabled
							</span>
						) : (
							<OwnerRowActionMenu
								ariaLabel="Webhook endpoint actions"
								items={[
									{
										id: "disable",
										label: "Disable endpoint",
										destructive: true,
										disabled: !id || disableM.isPending,
										onSelect: () => {
											if (
												!id ||
												!confirm(
													"Disable this endpoint? No new events will be delivered until re-enabled (if supported).",
												)
											) {
												return;
											}
											disableM.mutate(id);
										},
									},
								]}
							/>
						)}
					</div>
				);
			},
		}),
		[disableM],
	);

	const resource = useMemo(
		() => ({
			...ResourceRegistry.webhooks,
			columns: [...ResourceRegistry.webhooks.columns, actionsColumn],
		}),
		[actionsColumn],
	);

	const headerActions = (
		<div className="flex items-center gap-2">
			<ManualEnqueueDialog />
			<RegisterWebhookDialog />
		</div>
	);

	return (
		<div className="divide-y divide-border/50">
			<div className="pb-8">
				<ResourcePage
					resource={resource}
					title="Outbound Flux Control"
					description="Manage active webhook observers and signing infrastructure across the multi-tenant ecosystem."
					extraActions={headerActions}
				/>
			</div>

			<WebhookOutboxLog />
		</div>
	);
}
