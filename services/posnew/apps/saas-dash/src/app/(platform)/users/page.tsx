"use client";

import { ResourcePage } from "@/components/resource-page";
import { ResourceRegistry } from "@/lib/resource-config";

/**
 * Global Users Directory.
 * Elevated to use the Metadata-Driven Resource Engine.
 */
export default function GlobalUsersPage() {
	return (
		<ResourcePage
			resource={ResourceRegistry.users}
			description="Manage tenant workforce operations across all active organizations globally."
		/>
	);
}
