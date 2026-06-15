"use client";

import { useMemo } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { VendorBillDoc } from "@/lib/pos-accounting-api";
import { posFetchVendorBills } from "@/lib/pos-accounting-api";
import { formatCurrency } from "@/lib/utils";

import { FINANCE_QUERY_STALE_MS } from "../_lib/finance-query-keys";

type UpcomingBill = {
  readonly id: string;
  readonly vendorBillNumber: string;
  readonly supplierName: string;
  readonly amount: number;
  readonly dueDate: Date;
};

function buildUpcomingBills(bills: readonly VendorBillDoc[]): readonly UpcomingBill[] {
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  return bills
    .filter((b): b is VendorBillDoc & { dueDate: string } => Boolean(b.dueDate))
    .map((b) => {
      const due = new Date(b.dueDate);
      const outstanding = (b.total ?? 0) - (b.amountPaid ?? 0);
      const supplierName =
        (typeof b.supplier === "object" && b.supplier?.name) ||
        (typeof b.supplier === "string" ? b.supplier : "Vendor");
      return {
        id: b._id,
        vendorBillNumber: b.vendorBillNumber,
        supplierName,
        amount: outstanding,
        dueDate: due,
      };
    })
    .filter((b) => b.amount > 0 && b.dueDate <= horizon && b.dueDate >= todayUtc)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 6);
}

export function CardOverview() {
  const vendorBillsQuery = useQuery({
    queryKey: ["finance", "vendor-bills", "posted"] as const,
    queryFn: () => posFetchVendorBills({ status: "posted" }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const upcomingBills = useMemo(() => buildUpcomingBills(vendorBillsQuery.data ?? []), [vendorBillsQuery.data]);

  const isLoading = vendorBillsQuery.isLoading;

  return (
    <Card className="shadow-xs">
      <CardHeader className="items-center">
        <CardTitle>Upcoming bills</CardTitle>
        <CardDescription>Posted vendor bills due in the next 30 days.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Separator />
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : upcomingBills.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-xs">No posted vendor bills due soon.</p>
        ) : (
          <div className="space-y-3">
            {upcomingBills.map((bill) => {
              const daysLeft = Math.ceil((bill.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const isOverdueSoon = daysLeft <= 3;
              return (
                <div key={bill.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 shrink-0 place-content-center rounded-md bg-muted">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-medium text-sm">{bill.supplierName}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {bill.vendorBillNumber} · Due {format(bill.dueDate, "MMM d")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOverdueSoon ? (
                      <Badge variant="destructive">{daysLeft <= 0 ? "Due today" : `${daysLeft}d`}</Badge>
                    ) : null}
                    <span className="font-medium text-sm tabular-nums">{formatCurrency(bill.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Separator />
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/dashboard/accounting/vendor-bills">View all vendor bills</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
