"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, Building2Icon, ShieldIcon, UsersIcon } from "lucide-react";

type OverviewCard = {
  title: string;
  description: string;
  icon: typeof Building2Icon;
  href: string;
  action: string;
  badge: string;
  requiresSettings?: boolean;
};

const cards: OverviewCard[] = [
  {
    title: "Tenant organizations",
    description: "Provision runtimes, monitor lifecycle, and open tenant admin consoles.",
    icon: Building2Icon,
    href: "/tenants",
    action: "View tenants",
    badge: "Operations",
  },
  {
    title: "Team & roles",
    description: "Invite platform operators, assign roles, and enforce least privilege.",
    icon: UsersIcon,
    href: "/owners",
    action: "Manage team",
    badge: "Access",
  },
  {
    title: "Security baseline",
    description: "MFA, session policy, and privileged actions for super administrators.",
    icon: ShieldIcon,
    href: "/settings",
    action: "Open settings",
    badge: "Super admin",
    requiresSettings: true,
  },
];

export function SectionCards({
  canAccessSettings,
}: {
  canAccessSettings?: boolean;
}) {
  const visible = cards.filter(
    (c) => !c.requiresSettings || Boolean(canAccessSettings),
  );

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-3 dark:*:data-[slot=card]:bg-card">
      {visible.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="@container/card border-border/80">
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {card.badge}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">{card.title}</CardTitle>
                <CardDescription className="mt-1.5 text-pretty leading-relaxed">
                  {card.description}
                </CardDescription>
              </div>
            </CardHeader>
            <CardFooter className="pt-0">
              <Link
                href={card.href}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "group -ml-2 h-8 gap-1 px-2 text-primary",
                )}
              >
                {card.action}
                <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
