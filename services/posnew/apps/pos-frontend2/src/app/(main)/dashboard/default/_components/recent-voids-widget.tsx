"use client";

import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardRecentVoidRow } from "@/lib/pos-dashboard-api";

type RecentVoidsWidgetProps = {
  readonly rows: DashboardRecentVoidRow[];
  readonly isLoading: boolean;
};

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function RecentVoidsWidget({ rows, isLoading }: RecentVoidsWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 5 voids</CardTitle>
        <CardDescription>Latest item void events for current branch scope.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Loading void events...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No recent voids.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={`${row.orderRef}-${row.createdAt}-${row.itemName}`}>
                  <TableCell>{row.itemName || "Unknown item"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.orderRef.slice(-8) || "—"}</TableCell>
                  <TableCell>{row.tableNumber || "—"}</TableCell>
                  <TableCell>{row.voidedBy || "—"}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{row.reason || "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">{formatCreatedAt(row.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
