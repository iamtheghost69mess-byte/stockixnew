"use client";
import { ResourcePage } from "@/components/resource-page";

import { ResourceRegistry } from "@/lib/resource-config";

/**
 * Specialized Webhook Delivery Log.
 * Encapsulated minimal ResourcePage to be hosted as a secondary view.
 */
export function WebhookOutboxLog() {
	return (
		<div className="pt-8 border-t mt-8 space-y-4">
			<div className="px-1">
				<h2 className="text-xl font-semibold font-outfit">
					Delivery Flux (Outbox)
				</h2>
				<p className="text-sm text-muted-foreground">
					Historical records of outbound webhook delivery attempts and statuses.
				</p>
			</div>
			<ResourcePage resource={ResourceRegistry.webhookOutbox} minimal />
		</div>
	);
}
