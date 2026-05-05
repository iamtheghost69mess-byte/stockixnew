"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { useMe } from "@/hooks/use-me";
import { ROLE, ROLE_LABELS, type Role } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenants", label: "Tenants", icon: Building2 },
  { href: "/owners", label: "Owners", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}

export function DashboardAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const me = useMe();
  const canSeeSettings = me?.role === ROLE.SUPER_ADMIN;
  const visibleNavItems = navItems.filter((item) =>
    item.href === "/settings" ? canSeeSettings : true,
  );

  function roleBadgeClass(role: Role) {
    const badgeClasses: Record<Role, string> = {
      [ROLE.SUPER_ADMIN]:
        "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-200",
      [ROLE.SUPPORT_AGENT]:
        "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200",
      [ROLE.BILLING_MANAGER]:
        "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200",
      [ROLE.READ_ONLY]: "border-muted-foreground/30 bg-muted text-muted-foreground",
    };
    return badgeClasses[role];
  }

  return (
    <SidebarProvider>
      <Sidebar>

        <SidebarHeader className="border-b border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-auto text-sidebar-foreground" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          {me ? (
            <div className="mb-2 space-y-1 rounded-md border border-sidebar-border px-3 py-2">
              <p className="text-sm font-medium">{me.name}</p>
              <p className="text-xs text-muted-foreground">{me.email}</p>
              <Badge
                variant="outline"
                className={`text-[10px] ${roleBadgeClass(me.role as Role)}`}
              >
                {ROLE_LABELS[me.role as Role]}
              </Badge>
            </div>
          ) : null}
          <LogoutButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex max-h-svh flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
