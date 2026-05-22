"use client"

import type * as React from "react"
import { authClient } from "@/lib/auth-client"
import {
  BarChart3,
  BedDouble,
  Building,
  Calendar,
  CreditCard,
  Home,
  Hotel,
  Settings,
  Users,
} from "lucide-react"

import { NavMain } from "./nav-main"
import { NavProperties } from "./nav-properties"
import { NavUser } from "./nav-user"
import { PropertySwitcher } from "./property-switcher"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar"

// Pesan PMS data
const data = {
  user: {
    name: "John Doe",
    email: "john@example.com",
    avatar: "/avatars/user.jpg",
  },
  properties: [
    {
      name: "Sunset Villa",
      logo: Hotel,
      plan: "Active",
    },
    {
      name: "Mountain Lodge",
      logo: Building,
      plan: "Active",
    },
    {
      name: "Beach Resort",
      logo: Home,
      plan: "Inactive",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Home,
      isActive: true,
    },
    {
      title: "Properties",
      url: "/dashboard/properties",
      icon: Building,
      items: [
        {
          title: "All Properties",
          url: "/dashboard/properties",
        },
        {
          title: "Add Property",
          url: "/dashboard/properties/add",
        },
        {
          title: "Property Types",
          url: "/dashboard/properties/types",
        },
      ],
    },
    {
      title: "Rooms",
      url: "/dashboard/rooms",
      icon: BedDouble,
      items: [
        {
          title: "All Rooms",
          url: "/dashboard/rooms",
        },
        {
          title: "Add Room",
          url: "/dashboard/rooms/add",
        },
        {
          title: "Room Types",
          url: "/dashboard/rooms/types",
        },
        {
          title: "Availability",
          url: "/dashboard/rooms/availability",
        },
      ],
    },
    {
      title: "Bookings",
      url: "/dashboard/bookings",
      icon: Calendar,
      items: [
        {
          title: "All Bookings",
          url: "/dashboard/bookings",
        },
        {
          title: "New Booking",
          url: "/dashboard/bookings/new",
        },
        {
          title: "Calendar",
          url: "/dashboard/bookings/calendar",
        },
        {
          title: "Check-in/out",
          url: "/dashboard/bookings/checkin",
        },
      ],
    },
    {
      title: "Guests",
      url: "/dashboard/guests",
      icon: Users,
      items: [
        {
          title: "All Guests",
          url: "/dashboard/guests",
        },
        {
          title: "Add Guest",
          url: "/dashboard/guests/add",
        },
      ],
    },
    {
      title: "Payments",
      url: "/dashboard/payments",
      icon: CreditCard,
      items: [
        {
          title: "All Payments",
          url: "/dashboard/payments",
        },
        {
          title: "New Payment",
          url: "/dashboard/payments/new",
        },
        {
          title: "Invoices",
          url: "/dashboard/payments/invoices",
        },
      ],
    },
    {
      title: "Reports",
      url: "/dashboard/reports",
      icon: BarChart3,
      items: [
        {
          title: "Occupancy",
          url: "/dashboard/reports/occupancy",
        },
        {
          title: "Revenue",
          url: "/dashboard/reports/revenue",
        },
        {
          title: "Guest Statistics",
          url: "/dashboard/reports/guests",
        },
      ],
    },
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: Settings,
      items: [
        {
          title: "General",
          url: "/dashboard/settings?tab=general",
        },
        {
          title: "Users",
          url: "/dashboard/settings?tab=users",
        },
        {
          title: "Taxes & Fees",
          url: "/dashboard/settings?tab=taxes",
        },
        {
          title: "Payment Methods",
          url: "/dashboard/settings?tab=payment-methods",
        },
      ],
    },
  ],
  projects: [
    {
      name: "Sunset Villa",
      url: "/dashboard/properties/1",
      icon: Hotel,
    },
    {
      name: "Mountain Lodge",
      url: "/dashboard/properties/2",
      icon: Building,
    },
    {
      name: "Beach Resort",
      url: "/dashboard/properties/3",
      icon: Home,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = authClient.useSession()

  // Get user data from session or use default data
  const userData = {
    name: session?.user?.name || data.user.name,
    email: session?.user?.email || data.user.email,
    avatar: session?.user?.image || data.user.avatar,
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <PropertySwitcher properties={data.properties} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProperties properties={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
