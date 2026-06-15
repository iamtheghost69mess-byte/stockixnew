import type { ReactNode } from "react";

import { cookies } from "next/headers";
import Link from "next/link";

import { DashboardShellLayout } from "@restaurant-pos/ui/shell";
import { Monitor } from "lucide-react";

import { HostessDashboardRouteGuard } from "@/app/(main)/dashboard/_components/hostess-dashboard-route-guard";
import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { Button } from "@/components/ui/button";
import { SIDEBAR_COLLAPSIBLE_VALUES, SIDEBAR_VARIANT_VALUES } from "@/lib/preferences/layout";
import { getPreference } from "@/server/server-actions";

import { DashboardLocationHeader } from "./_components/dashboard-location-header";
import { DashboardHeaderUser } from "./_components/sidebar/dashboard-header-user";
import { NotificationBell } from "./_components/notifications/notification-bell";
import { LayoutControls } from "./_components/sidebar/layout-controls";
import { SearchDialog } from "./_components/sidebar/search-dialog";
import { ThemeSwitcher } from "./_components/sidebar/theme-switcher";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible] = await Promise.all([
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
    getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
  ]);

  return (
    <DashboardShellLayout
      defaultOpen={defaultOpen}
      sidebar={<AppSidebar variant={variant} collapsible={collapsible} />}
      headerStart={<SearchDialog />}
      headerEnd={
        <>
          <DashboardLocationHeader />
          <LayoutControls />
          <ThemeSwitcher />
          <NotificationBell />
          <Button asChild size="icon">
            <Link prefetch={false} href="/pos" aria-label="Open POS">
              <Monitor className="size-4" />
            </Link>
          </Button>
          <DashboardHeaderUser />
        </>
      }
    >
      <HostessDashboardRouteGuard>{children}</HostessDashboardRouteGuard>
    </DashboardShellLayout>
  );
}
