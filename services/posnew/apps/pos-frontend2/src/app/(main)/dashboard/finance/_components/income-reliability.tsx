"use client";

import { useMemo } from "react";

import { useQueries } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import { utcLastNMonthSlices } from "../_lib/date-range";
import { fetchProfitLossReport } from "../_lib/fetch-profit-loss-report";
import { FINANCE_QUERY_STALE_MS, financePnlRangeQueryKey } from "../_lib/finance-query-keys";

export function IncomeReliability() {
  const months = useMemo(() => utcLastNMonthSlices(6, new Date()), []);

  const queries = useQueries({
    queries: months.map((m) => ({
      queryKey: financePnlRangeQueryKey(m.start, m.end),
      queryFn: () => fetchProfitLossReport({ start: m.start, end: m.end }),
      staleTime: FINANCE_QUERY_STALE_MS,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly P&amp;L</CardTitle>
        <CardDescription>Revenue and net operating income by calendar month (last six months, UTC).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Separator />
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-muted-foreground text-sm">Could not load one or more monthly reports.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Net operating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m, i) => {
                const row = queries[i]?.data;
                return (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row == null ? "—" : formatCurrency(row.revenue, { noDecimals: true })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row == null ? "—" : formatCurrency(row.netOperating, { noDecimals: true })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
