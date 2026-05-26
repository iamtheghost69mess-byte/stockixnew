"use client";

import Link from "next/link";

import { PosHealthAlert } from "@/components/pos-health-alert";
import { useNavIsActive } from "@/hooks/use-nav-active";
import { cn } from "@/lib/utils";

const POS_LINKS = [
  { href: "/pos", label: "Overview" },
  { href: "/pos/organizations", label: "Organizations" },
  { href: "/pos/devices", label: "Devices" },
  { href: "/pos/metrics", label: "Metrics" },
  { href: "/pos/webhooks", label: "Webhooks" },
  { href: "/pos/flags", label: "Feature flags" },
  { href: "/pos/jobs", label: "Jobs" },
  { href: "/pos/notifications", label: "Notifications" },
] as const;

export function PosPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const isNavActive = useNavIsActive();

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <PosHealthAlert />
      <nav className="flex flex-wrap gap-2 border-b pb-3">
        {POS_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isNavActive(link.href, { exact: link.href === "/pos" })
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
