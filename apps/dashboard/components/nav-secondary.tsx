"use client";

import Link from "next/link";
import * as React from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/sidebar";

export type NavSecondaryItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  external?: boolean;
};

export function NavSecondary({
  items,
  ...props
}: {
  items: NavSecondaryItem[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                render={
                  item.external ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" />
                  ) : (
                    <Link href={item.url} />
                  )
                }
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
