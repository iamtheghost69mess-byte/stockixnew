"use client";

import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/tenants": "Tenants",
  "/licenses": "Licenses",
  "/owners": "Team & access",
  "/audit-log": "Audit log",
  "/settings": "Security & settings",
};

function getPageTitle(pathname: string): string {
  const path = pathname.split("?")[0] ?? pathname;
  if (ROUTE_TITLES[path]) return ROUTE_TITLES[path]!;

  if (/^\/tenants\/[^/]+\/organizations\/[^/]+/.test(path)) {
    return "Organization detail";
  }
  if (/^\/tenants\/[^/]+/.test(path)) {
    return "Tenant detail";
  }
  if (/^\/licenses\/[^/]+/.test(path)) {
    return "License detail";
  }

  return "Dashboard";
}

export function DashboardAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

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
        <Toaster richColors closeButton />
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
