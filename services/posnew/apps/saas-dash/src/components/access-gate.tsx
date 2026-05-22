"use client";
import { useRouter } from "next/navigation";

import { type ReactNode, useEffect } from "react";
import type { PlatformPermission } from "@/lib/permissions";
import { usePermission } from "@/lib/use-permission";

interface AccessGateProps {
	/** The primary permission required to see the content. */
	permission: PlatformPermission;
	/** If true, the gate will redirect to /unauthorized if permission fails. Default: true. */
	redirect?: boolean;
	/** Custom fallback to show if permission fails and redirect is false. */
	fallback?: ReactNode;
	/** Content to protect. */
	children: ReactNode;
	/** Optional: Show a skeleton/loading state while checking. */
	loadingFallback?: ReactNode;
}

/**
 * Enterprise-grade Authorization Gate.
 * Handles both Page-level redirects and Inline-component visibility.
 */
export function AccessGate({
	permission,
	redirect = true,
	fallback = null,
	children,
	loadingFallback,
}: AccessGateProps) {
	const router = useRouter();
	const hasAccess = usePermission(permission);

	useEffect(() => {
		if (redirect && hasAccess === false) {
			router.replace("/unauthorized");
		}
	}, [hasAccess, redirect, router]);

	// Wait for permission state to settle (avoiding flicker)
	if (hasAccess === undefined) {
		return (
			loadingFallback || (
				<div className="flex h-32 w-full items-center justify-center">
					<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
				</div>
			)
		);
	}

	if (!hasAccess) {
		return redirect ? null : <>{fallback}</>;
	}

	return <>{children}</>;
}
