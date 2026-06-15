"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { posListExpenseReports } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function ExpenseReportsListPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.expenses.read");
  const canWrite = posCan(permissions, "backoffice.accounting.expenses.write");

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "expense-reports"],
    queryFn: posListExpenseReports,
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need expense report read permission.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting">
              <ArrowLeft className="mr-2 size-4" />
              Accounting
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">Expense reports</h1>
          <p className="text-muted-foreground text-sm">
            Draft → submit → approve → post to GL (debit expense accounts, credit default cash).
          </p>
        </div>
        {canWrite ? (
          <Button asChild>
            <Link href="/dashboard/accounting/expense-reports/new">
              <Plus className="mr-2 size-4" />
              New report
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent</CardTitle>
          <CardDescription>Up to 200 reports for this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[6rem]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No expense reports yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="font-mono text-sm">{r.expenseNumber}</TableCell>
                        <TableCell className="capitalize">{r.status}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatCurrency(r.total)}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/accounting/expense-reports/${r._id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
