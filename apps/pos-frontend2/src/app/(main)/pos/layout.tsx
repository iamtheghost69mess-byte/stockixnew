import type { ReactNode } from "react";

import Link from "next/link";

import { PosHostessPosRedirect } from "@/components/pos/pos-hostess-pos-redirect";
import { PosPosShell } from "@/components/pos/pos-pos-shell";
import { PosPrintJobListener } from "@/components/pos/pos-print-job-listener";

export default function PosLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <PosHostessPosRedirect />
      <PosPrintJobListener />
      <PosPosShell
        floorLink={<Link href="/pos">Floor</Link>}
        dashboardLink={<Link href="/dashboard/default">Dashboard</Link>}
      />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
