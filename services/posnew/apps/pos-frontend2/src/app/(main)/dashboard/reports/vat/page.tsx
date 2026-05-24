"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportCompareTable } from "@/components/reports/report-compare-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  downloadVatReportPdf,
  fetchVatReport,
  vatReportQueryKey,
  type VatReportData,
} from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";

function currentPeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function vatRows(data: VatReportData): Array<{ label: string; value: string }> {
  return [
    { label: "VAT Rate", value: `${formatMoney(data.vatRate)}%` },
    { label: "Net Sales", value: formatMoney(data.netSales) },
    { label: "VAT Collected", value: formatMoney(data.totalVATCollected) },
    { label: "Gross Sales", value: formatMoney(data.totalSales) },
  ];
}

export default function VatReportPage() {
  const defaults = useMemo(() => currentPeriod(), []);
  const [month, setMonth] = useState<number>(defaults.month);
  const [year, setYear] = useState<number>(defaults.year);
  const [compareMonth, setCompareMonth] = useState<number>(defaults.month);
  const [compareYear, setCompareYear] = useState<number>(defaults.year - 1);
  const [compareEnabled, setCompareEnabled] = useState(false);

  const reportQuery = useQuery({
    queryKey: vatReportQueryKey({ month, year }),
    queryFn: () => fetchVatReport({ month, year }),
  });

  const downloadMutation = useMutation({
    mutationFn: () => downloadVatReportPdf({ month, year }),
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to export VAT report PDF.";
      toast.error(message);
    },
  });

  const rows = reportQuery.data ? vatRows(reportQuery.data) : [];
  const compareQuery = useQuery({
    queryKey: vatReportQueryKey({ month: compareMonth, year: compareYear }),
    queryFn: () => fetchVatReport({ month: compareMonth, year: compareYear }),
    enabled: compareEnabled,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">VAT Report</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Monthly VAT summary based on journal lines posted to the VAT payable account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Period</CardTitle>
          <CardDescription>Select month and year to calculate VAT totals.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="vat-month">Month</Label>
            <Input
              id="vat-month"
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setMonth(next);
              }}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat-year">Year</Label>
            <Input
              id="vat-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setYear(next);
              }}
              className="w-28"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
          >
            {downloadMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Export PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!reportQuery.data) return;
              exportReportPdf({
                fileName: `vat-report-${year}-${String(month).padStart(2, "0")}.pdf`,
                title: "VAT Report",
                branchName: "Selected Branch",
                dateRange: `${year}-${String(month).padStart(2, "0")}`,
                columns: [
                  { key: "label", label: "Metric" },
                  { key: "value", label: "Value" },
                ],
                rows,
              });
            }}
            disabled={!reportQuery.data}
          >
            <Download className="mr-2 size-4" />
            Export PDF (Client)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!reportQuery.data) return;
              exportReportExcel({
                fileName: `vat-report-${year}-${String(month).padStart(2, "0")}.xlsx`,
                branchName: "Selected Branch",
                dateRange: `${year}-${String(month).padStart(2, "0")}`,
                columns: [
                  { key: "label", label: "Metric" },
                  { key: "value", label: "Value" },
                ],
                rows,
              });
            }}
            disabled={!reportQuery.data}
          >
            <FileSpreadsheet className="mr-2 size-4" />
            Export Excel
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Compare Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant={compareEnabled ? "default" : "outline"} onClick={() => setCompareEnabled((v) => !v)}>
              {compareEnabled ? "Disable Compare" : "Enable Compare"}
            </Button>
            <Input type="number" min={1} max={12} value={compareMonth} onChange={(event) => setCompareMonth(Number(event.target.value) || 1)} className="w-24" />
            <Input type="number" min={2000} max={2100} value={compareYear} onChange={(event) => setCompareYear(Number(event.target.value) || year)} className="w-28" />
          </div>
          {compareEnabled && reportQuery.data && compareQuery.data ? (
            <ReportCompareTable
              rows={[
                { label: "Net Sales", current: reportQuery.data.netSales, compare: compareQuery.data.netSales },
                {
                  label: "VAT Collected",
                  current: reportQuery.data.totalVATCollected,
                  compare: compareQuery.data.totalVATCollected,
                },
                { label: "Gross Sales", current: reportQuery.data.totalSales, compare: compareQuery.data.totalSales },
              ]}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>
            Period: {year}-{String(month).padStart(2, "0")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading VAT report...
            </div>
          ) : reportQuery.data ? (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-muted-foreground text-sm">{row.label}</span>
                  <span className="font-medium text-sm">{row.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No VAT data available for this period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
