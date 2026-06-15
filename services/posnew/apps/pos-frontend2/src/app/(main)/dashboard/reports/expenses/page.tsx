"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportCompareControls } from "@/components/reports/report-compare-controls";
import { ReportCompareTable } from "@/components/reports/report-compare-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildReportRangeWindow,
  expensesReportQueryKey,
  fetchExpensesReport,
  reportRangeFromLocalDates,
} from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";
import { formatCurrency } from "@/lib/utils";

export default function ExpenseBreakdownReportPage() {
  const defaults = useMemo(() => buildReportRangeWindow({ daySpan: 30 }), []);
  const [currentFrom, setCurrentFrom] = useState(defaults.fromIso.slice(0, 10));
  const [currentTo, setCurrentTo] = useState(defaults.toIso.slice(0, 10));
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const range = useMemo(() => reportRangeFromLocalDates(currentFrom, currentTo), [currentFrom, currentTo]);
  const query = useQuery({
    queryKey: expensesReportQueryKey(range),
    queryFn: () => fetchExpensesReport(range),
  });
  const compareRange = useMemo(
    () => (compareFrom && compareTo ? reportRangeFromLocalDates(compareFrom, compareTo) : null),
    [compareFrom, compareTo],
  );
  const compareQuery = useQuery({
    queryKey: compareRange ? expensesReportQueryKey(compareRange) : ["crm", "reports", "expenses", "idle"],
    queryFn: () => {
      if (!compareRange) throw new Error("Compare range missing");
      return fetchExpensesReport(compareRange);
    },
    enabled: compareEnabled && Boolean(compareRange),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Expense Breakdown</h1>
        <p className="mt-1 text-muted-foreground text-sm">Expense accounts for the selected branch and period.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const rows = (query.data?.groups || []).map((row) => ({
              accountCode: row.accountCode,
              accountName: row.accountName,
              amount: row.amount,
            }));
            exportReportPdf({
              fileName: "expense-breakdown.pdf",
              title: "Expense Breakdown",
              branchName: "Selected Branch",
              dateRange: "Last 30 days",
              columns: [
                { key: "accountCode", label: "Code" },
                { key: "accountName", label: "Account" },
                { key: "amount", label: "Amount" },
              ],
              rows,
            });
          }}
        >
          <Download className="mr-2 size-4" />
          Export PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const rows = (query.data?.groups || []).map((row) => ({
              accountCode: row.accountCode,
              accountName: row.accountName,
              amount: row.amount,
            }));
            exportReportExcel({
              fileName: "expense-breakdown.xlsx",
              branchName: "Selected Branch",
              dateRange: "Last 30 days",
              columns: [
                { key: "accountCode", label: "Code" },
                { key: "accountName", label: "Account" },
                { key: "amount", label: "Amount" },
              ],
              rows,
              totals: ["Total Expense", query.data?.totalExpense || 0],
            });
          }}
        >
          <FileSpreadsheet className="mr-2 size-4" />
          Export Excel
        </Button>
      </div>
      <ReportCompareControls
        enabled={compareEnabled}
        onEnabledChange={setCompareEnabled}
        currentFrom={currentFrom}
        currentTo={currentTo}
        compareFrom={compareFrom}
        compareTo={compareTo}
        onCurrentFromChange={setCurrentFrom}
        onCurrentToChange={setCurrentTo}
        onCompareFromChange={setCompareFrom}
        onCompareToChange={setCompareTo}
      />
      {compareEnabled && compareQuery.data ? (
        <ReportCompareTable
          rows={[
            {
              label: "Total Expense",
              current: Number(query.data?.totalExpense || 0),
              compare: Number(compareQuery.data?.totalExpense || 0),
            },
            {
              label: "Accounts",
              current: Number(query.data?.groups.length || 0),
              compare: Number(compareQuery.data?.groups.length || 0),
            },
          ]}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
          <CardDescription>Current window: last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading expense groups...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.groups || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                      No expense rows for this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  query.data?.groups.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell className="font-mono text-xs">{row.accountCode || "—"}</TableCell>
                      <TableCell>{row.accountName || "Expense"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount || 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
