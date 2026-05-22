"use client";

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../components/sidebar";
import { NavMain } from "./nav-main";
import type { NavGroup } from "./navigation-types";

export function DashboardAppSidebar({
  brand,
  groups,
  footer,
  showQuickActions,
  ...props
}: ComponentProps<typeof Sidebar> & {
  readonly brand: { readonly href: string; readonly label: string; readonly icon: LucideIcon };
  readonly groups: readonly NavGroup[];
  readonly footer: ReactNode;
  readonly showQuickActions?: boolean;
}) {
  const BrandIcon = brand.icon;

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href={brand.href}>
                <BrandIcon />
                <span className="font-semibold text-base">{brand.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={groups} showQuickActions={showQuickActions} />
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
    </Sidebar>
  );
}
