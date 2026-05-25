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
  { href: "/pms/guest-forms", label: "Guest Forms" },
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
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">You are here:</span> Platform admin PMS —
            manage any licensed tenant. Same login as the dashboard (
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              /login
            </Link>
            ).
          </p>
          <p className="mt-2">
            <span className="font-medium text-foreground">Guest pre-arrival forms</span> are served
            at{" "}
            <code className="rounded bg-muted px-1">/g/:token</code>{" "}
            on this host. Share links are generated in the Guest Forms tab.
          </p>
          <p className="mt-2 text-xs">
            Metrics require the PMS API running (
            <code className="rounded bg-muted px-1">pnpm dev</code> → look for{" "}
            <code className="rounded bg-muted px-1">[pms] PMS service listening</code>).
          </p>
        </div>
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
