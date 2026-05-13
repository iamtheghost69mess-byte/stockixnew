"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpenIcon, Building2Icon, KeyRoundIcon, LayoutDashboardIcon, Settings2Icon, UsersIcon } from "lucide-react";

import { Logo } from "@/components/logo";
import { NavDocuments, type NavDocumentItem } from "@/components/nav-documents";
import { NavMain, type NavMainItem } from "@/components/nav-main";
import { NavSecondary, type NavSecondaryItem } from "@/components/nav-secondary";
import { NavUser, type NavUserAccount } from "@/components/nav-user";
import { useMe } from "@/hooks/use-me";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const me = useMe();

  const navMain = React.useMemo((): NavMainItem[] => {
    const items: NavMainItem[] = [
      {
        title: "Overview",
        url: "/",
        icon: <LayoutDashboardIcon />,
      },
      {
        title: "Tenants",
        url: "/tenants",
        icon: <Building2Icon />,
      },
      {
        title: "Licenses",
        url: "/licenses",
        icon: <KeyRoundIcon />,
      },
      {
        title: "Team & access",
        url: "/owners",
        icon: <UsersIcon />,
      },
    ];
    if (me?.capabilities.canAccessSettings) {
      items.push({
        title: "Security & settings",
        url: "/settings",
        icon: <Settings2Icon />,
      });
    }
    return items;
  }, [me?.capabilities.canAccessSettings]);

  const documents = React.useMemo((): NavDocumentItem[] => {
    return [
      {
        name: "Documentation",
        url: "https://docs.stockix.com",
        icon: <BookOpenIcon />,
        external: true,
      },
    ];
  }, []);

  const secondary = React.useMemo((): NavSecondaryItem[] => [], []);

  const userAccount: NavUserAccount | null = me
    ? {
        name: me.name,
        email: me.email,
        roleLabel: ROLE_LABELS[me.role as Role] ?? me.role,
        canAccessSettings: me.capabilities.canAccessSettings,
      }
    : null;

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              tooltip="Stockix — home"
              render={<Link href="/" />}
            >
              <Logo className="h-5 w-auto shrink-0 text-sidebar-foreground" />
              <span className="truncate text-base font-semibold tracking-tight">Stockix</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="px-2 pb-2 text-xs leading-snug text-muted-foreground">
          Owner control plane — tenants, operators, and security.
        </p>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavDocuments items={documents} />
        <NavSecondary items={secondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        {userAccount ? <NavUser user={userAccount} /> : null}
      </SidebarFooter>
    </Sidebar>
  );
}
