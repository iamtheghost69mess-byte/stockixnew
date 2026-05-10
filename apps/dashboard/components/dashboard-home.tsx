"use client";

import { SectionCards } from "@/components/section-cards";
import { useMe } from "@/hooks/use-me";

export function DashboardHome() {
  const me = useMe();

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Operate the Stockix control plane from one place: customer tenants, your operator team,
          and security controls.
        </p>
      </div>
      <SectionCards canAccessSettings={me?.capabilities.canAccessSettings} />
    </div>
  );
}
