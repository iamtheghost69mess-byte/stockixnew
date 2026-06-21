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
  crmReportStaffQueryKey,
  fetchStaffReport,
  reportRangeFromLocalDates,
} from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";
import { formatCurrency } from "@/lib/utils";

export default function SalesByWaiterReportPage() {
  const defaults = useMemo(() => buildReportRangeWindow({ daySpan: 30 }), []);
  const [currentFrom, setCurrentFrom] = useState(defaults.fromIso.slice(0, 10));
  const [currentTo, setCurrentTo] = useState(defaults.toIso.slice(0, 10));
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const range = useMemo(() => reportRangeFromLocalDates(currentFrom, currentTo), [currentFrom, currentTo]);
  const dateRangeLabel = useMemo(() => `${currentFrom} → ${currentTo}`, [currentFrom, currentTo]);
  const query = useQuery({
    queryKey: crmReportStaffQueryKey(range),
    queryFn: () => fetchStaffReport(range),
  });
  const compareRange = useMemo(
    () => (compareFrom && compareTo ? reportRangeFromLocalDates(compareFrom, compareTo) : null),
    [compareFrom, compareTo],
  );
  const compareQuery = useQuery({
    queryKey: compareRange ? crmReportStaffQueryKey(compareRange) : ["crm", "reports", "staff", "idle"],
    queryFn: () => {
      if (!compareRange) throw new Error("Compare range missing");
      return fetchStaffReport(compareRange);
    },
    enabled: compareEnabled && Boolean(compareRange),
  });

  const compareRows = useMemo(() => {
    if (!compareEnabled || !compareQuery.data?.staff || !query.data?.staff) return [];
    const labels = [
      "Total revenue",
      "Total orders",
      "Average order value",
      "Items ordered",
      "Discount applied",
    ];
    const agg = (rows: typeof query.data.staff) => ({
      rev: rows.reduce((a, s) => a + (Number(s.revenue) || 0), 0),
      ord: rows.reduce((a, s) => a + (Number(s.orderCount) || 0), 0),
      items: rows.reduce((a, s) => a + (Number(s.totalItemsOrdered) || 0), 0),
      disc: rows.reduce((a, s) => a + (Number(s.totalDiscountApplied) || 0), 0),
    });
    const a1 = agg(query.data.staff);
    const a2 = agg(compareQuery.data.staff);
    const aov1 = a1.ord > 0 ? a1.rev / a1.ord : 0;
    const aov2 = a2.ord > 0 ? a2.rev / a2.ord : 0;
    return [
      { label: labels[0], current: a1.rev, compare: a2.rev },
      { label: labels[1], current: a1.ord, compare: a2.ord },
      { label: labels[2], current: aov1, compare: aov2 },
      { label: labels[3], current: a1.items, compare: a2.items },
      { label: labels[4], current: a1.disc, compare: a2.disc },
    ];
  }, [compareEnabled, compareQuery.data?.staff, query.data?.staff]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Sales by Waiter</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Per-server performance for the selected branch scope and date range.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const rows = (query.data?.staff ?? []).map((s) => ({
              staffName: s.name,
              totalOrders: s.orderCount,
              totalRevenue: s.revenue,
              avgOrderValue: s.averageOrderValue,
              totalItemsOrdered: s.totalItemsOrdered,
              totalDiscountApplied: s.totalDiscountApplied,
            }));
            exportReportPdf({
              fileName: "sales-by-waiter.pdf",
              title: "Sales by Waiter",
              branchName: "Selected Branch",
              dateRange: dateRangeLabel,
              columns: [
                { key: "staffName", label: "Staff" },
                { key: "totalOrders", label: "Orders" },
                { key: "totalRevenue", label: "Revenue" },
                { key: "avgOrderValue", label: "Avg check" },
                { key: "totalItemsOrdered", label: "Items" },
                { key: "totalDiscountApplied", label: "Discounts" },
              ],
              rows,
            });
          }}
        >
          <Download className="mr-2 size-4" />
          Export PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const rows = (query.data?.staff ?? []).map((s) => ({
              staffName: s.name,
              totalOrders: s.orderCount,
              totalRevenue: s.revenue,
              avgOrderValue: s.averageOrderValue,
              totalItemsOrdered: s.totalItemsOrdered,
              totalDiscountApplied: s.totalDiscountApplied,
            }));
            exportReportExcel({
              fileName: "sales-by-waiter.xlsx",
              branchName: "Selected Branch",
              dateRange: dateRangeLabel,
              columns: [
                { key: "staffName", label: "Staff" },
                { key: "totalOrders", label: "Orders" },
                { key: "totalRevenue", label: "Revenue" },
                { key: "avgOrderValue", label: "Avg check" },
                { key: "totalItemsOrdered", label: "Items" },
                { key: "totalDiscountApplied", label: "Discounts" },
              ],
              rows,
              totals: [
                "Totals",
                rows.reduce((a, r) => a + Number(r.totalOrders || 0), 0),
                rows.reduce((a, r) => a + Number(r.totalRevenue || 0), 0),
                "",
                rows.reduce((a, r) => a + Number(r.totalItemsOrdered || 0), 0),
                rows.reduce((a, r) => a + Number(r.totalDiscountApplied || 0), 0),
              ],
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
      {compareEnabled && compareRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Period comparison</CardTitle>
            <CardDescription>Aggregated movement across all servers in each window.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportCompareTable rows={compareRows} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Wait staff</CardTitle>
          <CardDescription>Orders, revenue, items, and discount exposure.</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg check</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Discounts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.staff ?? []).map((row) => (
                  <TableRow key={row.userId ?? row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.orderCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.averageOrderValue)}</TableCell>
                    <TableCell className="text-right">{row.totalItemsOrdered}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.totalDiscountApplied)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
