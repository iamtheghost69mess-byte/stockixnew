"use client";

import type { CSSProperties, ReactNode } from "react";

import { Separator } from "@repo/ui-core";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui-core";
import { cn } from "@repo/ui-core";

export function DashboardShellLayout({
  defaultOpen = true,
  sidebar,
  headerStart,
  headerEnd,
  children,
  sidebarWidth,
  variant,
  collapsible,
}: {
  readonly defaultOpen?: boolean;
  readonly sidebar: ReactNode;
  readonly headerStart: ReactNode;
  readonly headerEnd: ReactNode;
  readonly children: ReactNode;
  readonly sidebarWidth?: CSSProperties["width"];
  readonly variant?: "sidebar" | "floating" | "inset";
  readonly collapsible?: "offcanvas" | "icon" | "none";
}) {
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": sidebarWidth ?? "16rem",
        } as CSSProperties
      }
    >
      {sidebar}
      <SidebarInset
        className={cn(
          "[html[data-content-layout=centered]_&>*]:mx-auto",
          "[html[data-content-layout=centered]_&>*]:w-full",
          "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
          "data-[variant=inset]:border",
        )}
      >
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              {headerStart}
            </div>
            <div className="flex items-center gap-2">{headerEnd}</div>
          </div>
        </header>
        <div className="h-full p-4 md:p-6 ">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
