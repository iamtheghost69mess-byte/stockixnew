"use client";

import { type ReactNode, useLayoutEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { isHostessUser } from "@/lib/pos-staff-role";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const FLOOR_PATH = "/dashboard/floor";
const CUSTOMERS_PATH = "/dashboard/customers";

function hostessAllowedPath(pathname: string): boolean {
  if (pathname === FLOOR_PATH || pathname.startsWith(`${FLOOR_PATH}/`)) return true;
  if (pathname === CUSTOMERS_PATH || pathname.startsWith(`${CUSTOMERS_PATH}/`)) return true;
  return false;
}

/**
 * Hostess RBAC: keep them on floor + customers (reservations / guest list) so bookmarks
 * do not land on AccessGate / unauthorized pages.
 */
export function HostessDashboardRouteGuard({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const user = usePosAuthStore((s) => s.user);

  useLayoutEffect(() => {
    if (!user || !isHostessUser(user)) return;
    if (hostessAllowedPath(pathname)) return;
    router.replace(FLOOR_PATH);
  }, [pathname, router, user]);

  return <>{children}</>;
}
