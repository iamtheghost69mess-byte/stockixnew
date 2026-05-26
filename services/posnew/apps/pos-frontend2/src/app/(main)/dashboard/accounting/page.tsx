"use client";

import Link from "next/link";

import {
  BarChart3,
  CalendarDays,
  GitCompareArrows,
  Landmark,
  ScrollText,
  Settings2,
  Table2,
  Timer,
} from "lucide-react";

import { AccountingOverviewMoreMenu } from "@/app/(main)/dashboard/accounting/_components/accounting-overview-more-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function AccountingOverviewPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");
  const canArRead = posCan(permissions, "backoffice.accounting.ar.read");
  const canApRead = posCan(permissions, "backoffice.accounting.ap.read");
  const canWrite = posCan(permissions, "backoffice.accounting.write");

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">Accounting</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Configure the general ledger, review activity, and open financial reports. Use{" "}
          <strong className="text-foreground">Chart of accounts</strong> to manage codes and balances.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Essentials</CardTitle>
          <CardDescription>Primary workflows for day-to-day bookkeeping.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/accounting/accounts">
              <Landmark className="mr-2 size-4" />
              Chart of accounts
            </Link>
          </Button>
          {canWrite ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/finance-integration">
                <GitCompareArrows className="mr-2 size-4" />
                Finance bridge
              </Link>
            </Button>
          ) : null}
          {canRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/settings">
                <Settings2 className="mr-2 size-4" />
                GL settings
              </Link>
            </Button>
          ) : null}
          {canGlRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/ledger">
                <ScrollText className="mr-2 size-4" />
                Entries
              </Link>
            </Button>
          ) : null}
          {canGlRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/trial-balance">
                <Table2 className="mr-2 size-4" />
                Trial balance
              </Link>
            </Button>
          ) : null}
          {canGlRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/pnl">
                <BarChart3 className="mr-2 size-4" />
                Profit &amp; Loss
              </Link>
            </Button>
          ) : null}
          {canRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/sessions">
                <Timer className="mr-2 size-4" />
                Register sessions
              </Link>
            </Button>
          ) : null}
          {canRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/periods">
                <CalendarDays className="mr-2 size-4" />
                Fiscal periods
              </Link>
            </Button>
          ) : null}

          <AccountingOverviewMoreMenu
            canRead={canRead}
            canGlRead={canGlRead}
            canArRead={canArRead}
            canApRead={canApRead}
          />
        </CardContent>
      </Card>

      <p className="text-center text-muted-foreground text-xs">
        Full list remains under <strong className="text-foreground">Accounting</strong> in the sidebar.
      </p>
    </div>
  );
}
