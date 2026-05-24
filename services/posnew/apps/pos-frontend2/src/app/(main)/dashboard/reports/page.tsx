"use client";

import Link from "next/link";

import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  LineChart,
  PieChart,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const REPORT_GROUPS = [
  {
    title: "Financial Statements",
    description: "Core accounting reports for fiscal health monitoring.",
    items: [
      {
        name: "Profit & Loss",
        href: "/dashboard/accounting/pnl",
        icon: TrendingUp,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
      },
      {
        name: "Balance Sheet",
        href: "/dashboard/accounting/balance-sheet",
        icon: Wallet,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      },
      {
        name: "Cash Flow",
        href: "/dashboard/accounting/cash-flow",
        icon: Activity,
        color: "text-amber-500",
        bg: "bg-amber-500/10",
      },
      {
        name: "Trial Balance",
        href: "/dashboard/accounting/trial-balance",
        icon: BookOpen,
        color: "text-purple-500",
        bg: "bg-purple-500/10",
      },
    ],
  },
  {
    title: "Operations & Sales",
    description: "Insights into inventory performance and day-to-day revenue.",
    items: [
      {
        name: "Inventory Analytics",
        href: "/dashboard/inventory/analytics",
        icon: BarChart3,
        color: "text-rose-500",
        bg: "bg-rose-500/10",
      },
      {
        name: "Register Sessions",
        href: "/dashboard/accounting/sessions",
        icon: History,
        color: "text-indigo-500",
        bg: "bg-indigo-500/10",
      },
      {
        name: "Stock Take History",
        href: "/dashboard/inventory/stock-take",
        icon: ClipboardList,
        color: "text-cyan-500",
        bg: "bg-cyan-500/10",
      },
      {
        name: "Menu Availability",
        href: "/dashboard/inventory/menu-availability",
        icon: LayoutDashboard,
        color: "text-orange-500",
        bg: "bg-orange-500/10",
      },
      {
        name: "Void Report",
        href: "/dashboard/reports/voids",
        icon: FileText,
        color: "text-red-500",
        bg: "bg-red-500/10",
      },
      {
        name: "Sales by Category",
        href: "/dashboard/reports/sales-by-category",
        icon: BarChart3,
        color: "text-lime-500",
        bg: "bg-lime-500/10",
      },
      {
        name: "Sales by Waiter",
        href: "/dashboard/reports/sales-by-waiter",
        icon: Users,
        color: "text-green-500",
        bg: "bg-green-500/10",
      },
      {
        name: "Expense Breakdown",
        href: "/dashboard/reports/expenses",
        icon: TrendingDown,
        color: "text-yellow-500",
        bg: "bg-yellow-500/10",
      },
    ],
  },
  {
    title: "Accounts Receivable/Payable",
    description: "Tracking customer debts and vendor obligations.",
    items: [
      {
        name: "AR Aging Report",
        href: "/dashboard/accounting/ar-aging",
        icon: LineChart,
        color: "text-teal-500",
        bg: "bg-teal-500/10",
      },
      {
        name: "Vendor Bills",
        href: "/dashboard/accounting/vendor-bills",
        icon: Receipt,
        color: "text-slate-500",
        bg: "bg-slate-500/10",
      },
      {
        name: "VAT Report",
        href: "/dashboard/reports/vat",
        icon: FileText,
        color: "text-fuchsia-500",
        bg: "bg-fuchsia-500/10",
      },
      {
        name: "Branch Comparison",
        href: "/dashboard/reports/branch-comparison",
        icon: BarChart3,
        color: "text-sky-500",
        bg: "bg-sky-500/10",
      },
    ],
  },
  {
    title: "Compliance & Audit",
    description: "System logs and transaction-level verification.",
    items: [
      {
        name: "POS audit trail",
        href: "/dashboard/reports/pos-audit",
        icon: History,
        color: "text-violet-500",
        bg: "bg-violet-500/10",
      },
      {
        name: "Audit Log",
        href: "/dashboard/accounting/audit-log",
        icon: ShieldCheck,
        color: "text-zinc-500",
        bg: "bg-zinc-500/10",
      },
      {
        name: "Budget vs Actual",
        href: "/dashboard/accounting/budget-vs-actual",
        icon: PieChart,
        color: "text-pink-500",
        bg: "bg-pink-500/10",
      },
    ],
  },
];

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-3xl tracking-tight text-zinc-100 lg:text-4xl">Reports & Analytics</h1>
        <p className="text-zinc-500 lg:text-lg">
          Consolidated business intelligence for financial oversight and inventory control.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {REPORT_GROUPS.map((group) => (
          <div key={group.title} className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg text-zinc-200">{group.title}</h2>
              <p className="text-sm text-zinc-600">{group.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <Link key={item.name} href={item.href} className="group flex h-full">
                  <Card className="flex w-full flex-col border-zinc-900 bg-zinc-950/40 transition-all hover:border-zinc-700 hover:bg-zinc-900/40">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0 p-5">
                      <div
                        className={cn(
                          "rounded-lg p-2.5 transition-transform group-hover:scale-105",
                          item.bg,
                          item.color,
                        )}
                      >
                        <item.icon className="size-5" />
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <CardTitle className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100">
                          {item.name}
                        </CardTitle>
                      </div>
                      <ArrowRight className="size-4 text-zinc-800 transition-transform group-hover:translate-x-1 group-hover:text-zinc-500" />
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
