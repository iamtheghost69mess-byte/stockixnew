"use client";

import type { ComponentProps } from "react";

import { DashboardAppSidebar, NavUser, } from "@restaurant-pos/ui/shell";
import { Command } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

type AppSidebarProps = Omit<ComponentProps<typeof DashboardAppSidebar>, "brand" | "groups" | "footer">;

import { APP_CONFIG } from "@/config/app-config";
import { usePosLogout } from "@/hooks/use-pos-logout";
import { filterSidebarGroupsByPermissions } from "@/lib/filter-sidebar-groups";
import { posAuthUserToShellNavDisplay } from "@/lib/pos-auth-user";
import { isHostessUser } from "@/lib/pos-staff-role";
import { hostessSidebarItems, sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePosAuthStore } from "@/stores/pos-auth-store";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

export function AppSidebar({ ...props }: AppSidebarProps) {
  const logout = usePosLogout();
  const user = usePosAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];
  const relayMode = user?.organization?.accountingRelayMode ?? false;
  const financeUrl = user?.organization?.financeUrl ?? "";
  const navSource = isHostessUser(user) ? hostessSidebarItems : sidebarItems;
  const filtered = filterSidebarGroupsByPermissions(navSource, permissions, relayMode);
  const filteredGroups = relayMode && financeUrl
    ? filtered.map((group) => {
        if (group.id !== 1) return group;
        return {
          ...group,
          items: group.items.map((item) =>
            item.title === "Finance"
              ? { ...item, url: financeUrl, newTab: true }
              : item,
          ),
        };
      })
    : filtered;
  const brandHref = isHostessUser(user) ? "/dashboard/floor" : "/dashboard/default";
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <DashboardAppSidebar
      {...props}
      variant={variant}
      collapsible={collapsible}
      brand={{ href: brandHref, label: APP_CONFIG.name, icon: Command }}
      groups={filteredGroups}
      footer={
        <>
        {/**
         *  <SidebarSupportCard />
         */}
         
          <NavUser
            user={posAuthUserToShellNavDisplay(user)}
            onLogout={logout}
            notificationsHref="/dashboard/notifications"
          />
        </>
      }
    />
  );
}
