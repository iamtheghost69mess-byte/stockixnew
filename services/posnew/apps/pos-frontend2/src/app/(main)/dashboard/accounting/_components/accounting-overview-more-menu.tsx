"use client";

import Link from "next/link";

import {
  ChevronDown,
  Download,
  FileStack,
  Gift,
  Globe2,
  History,
  PiggyBank,
  Receipt,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccountingOverviewMoreMenuProps = {
  readonly canRead: boolean;
  readonly canGlRead: boolean;
  readonly canArRead: boolean;
  readonly canApRead: boolean;
};

export function AccountingOverviewMoreMenu({
  canRead,
  canGlRead,
  canArRead,
  canApRead,
}: AccountingOverviewMoreMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" type="button">
          More
          <ChevronDown className="ml-1 size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Reports &amp; tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canGlRead ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/balance-sheet">Balance sheet</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/cash-flow">Cash flow</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/budget-vs-actual">Budget vs actual</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/budgets">
                <Wallet className="mr-2 size-4" />
                Budgets
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/tax?tab=fx">
                <Globe2 className="mr-2 size-4" />
                Exchange rates
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/recurring-journals">Recurring journals</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/exports">
                <Download className="mr-2 size-4" />
                GL exports
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/audit-log">
                <History className="mr-2 size-4" />
                Audit log
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/order-gl">
                <RefreshCw className="mr-2 size-4" />
                Order GL tools
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {canArRead ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Accounts receivable</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/invoices">
                <Receipt className="mr-2 size-4" />
                Invoices
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/recurring-invoices">Recurring invoices</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/ar-aging">AR aging</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/credit-notes">Credit notes</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/gift-cards">
                <Gift className="mr-2 size-4" />
                Gift cards
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {canApRead ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Accounts payable</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/vendor-bills">
                <FileStack className="mr-2 size-4" />
                Vendor bills
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {canRead ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/accounting/bank">
                <PiggyBank className="mr-2 size-4" />
                Bank (beta)
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
