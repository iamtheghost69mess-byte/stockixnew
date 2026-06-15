"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportCompareControls } from "@/components/reports/report-compare-controls";
import { ReportCompareTable } from "@/components/reports/report-compare-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildReportRangeWindow,
  fetchSalesByCategoryReport,
  reportRangeFromLocalDates,
  salesByCategoryQueryKey,
} from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";
import { formatCurrency } from "@/lib/utils";

export default function SalesByCategoryReportPage() {
  const defaults = useMemo(() => buildReportRangeWindow({ daySpan: 30 }), []);
  const [currentFrom, setCurrentFrom] = useState(defaults.fromIso.slice(0, 10));
  const [currentTo, setCurrentTo] = useState(defaults.toIso.slice(0, 10));
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const range = useMemo(() => reportRangeFromLocalDates(currentFrom, currentTo), [currentFrom, currentTo]);
  const dateRangeLabel = useMemo(() => `${currentFrom} → ${currentTo}`, [currentFrom, currentTo]);
  const query = useQuery({
    queryKey: salesByCategoryQueryKey(range),
    queryFn: () => fetchSalesByCategoryReport(range),
  });
  const chartData = useMemo(
    () =>
      (query.data?.categories ?? []).slice(0, 16).map((row) => ({
        name: (row.categoryName || "Other").slice(0, 24),
        revenue: Number(row.totalRevenue ?? 0),
      })),
    [query.data?.categories],
  );
  const compareRange = useMemo(
    () => (compareFrom && compareTo ? reportRangeFromLocalDates(compareFrom, compareTo) : null),
    [compareFrom, compareTo],
  );
  const compareQuery = useQuery({
    queryKey: compareRange ? salesByCategoryQueryKey(compareRange) : ["crm", "reports", "sales-by-category", "idle"],
    queryFn: () => {
      if (!compareRange) throw new Error("Compare range missing");
      return fetchSalesByCategoryReport(compareRange);
    },
    enabled: compareEnabled && Boolean(compareRange),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Sales by Category</h1>
        <p className="mt-1 text-muted-foreground text-sm">Revenue mix grouped by menu category.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const rows = (query.data?.categories || []).map((row) => ({
              category: row.categoryName,
              itemCount: row.itemCount,
              revenue: row.totalRevenue,
              percentage: `${row.percentageOfTotal.toFixed(2)}%`,
            }));
            exportReportPdf({
              fileName: "sales-by-category.pdf",
              title: "Sales by Category",
              branchName: "Selected Branch",
              dateRange: dateRangeLabel,
              columns: [
                { key: "category", label: "Category" },
                { key: "itemCount", label: "Items" },
                { key: "revenue", label: "Revenue" },
                { key: "percentage", label: "% of Total" },
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
            const rows = (query.data?.categories || []).map((row) => ({
              category: row.categoryName,
              itemCount: row.itemCount,
              revenue: row.totalRevenue,
              percentage: row.percentageOfTotal,
            }));
            exportReportExcel({
              fileName: "sales-by-category.xlsx",
              branchName: "Selected Branch",
              dateRange: dateRangeLabel,
              columns: [
                { key: "category", label: "Category" },
                { key: "itemCount", label: "Items" },
                { key: "revenue", label: "Revenue" },
                { key: "percentage", label: "% of Total" },
              ],
              rows,
              totals: ["Total Revenue", query.data?.totalRevenue || 0],
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
              current: Number(query.data?.totalRevenue || 0),
              compare: Number(compareQuery.data?.totalRevenue || 0),
            },
            {
              label: "Categories",
              current: Number(query.data?.categories.length || 0),
              compare: Number(compareQuery.data?.categories.length || 0),
            },
          ]}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Category Performance</CardTitle>
          <CardDescription>Date range: {dateRangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading category revenue...
            </div>
          ) : (
            <>
              {chartData.length > 0 ? (
                <div className="mb-8 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 11 }} width={48} />
                      <Tooltip
                        formatter={(value) => [
                          formatCurrency(typeof value === "number" ? value : Number(value)),
                          "Revenue",
                        ]}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.categories || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                      No data in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  query.data?.categories.map((row) => (
                    <TableRow key={`${row.categoryId || "none"}-${row.categoryName}`}>
                      <TableCell>{row.categoryName || "Uncategorized"}</TableCell>
                      <TableCell className="text-right">{row.itemCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalRevenue || 0)}</TableCell>
                      <TableCell className="text-right">{(row.percentageOfTotal || 0).toFixed(2)}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
