"use client"

import { useRouter } from "next/navigation"
import { Building, Forward, MoreHorizontal, Pencil, Trash2, type LucideIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavProperties({
  properties,
}: {
  properties: {
    name: string
    url: string
    icon: LucideIcon
  }[]
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>My Properties</SidebarGroupLabel>
      <SidebarMenu>
        {properties.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild>
              <div
                onClick={() => router.push(item.url)}
                className="cursor-pointer"
              >
                <item.icon />
                <span>{item.name}</span>
              </div>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover>
                  <MoreHorizontal />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem onClick={() => router.push(item.url)}>
                  <Building className="text-muted-foreground" />
                  <span>View Property</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`${item.url}/edit`)}>
                  <Pencil className="text-muted-foreground" />
                  <span>Edit Property</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`${item.url}/share`)}>
                  <Forward className="text-muted-foreground" />
                  <span>Share Property</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(`${item.url}/delete`)}>
                  <Trash2 className="text-muted-foreground" />
                  <span>Delete Property</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton
            className="text-sidebar-foreground/70"
            onClick={() => router.push("/dashboard/properties")}
          >
            <MoreHorizontal className="text-sidebar-foreground/70" />
            <span>View All Properties</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
