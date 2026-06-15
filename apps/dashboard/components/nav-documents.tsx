"use client";

import Link from "next/link";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type NavDocumentItem = {
  name: string;
  url: string;
  icon: React.ReactNode;
  external?: boolean;
};

/** Secondary navigation — resources and quick links (no destructive row actions). */
export function NavDocuments({ items }: { items: NavDocumentItem[] }) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Resources</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              tooltip={item.name}
              render={
                item.external ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" />
                ) : (
                  <Link href={item.url} />
                )
              }
            >
              {item.icon}
              <span>{item.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
