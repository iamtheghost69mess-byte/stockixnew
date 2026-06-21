"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportCompareControls } from "@/components/reports/report-compare-controls";
import { ReportCompareTable } from "@/components/reports/report-compare-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  branchComparisonQueryKey,
  buildReportRangeWindow,
  fetchBranchComparisonReport,
  reportRangeFromLocalDates,
} from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";
import { cn, formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function BranchComparisonPage() {
  const role = String(usePosAuthStore((s) => s.user?.role || "")).toLowerCase();
  const canUseAllBranchesHeader = role === "admin" || role === "manager";
  const defaults = useMemo(() => buildReportRangeWindow({ daySpan: 30 }), []);
  const [currentFrom, setCurrentFrom] = useState(defaults.fromIso.slice(0, 10));
  const [currentTo, setCurrentTo] = useState(defaults.toIso.slice(0, 10));
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const range = useMemo(() => reportRangeFromLocalDates(currentFrom, currentTo), [currentFrom, currentTo]);
  const dateRangeLabel = useMemo(() => `${currentFrom} → ${currentTo}`, [currentFrom, currentTo]);
  const query = useQuery({
    queryKey: branchComparisonQueryKey(range),
    queryFn: () => fetchBranchComparisonReport(range),
  });
  const compareRange = useMemo(
    () => (compareFrom && compareTo ? reportRangeFromLocalDates(compareFrom, compareTo) : null),
    [compareFrom, compareTo],
  );
  const compareQuery = useQuery({
    queryKey: compareRange ? branchComparisonQueryKey(compareRange) : ["crm", "reports", "branch-comparison", "idle"],
    queryFn: () => {
      if (!compareRange) throw new Error("Compare range missing");
      return fetchBranchComparisonReport(compareRange);
    },
    enabled: compareEnabled && Boolean(compareRange),
  });

  const { bestBranchId, worstBranchId } = useMemo(() => {
    const branches = query.data?.branches ?? [];
    if (branches.length === 0) return { bestBranchId: null as string | null, worstBranchId: null as string | null };
    let best = branches[0];
    let worst = branches[0];
    for (const b of branches) {
      if (Number(b.totalRevenue) > Number(best.totalRevenue)) best = b;
      if (Number(b.totalRevenue) < Number(worst.totalRevenue)) worst = b;
    }
    return { bestBranchId: best.locationId, worstBranchId: worst.locationId };
  }, [query.data?.branches]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Branch Comparison</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Side-by-side paid-order performance across all branches in the selected date range.
        </p>
      </div>
      {!canUseAllBranchesHeader ? (
        <Alert>
          <AlertTitle className="text-sm">Branch scope</AlertTitle>
          <AlertDescription className="text-sm">
            Only <span className="font-medium">admin</span> and <span className="font-medium">manager</span> roles may
            set the dashboard header to <strong>All branches</strong> (HTTP header{" "}
            <code className="text-xs">X-Location-Id: all</code>). Other roles still see comparison for their assigned
            branch scope.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const rows = (query.data?.branches || []).map((row) => ({
              branch: row.locationName,
              orders: row.orderCount,
              netSales: row.netSales,
              tax: row.totalTax,
              revenue: row.totalRevenue,
              aov: row.averageOrderValue,
            }));
            exportReportPdf({
              fileName: "branch-comparison.pdf",
              title: "Branch Comparison",
              branchName: "All Branches",
              dateRange: dateRangeLabel,
              columns: [
                { key: "branch", label: "Branch" },
                { key: "orders", label: "Orders" },
                { key: "netSales", label: "Net Sales" },
                { key: "tax", label: "Tax" },
                { key: "revenue", label: "Revenue" },
                { key: "aov", label: "AOV" },
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
            const rows = (query.data?.branches || []).map((row) => ({
              branch: row.locationName,
              orders: row.orderCount,
              netSales: row.netSales,
              tax: row.totalTax,
              revenue: row.totalRevenue,
              aov: row.averageOrderValue,
            }));
            exportReportExcel({
              fileName: "branch-comparison.xlsx",
              branchName: "All Branches",
              dateRange: dateRangeLabel,
              columns: [
                { key: "branch", label: "Branch" },
                { key: "orders", label: "Orders" },
                { key: "netSales", label: "Net Sales" },
                { key: "tax", label: "Tax" },
                { key: "revenue", label: "Revenue" },
                { key: "aov", label: "AOV" },
              ],
              rows,
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
              label: "Total Revenue",
              current: Number(query.data?.summary.totalRevenue || 0),
              compare: Number(compareQuery.data?.summary.totalRevenue || 0),
            },
            {
              label: "Total Orders",
              current: Number(query.data?.summary.totalOrders || 0),
              compare: Number(compareQuery.data?.summary.totalOrders || 0),
            },
          ]}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
          <CardDescription>Date range: {dateRangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading comparison...
            </div>
          ) : query.data ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Branches</p>
                <p className="font-semibold text-lg">{query.data.summary.branchCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Orders</p>
                <p className="font-semibold text-lg">{query.data.summary.totalOrders}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Net Sales</p>
                <p className="font-semibold text-lg">{formatCurrency(query.data.summary.totalNetSales)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Tax</p>
                <p className="font-semibold text-lg">{formatCurrency(query.data.summary.totalTax)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Revenue</p>
                <p className="font-semibold text-lg">{formatCurrency(query.data.summary.totalRevenue)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Avg Order Value</p>
                <p className="font-semibold text-lg">{formatCurrency(query.data.summary.averageOrderValue)}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No data available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Branch</CardTitle>
          <CardDescription>Sorted by revenue descending.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Net Sales</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.branches || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No branch activity found.
                    </TableCell>
                  </TableRow>
                ) : (
                  query.data?.branches.map((row) => (
                    <TableRow
                      key={row.locationId}
                      className={cn(
                        row.locationId === bestBranchId && "bg-emerald-500/10",
                        row.locationId === worstBranchId && row.locationId !== bestBranchId && "bg-rose-500/10",
                      )}
                    >
                      <TableCell>
                        <p className="font-medium">{row.locationName}</p>
                        {row.locationCode ? (
                          <p className="text-muted-foreground text-xs">{row.locationCode}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{row.orderCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.netSales)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalTax)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.averageOrderValue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
