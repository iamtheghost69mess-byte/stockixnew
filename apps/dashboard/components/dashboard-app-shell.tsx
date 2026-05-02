"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import { Logo } from "@/components/logo";

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

  return (
    <SidebarProvider>
      <Sidebar>

        <SidebarHeader className="border-b border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-auto text-sidebar-foreground" />
            <span className="text-sm font-semibold tracking-tight">Stockix</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
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
