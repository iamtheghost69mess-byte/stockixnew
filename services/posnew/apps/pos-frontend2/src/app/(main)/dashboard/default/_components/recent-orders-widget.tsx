"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FinanceSyncStatusBadge } from "@/components/finance-sync-status-badge";
import type { DashboardRecentOrderRow } from "@/lib/pos-dashboard-api";
import { formatCurrency } from "@/lib/utils";

type RecentOrdersWidgetProps = {
  readonly rows: DashboardRecentOrderRow[];
  readonly isLoading: boolean;
};

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function RecentOrdersWidget({ rows, isLoading }: RecentOrdersWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 5 orders</CardTitle>
        <CardDescription>Most recent paid/closed orders for current branch scope.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Waiter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Finance</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Loading recent orders...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No recent paid/closed orders.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={`${row.orderId}-${row.createdAt}`}>
                  <TableCell>
                    <Link
                      href={
                        row.tableId && row.tableId.length === 24
                          ? `/pos/t/${row.tableId}`
                          : "/pos"
                      }
                      className="font-mono text-xs underline-offset-4 hover:underline"
                    >
                      {row.orderId.slice(-8)}
                    </Link>
                  </TableCell>
                  <TableCell>{row.tableNumber || "—"}</TableCell>
                  <TableCell>{row.waiterName || "—"}</TableCell>
                  <TableCell className="capitalize">{row.status || "—"}</TableCell>
                  <TableCell>
                    <FinanceSyncStatusBadge
                      orderId={row.orderId}
                      status={row.accountingSaleStatus}
                      error={row.accountingSaleError}
                      compact
                    />
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(row.totalAmount || 0)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {formatCreatedAt(row.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
