"use client";

import type { ReactElement } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LINKS: readonly { readonly href: string; readonly label: string }[] = [
  { href: "/dashboard/finance?demo=1", label: "Finance overview (sample data)" },
  { href: "/dashboard/accounting/invoices", label: "Invoices" },
  { href: "/dashboard/accounting/vendor-bills", label: "Vendor bills" },
  { href: "/dashboard/accounting/ledger", label: "Journal ledger" },
  { href: "/dashboard/accounting/accounts", label: "Chart of accounts" },
  { href: "/dashboard/accounting/trial-balance", label: "Trial balance" },
  { href: "/dashboard/accounting/balance-sheet", label: "Balance sheet" },
  { href: "/dashboard/accounting/pnl", label: "P&L report" },
  { href: "/dashboard/accounting/cash-flow", label: "Cash flow" },
  { href: "/dashboard/accounting/budget-vs-actual", label: "Budget vs actual" },
  { href: "/dashboard/accounting/ar-aging", label: "AR aging" },
  { href: "/dashboard/accounting/bank", label: "Bank" },
  { href: "/dashboard/accounting/exports", label: "Exports" },
  { href: "/dashboard/accounting/budgets", label: "Budgets" },
  { href: "/dashboard/accounting/settings", label: "Accounting settings" },
] as const;

export function FinanceUtilitiesTab(): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Utilities</CardTitle>
        <CardDescription>Shortcuts to accounting workspaces (same routes used across backoffice).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LINKS.map((item) => (
            <Button key={item.href} variant="outline" className="justify-start" asChild>
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
