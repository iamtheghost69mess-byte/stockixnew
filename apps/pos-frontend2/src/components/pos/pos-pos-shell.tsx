"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";

import { LogOut, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { posLogout } from "@/lib/pos-auth-api";
import { locationLabel } from "@/lib/pos-auth-user";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export function PosPosShell({
  floorLink,
  dashboardLink,
}: Readonly<{
  floorLink: ReactNode;
  dashboardLink: ReactNode;
}>) {
  const router = useRouter();
  const clearSession = usePosAuthStore((s) => s.clearSession);
  const user = usePosAuthStore((s) => s.user);
  const branchLabel = user ? locationLabel(user.location) : null;
  const roleKey = (user?.rbacRoleKey ?? user?.role ?? "").toLowerCase();
  const permissionList = user?.permissions ?? [];
  const hasBackofficePermission =
    permissionList.includes("*") ||
    permissionList.includes("admin.rbac.manage") ||
    permissionList.some((permission) => permission === "backoffice.*" || permission.startsWith("backoffice."));
  const fallbackRoleAllowsDashboard = roleKey === "admin" || roleKey === "manager" || roleKey.startsWith("accountant");
  const canOpenDashboard = hasBackofficePermission || (permissionList.length === 0 && fallbackRoleAllowsDashboard);
  const handleLogout = async () => {
    try {
      await posLogout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out cleanly.");
    } finally {
      clearSession();
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-40 border-border/70 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 font-semibold text-sm tracking-tight">
          <UtensilsCrossed className="size-5 text-muted-foreground" aria-hidden />
          <span>POS</span>
        </div>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <nav className="flex flex-1 flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            {floorLink}
          </Button>
          {canOpenDashboard ? (
            <Button asChild size="sm" variant="outline">
              {dashboardLink}
            </Button>
          ) : null}
        </nav>
        <div className="flex min-w-0 items-center gap-2">
          {user && (user._id || user.name) ? (
            <Card className="min-w-0 max-w-[min(100%,18rem)] shrink py-0 sm:max-w-none">
              <CardContent
                className="px-3 py-2 text-muted-foreground text-xs"
                aria-label={`Signed in as ${user.name || "Staff"}, role ${user.role || user.rbacRoleKey || "unknown"}`}
              >
                <div className="truncate font-medium text-foreground" title={user.name || undefined}>
                  {user.name || "Staff"}
                </div>
                <div className="truncate" title={user.role || user.rbacRoleKey || undefined}>
                  Role: {user.role || user.rbacRoleKey || "—"}
                </div>
                {branchLabel ? (
                  <div className="truncate text-muted-foreground/90" title={branchLabel}>
                    {branchLabel}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void handleLogout();
            }}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
