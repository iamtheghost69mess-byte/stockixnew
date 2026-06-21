"use client";

import Link from "next/link";

import {
  ArrowRight,
  MapPin,
  Percent,
  Printer,
  Receipt,
  Settings2,
  Tag,
  UtensilsCrossed,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PosConfigLink = {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly icon: typeof MapPin;
};

const LINKS: readonly PosConfigLink[] = [
  {
    title: "Branches & VAT",
    description: "Per-branch VAT rate, inclusive/exclusive flag, kitchen ticket workflow, and discount reason policy.",
    href: "/dashboard/locations",
    icon: MapPin,
  },
  {
    title: "Receipt layout",
    description: "Header, footer, logo, and tax lines shown on customer receipts.",
    href: "/dashboard/receipt-config",
    icon: Receipt,
  },
  {
    title: "Printers",
    description: "Thermal stations, receipt printer, and driver configuration.",
    href: "/dashboard/printers",
    icon: Printer,
  },
  {
    title: "Tax & treasury",
    description: "Org-wide tax codes, rates, and treasury defaults used with branch overrides.",
    href: "/dashboard/tax",
    icon: Percent,
  },
  {
    title: "Discounts & loyalty",
    description: "Loyalty rules and manual discount audit trail.",
    href: "/dashboard/discounts",
    icon: Tag,
  },
  {
    title: "Menu & catalog",
    description: "Categories, items, modifiers, and combos served on Open POS.",
    href: "/dashboard/categories",
    icon: UtensilsCrossed,
  },
  {
    title: "Report scheduling",
    description: "Email delivery hooks for scheduled analytics exports.",
    href: "/dashboard/settings/report-scheduling",
    icon: Settings2,
  },
];

/**
 * Hub page: groups POS-facing configuration that otherwise lives under separate sidebar entries.
 */
export default function PosConfigHubPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 lg:p-10">
      <div>
        <h1 className="font-bold text-3xl text-foreground tracking-tight">POS configuration</h1>
        <p className="mt-2 text-muted-foreground text-sm lg:text-base">
          Central index for branch defaults, printing, tax, and catalog settings that affect the live floor and Open POS
          terminals.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map((entry) => {
          const Icon = entry.icon;
          return (
            <Link key={entry.href} href={entry.href} className="group block rounded-xl focus-visible:outline-none">
              <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-1 text-base">
                      {entry.title}
                      <ArrowRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                    </CardTitle>
                    <CardDescription className="mt-1.5 text-xs leading-relaxed sm:text-sm">
                      {entry.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="font-medium text-primary text-xs underline-offset-4 group-hover:underline">
                    Open
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
