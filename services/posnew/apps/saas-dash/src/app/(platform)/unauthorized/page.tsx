"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Shown when the user is signed in but lacks the required platform permission.
 * Lives under `(platform)` so session bootstrap runs before this page (avoids a
 * full reload sending signed-out users here with an empty store).
 */
export default function UnauthorizedPage() {
	const user = useAuthStore((s) => s.user);

	if (!user) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
				<p className="text-muted-foreground text-sm text-center max-w-sm">
					Checking your session… If this does not clear, you may have been
					signed out — try the overview link below or sign in again.
				</p>
				<Button asChild variant="outline">
					<Link href="/">Back to overview</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
			<h1 className="text-2xl font-semibold">Access denied</h1>
			<p className="max-w-md text-center text-muted-foreground">
				You do not have permission to view this section. Ask a platform owner to
				adjust your roles if this is unexpected.
			</p>
			<Button asChild>
				<Link href="/">Back to overview</Link>
			</Button>
		</div>
	);
}
