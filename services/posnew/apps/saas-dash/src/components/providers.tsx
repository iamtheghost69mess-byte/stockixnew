"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { BeforeUnloadDirtyBridge } from "@/components/before-unload-dirty-bridge";
import { ConfigWarningBanner } from "@/components/config-warning-banner";
import { CrossTabInvalidationSubscriber } from "@/components/cross-tab-invalidation";
import { QueryErrorListener } from "@/components/query-error-listener";
import { SentryClientInit } from "@/components/sentry-client-init";
import { SessionExpiredDialog } from "@/components/session-expired-dialog";
import { SessionExpiryWarning } from "@/components/session-expiry-warning";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 30_000,
						gcTime: 5 * 60_000,
						retry: (failureCount, error) => {
							const st = (error as { status?: number })?.status;
							if (st === 401 || st === 403 || st === 404 || st === 429)
								return false;
							return failureCount < 2;
						},
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				disableTransitionOnChange
			>
				<TooltipProvider delayDuration={0}>
					<SentryClientInit />
					<ConfigWarningBanner />
					<CrossTabInvalidationSubscriber />
					<QueryErrorListener />
					<SessionExpiryWarning />
					<BeforeUnloadDirtyBridge />
					{children}
					<Toaster richColors position="top-center" />
					<SessionExpiredDialog />
				</TooltipProvider>
			</ThemeProvider>
		</QueryClientProvider>
	);
}
