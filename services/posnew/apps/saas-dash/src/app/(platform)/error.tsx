"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function PlatformError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
			void import("@sentry/react").then((Sentry) => {
				Sentry.captureException(error);
			});
		}
	}, [error]);

	return (
		<div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="text-xl font-semibold">Something went wrong</h1>
			<p className="text-muted-foreground max-w-md text-sm">
				This section crashed. You can try again or return to the overview.
			</p>
			<div className="flex gap-2">
				<Button type="button" onClick={() => reset()}>
					Try again
				</Button>
				<Button type="button" variant="outline" asChild>
					<a href="/">Overview</a>
				</Button>
			</div>
		</div>
	);
}
