"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Coins,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

import { ReportCompareControls } from "@/components/reports/report-compare-controls";
import { ReportCompareTable } from "@/components/reports/report-compare-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { posFetchLoyaltyConfig, posUpdateLoyaltyConfig } from "@/lib/pos-config-api";
import { fetchDiscountAuditPage } from "@/lib/pos-reports-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";
import { formatCurrency } from "@/lib/utils";

type Section = "loyalty" | "audit";

function LoyaltySection() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    pointsPerRupee: 1,
    pointsPerRupeeOff: 10,
    minRedeemPoints: 100,
  });

  const { data: loyaltyRes, isLoading } = useQuery({
    queryKey: ["loyalty-config"],
    queryFn: posFetchLoyaltyConfig,
  });

  useEffect(() => {
    if (loyaltyRes?.data) {
      setFormData({
        pointsPerRupee: loyaltyRes.data.pointsPerRupee,
        pointsPerRupeeOff: loyaltyRes.data.pointsPerRupeeOff,
        minRedeemPoints: loyaltyRes.data.minRedeemPoints,
      });
    }
  }, [loyaltyRes]);

  const updateMutation = useMutation({
    mutationFn: posUpdateLoyaltyConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-config"] });
      toast.success("Loyalty program updated.");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to update loyalty."),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Alert className="border-primary/20 bg-primary/5">
        <Coins className="h-4 w-4 text-primary" />
        <AlertTitle>Customer Engagement</AlertTitle>
        <AlertDescription>
          Loyalty points encourage repeat visits. Points are automatically calculated during checkout based on the rules
          below.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Earning Rules</CardTitle>
          <CardDescription>
            Define how many points customers receive for every unit of currency spent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Points Accrual</Label>
              <p className="text-muted-foreground text-xs">Customers receive points automatically upon payment.</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="space-y-2">
            <Label htmlFor="earn-rate">Points Earned per 1.00 Currency</Label>
            <Input
              id="earn-rate"
              type="number"
              value={formData.pointsPerRupee}
              onChange={(e) => setFormData((p) => ({ ...p, pointsPerRupee: parseFloat(e.target.value) || 0 }))}
            />
            <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
              Example: 100.00 spent = {100 * formData.pointsPerRupee} points
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redemption Rules</CardTitle>
          <CardDescription>Configure the value of points when used as a discount.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="redeem-rate">Points required for 1.00 Discount</Label>
              <Input
                id="redeem-rate"
                type="number"
                value={formData.pointsPerRupeeOff}
                onChange={(e) => setFormData((p) => ({ ...p, pointsPerRupeeOff: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-pts">Minimum Points to Redeem</Label>
              <Input
                id="min-pts"
                type="number"
                value={formData.minRedeemPoints}
                onChange={(e) => setFormData((p) => ({ ...p, minRedeemPoints: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-4">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-5 w-5 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-400">Current Exchange Rate</p>
                <p className="text-amber-700/80 dark:text-amber-400/80">
                  {formData.pointsPerRupeeOff} points = 1.00 currency. The effective cashback rate is{" "}
                  {((formData.pointsPerRupee / formData.pointsPerRupeeOff) * 100 || 0).toFixed(1)}%.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-between bg-muted/50 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFormData({ pointsPerRupee: 1, pointsPerRupeeOff: 10, minRedeemPoints: 100 })}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to defaults
          </Button>
          <Button size="sm" onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Configuration
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

const AUDIT_PAGE = 1;
const AUDIT_LIMIT = 50;

function DiscountAuditSection() {
  const defaultTo = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const defaultFrom = useMemo(() => format(subDays(new Date(), 30), "yyyy-MM-dd"), []);
  const [draftFrom, setDraftFrom] = useState(defaultFrom);
  const [draftTo, setDraftTo] = useState(defaultTo);
  const [appliedFrom, setAppliedFrom] = useState(defaultFrom);
  const [appliedTo, setAppliedTo] = useState(defaultTo);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reports", "discount-audit", AUDIT_PAGE, appliedFrom, appliedTo],
    queryFn: () =>
      fetchDiscountAuditPage({
        page: AUDIT_PAGE,
        limit: AUDIT_LIMIT,
        from: appliedFrom,
        to: appliedTo,
      }),
  });

  const [auditCompareEnabled, setAuditCompareEnabled] = useState(false);
  const [auditCompareFrom, setAuditCompareFrom] = useState(() => format(subDays(new Date(), 60), "yyyy-MM-dd"));
  const [auditCompareTo, setAuditCompareTo] = useState(() => format(subDays(new Date(), 31), "yyyy-MM-dd"));

  const compareAuditQuery = useQuery({
    queryKey: ["reports", "discount-audit", "compare", AUDIT_PAGE, auditCompareFrom, auditCompareTo],
    queryFn: () =>
      fetchDiscountAuditPage({
        page: AUDIT_PAGE,
        limit: AUDIT_LIMIT,
        from: auditCompareFrom,
        to: auditCompareTo,
      }),
    enabled: auditCompareEnabled,
  });

  const auditCompareSummaryRows = useMemo(() => {
    if (!data?.summary || !compareAuditQuery.data?.summary) return [];
    const cur = data.summary;
    const cmp = compareAuditQuery.data.summary;
    return [
      { label: "Total discounts ($)", current: cur.totalDiscountAmount, compare: cmp.totalDiscountAmount },
      { label: "Entries matched", current: cur.totalEntries, compare: cmp.totalEntries },
    ];
  }, [data?.summary, compareAuditQuery.data?.summary]);

  const dateRange = useMemo(() => `${appliedFrom} → ${appliedTo}`, [appliedFrom, appliedTo]);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    return list.map((r) => ({
      when: r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") : "",
      table: String(r.tableNo ?? ""),
      staff:
        r.discountedBy?.trim() ||
        (typeof r.appliedBy === "object" && r.appliedBy ? (r.appliedBy.name ?? "") : ""),
      type: (r.discountType ?? "").trim() || "—",
      scope: (r.discountScope ?? "").trim() || "—",
      item: (r.orderItemName ?? "").trim().slice(0, 80) || "—",
      amount: r.discountAmount ?? 0,
      before: r.totalBefore ?? 0,
      after: r.totalAfter ?? 0,
      reason: (r.reason ?? "").slice(0, 120),
    }));
  }, [data?.rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid flex-1 gap-2 sm:max-w-[11rem]">
          <Label htmlFor="disc-audit-from">From</Label>
          <Input id="disc-audit-from" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
        </div>
        <div className="grid flex-1 gap-2 sm:max-w-[11rem]">
          <Label htmlFor="disc-audit-to">To</Label>
          <Input id="disc-audit-to" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setAppliedFrom(draftFrom);
            setAppliedTo(draftTo);
          }}
        >
          Apply range
        </Button>
      </div>
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Compare summary to another range</CardTitle>
          <CardDescription>Uses the same page size for both periods; compares headline totals only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ReportCompareControls
            enabled={auditCompareEnabled}
            onEnabledChange={setAuditCompareEnabled}
            currentFrom={appliedFrom}
            currentTo={appliedTo}
            compareFrom={auditCompareFrom}
            compareTo={auditCompareTo}
            onCurrentFromChange={(v) => {
              setDraftFrom(v);
              setAppliedFrom(v);
            }}
            onCurrentToChange={(v) => {
              setDraftTo(v);
              setAppliedTo(v);
            }}
            onCompareFromChange={setAuditCompareFrom}
            onCompareToChange={setAuditCompareTo}
          />
          {auditCompareEnabled && compareAuditQuery.isFetching ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading comparison…
            </div>
          ) : null}
          {auditCompareEnabled && compareAuditQuery.data && auditCompareSummaryRows.length > 0 ? (
            <ReportCompareTable rows={auditCompareSummaryRows} />
          ) : null}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Total discounts (scoped):{" "}
          <span className="font-medium text-foreground">{formatCurrency(data?.summary.totalDiscountAmount ?? 0)}</span>{" "}
          across <span className="font-medium text-foreground">{data?.summary.totalEntries ?? 0}</span> matching rows
          (page size {AUDIT_LIMIT}).
          {data?.summary.revenueImpactPercent != null ? (
            <>
              {" "}
              · Paid revenue in range:{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(Number(data.summary.paidRevenueInPeriod ?? 0))}
              </span>
              {" · "}
              <span className="font-medium text-foreground">{data.summary.revenueImpactPercent.toFixed(2)}%</span> of
              paid revenue
            </>
          ) : null}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              exportReportPdf({
                fileName: "discount-audit.pdf",
                title: "Manual discount audit",
                branchName: "Current scope",
                dateRange,
                columns: [
                  { key: "when", label: "When" },
                  { key: "table", label: "Table" },
                  { key: "staff", label: "Staff" },
                  { key: "type", label: "Type" },
                  { key: "scope", label: "Scope" },
                  { key: "item", label: "Item" },
                  { key: "amount", label: "Discount" },
                  { key: "before", label: "Before" },
                  { key: "after", label: "After" },
                  { key: "reason", label: "Reason" },
                ],
                rows,
              })
            }
          >
            <Download className="mr-2 size-4" />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              exportReportExcel({
                fileName: "discount-audit.xlsx",
                branchName: "Current scope",
                dateRange,
                columns: [
                  { key: "when", label: "When" },
                  { key: "table", label: "Table" },
                  { key: "staff", label: "Staff" },
                  { key: "type", label: "Type" },
                  { key: "scope", label: "Scope" },
                  { key: "item", label: "Item" },
                  { key: "amount", label: "Discount" },
                  { key: "before", label: "Before" },
                  { key: "after", label: "After" },
                  { key: "reason", label: "Reason" },
                ],
                rows,
                totals: ["Total (all matching)", data?.summary.totalDiscountAmount ?? 0],
              })
            }
          >
            <FileSpreadsheet className="mr-2 size-4" />
            Excel
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load audit."}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-16 text-center text-muted-foreground">
                    No discount audit rows yet.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.rows ?? []).map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") : "—"}
                    </TableCell>
                    <TableCell>{r.tableNo ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {r.discountedBy?.trim() ||
                        (typeof r.appliedBy === "object" && r.appliedBy ? r.appliedBy.name : "—")}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{r.discountType || "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{r.discountScope || "—"}</TableCell>
                    <TableCell className="max-w-[10rem] truncate text-xs">{r.orderItemName || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(r.discountAmount ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(r.totalBefore ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(r.totalAfter ?? 0))}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs">{r.reason || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function DiscountsPage() {
  const [section, setSection] = useState<Section>("loyalty");

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Discounts & loyalty</h1>
          <p className="text-muted-foreground">Loyalty configuration and manual discount audit trail.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={section === "loyalty" ? "default" : "outline"} size="sm" onClick={() => setSection("loyalty")}>
            Loyalty
          </Button>
          <Button variant={section === "audit" ? "default" : "outline"} size="sm" onClick={() => setSection("audit")}>
            Discount audit
          </Button>
          {section === "loyalty" ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/customers">
                Customers <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {section === "loyalty" ? <LoyaltySection /> : <DiscountAuditSection />}
    </div>
  );
}
