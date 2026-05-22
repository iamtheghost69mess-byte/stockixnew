"use client";

import { useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";

import { posApiJson } from "@/lib/pos-api-fetch";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const LOGIN_PATH = "/login";
const PUBLIC_SELF_ORDER_PATH = "/self-order";
const SETUP_PATH = "/setup";

/** Build query string for /login when forcing an unauthenticated redirect. Preserves `?org=` etc. from the current URL. */
function loginRedirectSearch(pathname: string): string {
  if (typeof window === "undefined") return "";
  const search = window.location.search;
  if (search) return search;
  if (pathname && pathname !== "/" && pathname !== LOGIN_PATH) {
    return `?from=${encodeURIComponent(pathname)}`;
  }
  return "";
}

/**
 * Validates the cookie-based session on root load.
 * Redirects to /login if no valid session is found via bootstrapSession.
 */
export function PosRootGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const user = usePosAuthStore((s) => s.user);
  const bootstrapSession = usePosAuthStore((s) => s.bootstrapSession);

  const [persistReady, setPersistReady] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSetupChecking, setIsSetupChecking] = useState(true);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(false);

  const isLogin = pathname === LOGIN_PATH;
  const isPublicSelfOrder = pathname === PUBLIC_SELF_ORDER_PATH;
  const isSetup = pathname === SETUP_PATH;

  // 1. Wait for Zustand hydration
  useEffect(() => {
    setPersistReady(true);
  }, []);

  // 2. Bootstrap session from cookie if we don't have a user yet
  useEffect(() => {
    if (!persistReady) return;
    if (isLogin || isPublicSelfOrder) {
      setIsBootstrapping(false);
      return;
    }

    (async () => {
      if (!user) {
        await bootstrapSession();
      }
      setIsBootstrapping(false);
    })();
  }, [persistReady, user, bootstrapSession, isLogin, isPublicSelfOrder]);

  // 2b. Bootstrap setup-completion state for authenticated users
  useEffect(() => {
    if (!persistReady || isBootstrapping || isLogin || isPublicSelfOrder) return;
    if (!user) {
      setIsSetupChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await posApiJson<{
          setupWizard?: { isComplete?: boolean };
          isBootstrapped?: boolean;
        }>("/api/v1/setup/status");
        const complete = Boolean(r.data?.setupWizard?.isComplete);
        if (!cancelled) {
          setIsSetupComplete(complete);
          setIsSetupChecking(false);
        }
      } catch {
        if (!cancelled) {
          setIsSetupComplete(false);
          setIsSetupChecking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persistReady, isBootstrapping, isLogin, isPublicSelfOrder, user]);

  // 3. Routing logic
  useEffect(() => {
    if (
      !persistReady ||
      isBootstrapping ||
      isSetupChecking ||
      isLogin ||
      isPublicSelfOrder
    ) {
      return;
    }

    if (!user) {
      const q = loginRedirectSearch(pathname);
      router.replace(`${LOGIN_PATH}${q}`);
      return;
    }
    if (!isSetupComplete && !isSetup) {
      router.replace(SETUP_PATH);
      return;
    }
    if (isSetupComplete && isSetup) {
      router.replace("/pos");
    }
  }, [
    user,
    isLogin,
    isPublicSelfOrder,
    isSetup,
    pathname,
    persistReady,
    isBootstrapping,
    isSetupChecking,
    isSetupComplete,
    router,
  ]);

  if (isLogin || isPublicSelfOrder) {
    return <>{children}</>;
  }

  if (!persistReady || isBootstrapping || isSetupChecking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return <>{children}</>;
}
