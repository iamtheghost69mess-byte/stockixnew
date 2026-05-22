"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";

import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

interface AccessGateProps {
  /** The primary permission required to see the content. */
  permission: string;
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
 * Enterprise-grade Authorization Gate for Tenant POS.
 * Handles both Page-level redirects and Inline-component visibility using posCan.
 */
export function AccessGate({
  permission,
  redirect = true,
  fallback = null,
  children,
  loadingFallback,
}: AccessGateProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const user = usePosAuthStore((s) => s.user);
  const permissions = user?.permissions;

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasAccess = Array.isArray(permissions) ? posCan(permissions, permission) : undefined;

  useEffect(() => {
    if (mounted && hasAccess === false && redirect) {
      router.replace("/unauthorized");
    }
  }, [hasAccess, redirect, router, mounted]);

  // Wait for hydration to complete
  if (!mounted) {
    return (
      loadingFallback || (
        <div className="flex h-32 w-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )
    );
  }

  if (!hasAccess) {
    return redirect ? null : <>{fallback}</>;
  }

  return <>{children}</>;
}
