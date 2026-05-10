"use client";

import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

function headerTitle(pathname: string): string {
  if (pathname === "/" || pathname === "") return "Overview";
  if (pathname.startsWith("/tenants/")) return "Tenant detail";
  if (pathname === "/tenants") return "Tenants";
  if (pathname === "/owners") return "Team & access";
  if (pathname === "/settings") return "Security & settings";
  return "Stockix";
}

export function DashboardAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = headerTitle(pathname);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="flex max-h-svh flex-col overflow-hidden">
        <SiteHeader title={title} />
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
