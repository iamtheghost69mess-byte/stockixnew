"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { CreateApiKeyDialog } from "@/components/api-keys/create-key-dialog";
import { OwnerRowActionMenu } from "@/components/owner/owner-row-action-menu";
import { ResourcePage } from "@/components/resource-page";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { platformJson } from "@/lib/platform-http";
import { type ResourceField, ResourceRegistry } from "@/lib/resource-config";

/**
 * API credentials management with row-level revoke actions.
 */
export default function ApiKeysPage() {
	const qc = useQueryClient();

	const revokeM = useMutation({
		mutationFn: (keyId: string) =>
			platformJson<unknown>(
				`/auth/api-keys/${encodeURIComponent(keyId)}/revoke`,
				{
					method: "POST",
					idempotencyKey: crypto.randomUUID(),
				},
			),
		onSuccess: () => {
			toast.success("Credential revoked immediately.");
			invalidateQueriesEverywhere(qc, "apiKeyRevoke");
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Revocation failed")),
	});

	const actionsColumn: ResourceField = useMemo(
		() => ({
			key: "_actions",
			label: "",
			type: "custom",
			render: (row: { _id?: string; id?: string }) => {
				const kid = row._id || row.id;
				return (
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
					>
						<OwnerRowActionMenu
							ariaLabel="API key actions"
							items={[
								{
									id: "revoke",
									label: "Revoke credential",
									destructive: true,
									disabled: !kid || revokeM.isPending,
									onSelect: () => {
										if (
											!kid ||
											!confirm(
												"Revoke this credential? Integrations using it will fail immediately.",
											)
										) {
											return;
										}
										revokeM.mutate(kid);
									},
								},
							]}
						/>
					</div>
				);
			},
		}),
		[revokeM],
	);

	const resource = useMemo(
		() => ({
			...ResourceRegistry.apiKeys,
			columns: [...ResourceRegistry.apiKeys.columns, actionsColumn],
		}),
		[actionsColumn],
	);

	return (
		<ResourcePage
			resource={resource}
			title="API Credentials"
			description="Manage programmatic access keys for platform integrations. Secrets are only revealed during initial provisioning."
			extraActions={<CreateApiKeyDialog />}
		/>
	);
}
