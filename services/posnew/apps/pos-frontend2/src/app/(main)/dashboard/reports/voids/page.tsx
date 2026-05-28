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
  fetchVoidsReport,
  reportRangeFromLocalDates,
  voidsReportQueryKey,
} from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";

export default function VoidsReportPage() {
  const defaults = useMemo(() => buildReportRangeWindow({ daySpan: 30 }), []);
  const [currentFrom, setCurrentFrom] = useState(defaults.fromIso.slice(0, 10));
  const [currentTo, setCurrentTo] = useState(defaults.toIso.slice(0, 10));
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const range = useMemo(() => reportRangeFromLocalDates(currentFrom, currentTo), [currentFrom, currentTo]);
  const query = useQuery({
    queryKey: voidsReportQueryKey(range),
    queryFn: () => fetchVoidsReport(range),
  });
  const compareRange = useMemo(
    () => (compareFrom && compareTo ? reportRangeFromLocalDates(compareFrom, compareTo) : null),
    [compareFrom, compareTo],
  );
  const compareQuery = useQuery({
    queryKey: compareRange ? voidsReportQueryKey(compareRange) : ["crm", "reports", "voids", "idle"],
    queryFn: () => {
      if (!compareRange) throw new Error("Compare range missing");
      return fetchVoidsReport(compareRange);
    },
    enabled: compareEnabled && Boolean(compareRange),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Void Report</h1>
        <p className="mt-1 text-muted-foreground text-sm">Recent void actions scoped by selected branch.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const rows = (query.data?.items || []).map((row) => ({
              itemName: row.itemName || "—",
              orderRef: row.orderRef || "—",
              tableNumber: row.tableNumber || "—",
              voidedBy: row.voidedBy || "—",
              reason: row.reason || "—",
              createdAt: row.createdAt || "—",
            }));
            exportReportPdf({
              fileName: "void-report.pdf",
              title: "Void Report",
              branchName: "Selected Branch",
              dateRange: "Last 30 days",
              columns: [
                { key: "itemName", label: "Item" },
                { key: "orderRef", label: "Order" },
                { key: "tableNumber", label: "Table" },
                { key: "voidedBy", label: "Voided By" },
                { key: "reason", label: "Reason" },
                { key: "createdAt", label: "When" },
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
            const rows = (query.data?.items || []).map((row) => ({
              itemName: row.itemName || "—",
              orderRef: row.orderRef || "—",
              tableNumber: row.tableNumber || "—",
              voidedBy: row.voidedBy || "—",
              reason: row.reason || "—",
              createdAt: row.createdAt || "—",
            }));
            exportReportExcel({
              fileName: "void-report.xlsx",
              branchName: "Selected Branch",
              dateRange: "Last 30 days",
              columns: [
                { key: "itemName", label: "Item" },
                { key: "orderRef", label: "Order" },
                { key: "tableNumber", label: "Table" },
                { key: "voidedBy", label: "Voided By" },
                { key: "reason", label: "Reason" },
                { key: "createdAt", label: "When" },
              ],
              rows,
              totals: ["Total", rows.length],
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
              label: "Void Count",
              current: Number(query.data?.count || 0),
              compare: Number(compareQuery.data?.count || 0),
            },
          ]}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Voids</CardTitle>
          <CardDescription>Current window: last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading voids...
            </div>
          ) : (
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
                {(query.data?.items || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                      No void records in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  query.data?.items.map((row) => (
                    <TableRow key={`${row.orderRef}-${row.createdAt}-${row.itemName}`}>
                      <TableCell>{row.itemName || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.orderRef?.slice(-8) || "—"}</TableCell>
                      <TableCell>{row.tableNumber || "—"}</TableCell>
                      <TableCell>{row.voidedBy || "—"}</TableCell>
                      <TableCell>{row.reason || "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                      </TableCell>
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
