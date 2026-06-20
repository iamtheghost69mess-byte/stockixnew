"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  Building2Icon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  MailIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShoppingCartIcon,
  UsersIcon,
} from "lucide-react";
import { hasPermission } from "@repo/shared/permissions";

import { Logo } from "@/components/logo";
import { MeContext } from "@/components/me-provider";
import { NavDocuments, type NavDocumentItem } from "@/components/nav-documents";
import { NavMain, type NavMainItem } from "@/components/nav-main";
import { NavSecondary, type NavSecondaryItem } from "@/components/nav-secondary";
import { NavUser, type NavUserAccount } from "@/components/nav-user";
import { useMe } from "@/hooks/use-me";
import { useMounted } from "@/hooks/use-mounted";
import { usePosNavVisible } from "@/hooks/use-pos-nav";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const mounted = useMounted();
  const initialFromServer = React.useContext(MeContext);
  const { me } = useMe();
  const posNavVisible = usePosNavVisible();

  const effectiveMe = me ?? initialFromServer ?? null;
  const perms = effectiveMe?.permissions ?? [];
  const can = (permission: string) => hasPermission(perms, permission);

  const canReadTenants = can("tenants.read");
  const canReadLicenses = can("licenses.read");
  const canReadPlans =
    can("plans.read") || can("plans.manage") || Boolean(effectiveMe?.capabilities.canReadPlans);
  const canManageOwners = can("owners.manage");
  const canAudit = can("audit.read");
  const canEmailLogs = can("email_logs.read");
  const canApiKeys = can("api_keys.manage");
  const canSettings = can("settings.access");
  const canRoles = can("roles.manage");

  const navMain = React.useMemo((): NavMainItem[] => {
    const items: NavMainItem[] = [
      {
        title: "Overview",
        url: "/",
        icon: <LayoutDashboardIcon />,
      },
      ...(canReadTenants
        ? [
            {
              title: "Tenants",
              url: "/tenants",
              icon: <Building2Icon />,
            },
          ]
        : []),
      ...(canReadLicenses
        ? [
            {
              title: "Licenses",
              url: "/licenses",
              icon: <KeyRoundIcon />,
            },
          ]
        : []),
      ...(posNavVisible
        ? [
            {
              title: "POS",
              url: "/pos",
              icon: <ShoppingCartIcon />,
            },
          ]
        : []),
      {
        title: "PMS",
        url: "/pms",
        icon: <Building2Icon />,
      },
      ...(canReadPlans
        ? [
            {
              title: "Plans",
              url: "/plans",
              icon: <LayoutListIcon />,
            },
          ]
        : []),
      ...(canManageOwners
        ? [
            {
              title: "Team & access",
              url: "/owners",
              icon: <UsersIcon />,
            },
          ]
        : []),
    ];
    if (canAudit) {
      items.push({
        title: "Audit log",
        url: "/audit-log",
        icon: <ScrollTextIcon />,
      });
    }
    if (canEmailLogs) {
      items.push({
        title: "Email log",
        url: "/email-logs",
        icon: <MailIcon />,
      });
    }
    if (canApiKeys) {
      items.push({
        title: "API keys",
        url: "/api-keys",
        icon: <KeyRoundIcon />,
      });
    }
    if (canRoles) {
      items.push({
        title: "Roles",
        url: "/settings/roles",
        icon: <UsersIcon />,
      });
    }
    if (canSettings) {
      items.push({
        title: "Security & settings",
        url: "/settings",
        icon: <Settings2Icon />,
      });
    }
    return items;
  }, [
    canReadTenants,
    canReadLicenses,
    canReadPlans,
    canManageOwners,
    canAudit,
    canEmailLogs,
    canApiKeys,
    canRoles,
    canSettings,
    posNavVisible,
  ]);

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

  const userAccount: NavUserAccount | null = effectiveMe
    ? {
        name: effectiveMe.name,
        email: effectiveMe.email,
        roleLabel: ROLE_LABELS[effectiveMe.role as Role] ?? effectiveMe.role,
        canAccessSettings: effectiveMe.capabilities.canAccessSettings,
      }
    : null;

  if (!mounted) {
    return <aside className="hidden" aria-hidden="true" />;
  }

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
