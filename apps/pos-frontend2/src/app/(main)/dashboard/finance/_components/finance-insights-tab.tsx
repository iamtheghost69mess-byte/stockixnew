"use client";

import type { ReactElement } from "react";

import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import { useFinanceInsightsTabQueries } from "../_hooks/use-finance-insights-tab-queries";

export function FinanceInsightsTab() {
  const { asOf, ytd, fiscalYear, periodMonth, balanceSheetQuery, cashFlowQuery, pnlQuery, budgetQuery, arQuery } =
    useFinanceInsightsTabQueries(new Date());

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Balance sheet</CardTitle>
          <CardDescription>As of {asOf} (UTC).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {balanceSheetQuery.isLoading ? (
            <LoaderRow />
          ) : (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <InsightStat label="Total assets" value={balanceSheetQuery.data?.totalAssets} />
              <InsightStat label="Total liabilities" value={balanceSheetQuery.data?.totalLiabilities} />
              <InsightStat label="Total equity" value={balanceSheetQuery.data?.totalEquity} />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cash flow (mapped accounts)</CardTitle>
          <CardDescription>
            Period {ytd.start} → {ytd.end} (UTC).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {cashFlowQuery.isLoading ? (
            <LoaderRow />
          ) : (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <InsightStat label="Operating" value={cashFlowQuery.data?.categories?.operating} />
              <InsightStat label="Investing" value={cashFlowQuery.data?.categories?.investing} />
              <InsightStat label="Financing" value={cashFlowQuery.data?.categories?.financing} />
              <InsightStat label="Unclassified" value={cashFlowQuery.data?.categories?.none} />
              <InsightStat label="Net change" value={cashFlowQuery.data?.categories?.netChange} />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; loss (YTD)</CardTitle>
          <CardDescription>
            {ytd.start} → {ytd.end} (UTC).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pnlQuery.isLoading ? (
            <LoaderRow />
          ) : (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <InsightStat label="Revenue" value={pnlQuery.data?.revenue} />
              <InsightStat label="Expense" value={pnlQuery.data?.expense} />
              <InsightStat label="COGS (subset)" value={pnlQuery.data?.cogs} />
              <InsightStat label="Net operating" value={pnlQuery.data?.netOperating} />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget vs actual</CardTitle>
          <CardDescription>
            Fiscal year {fiscalYear}, period month {periodMonth}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {budgetQuery.isLoading ? (
            <LoaderRow />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Budgeted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(budgetQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                        No budget rows for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (budgetQuery.data ?? []).map((row) => {
                      const code = row.account?.code ?? "";
                      const name = row.account?.name ?? "";
                      const label = [code, name].filter(Boolean).join(" · ") || row.account?._id;
                      return (
                        <TableRow key={row.account._id}>
                          <TableCell className="max-w-[14rem] truncate text-sm">{label}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.budgeted)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.actual)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.variance)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AR aging</CardTitle>
          <CardDescription>As of {arQuery.data?.asOf ?? asOf}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {arQuery.isLoading ? (
            <LoaderRow />
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <InsightStat label="Current" value={arQuery.data?.buckets?.current} />
                <InsightStat label="1–30 days" value={arQuery.data?.buckets?.days1to30} />
                <InsightStat label="31–60 days" value={arQuery.data?.buckets?.days31to60} />
                <InsightStat label="61–90 days" value={arQuery.data?.buckets?.days61to90} />
                <InsightStat label="90+ days" value={arQuery.data?.buckets?.over90} />
              </dl>
              <Separator />
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Due amount</TableHead>
                      <TableHead className="text-right">Days past due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(arQuery.data?.invoices ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                          No open AR lines in this report.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (arQuery.data?.invoices ?? []).map((inv) => (
                        <TableRow key={inv.invoiceId}>
                          <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                          <TableCell className="max-w-[10rem] truncate text-sm">{inv.customerName ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{inv.dueDate}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(inv.amountDue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{inv.daysPastDue}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoaderRow(): ReactElement {
  return (
    <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
      <Loader2 className="size-4 animate-spin" />
      Loading…
    </div>
  );
}

function InsightStat(props: { readonly label: string; readonly value: number | null | undefined }): ReactElement {
  const v = props.value;
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <dt className="text-muted-foreground text-xs">{props.label}</dt>
      <dd className="font-medium text-sm tabular-nums">{v == null ? "—" : formatCurrency(v)}</dd>
    </div>
  );
}
