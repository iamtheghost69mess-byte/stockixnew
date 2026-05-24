"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const PMS_LINKS = [
  { href: "/pms", label: "Overview", exact: true },
  { href: "/pms/properties", label: "Properties" },
  { href: "/pms/rooms", label: "Rooms" },
  { href: "/pms/bookings", label: "Bookings" },
  { href: "/pms/guests", label: "Guests" },
  { href: "/pms/payments", label: "Payments" },
  { href: "/pms/channels", label: "iCal Channels" },
  { href: "/pms/cleaning", label: "Cleaning" },
  { href: "/pms/reports", label: "Reports" },
  { href: "/pms/calendar", label: "Calendar" },
  { href: "/pms/date-overrides", label: "Date Overrides" },
  { href: "/pms/message-templates", label: "Templates" },
  { href: "/pms/staff", label: "Staff" },
] as const;

export function PmsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <nav className="flex flex-wrap gap-2 border-b pb-3">
        {PMS_LINKS.map((link) => {
          const isActive = "exact" in link && link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
