"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useMe } from "@/hooks/use-me";
import { useHasAnyPermission } from "@/hooks/use-permissions";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";

type RouteRule = {
  prefix: string;
  anyOf: string[];
};

const ROUTE_RULES: RouteRule[] = [
  { prefix: "/settings/roles", anyOf: ["*", "roles.manage"] },
  { prefix: "/settings", anyOf: ["*", "settings.access", "audit.read", "api_keys.manage"] },
  { prefix: "/owners", anyOf: ["*", "owners.manage"] },
  { prefix: "/audit-log", anyOf: ["*", "audit.read"] },
  { prefix: "/email-logs", anyOf: ["*", "email_logs.read"] },
  { prefix: "/api-keys", anyOf: ["*", "api_keys.manage"] },
  { prefix: "/plans", anyOf: ["*", "plans.read", "plans.manage"] },
  { prefix: "/licenses", anyOf: ["*", "licenses.read"] },
  { prefix: "/tenants", anyOf: ["*", "tenants.read"] },
];

function requiredPermissionsForPath(pathname: string): string[] | null {
  const path = pathname.split("?")[0] ?? pathname;
  const sorted = [...ROUTE_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const rule of sorted) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule.anyOf;
    }
  }
  return null;
}

export function DashboardRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const required = requiredPermissionsForPath(pathname);
  const { loading } = useMe();
  const allowed = useHasAnyPermission(required ?? ["*"]);

  // Unrestricted routes never need a permission check — render immediately
  // without waiting for useMe() to resolve. Moving this before the loading
  // guard prevents a visible spinner flash on every public/unrestricted page.
  if (!required) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <h2 className="text-lg font-semibold">Access denied</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Your role does not include permission to view this page. Contact a super admin if you need
        access.
      </p>
      <Button render={<Link href="/" />} variant="outline" nativeButton={false}>
        Back to overview
      </Button>
    </div>
  );
}
