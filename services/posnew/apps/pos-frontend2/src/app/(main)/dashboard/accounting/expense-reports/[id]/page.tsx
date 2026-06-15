"use client";

import { useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  posApproveExpenseReportDirect,
  posFetchAccountingConfig,
  posGetExpenseReport,
  posPostExpenseReportGl,
  posRejectExpenseReportDirect,
  posSubmitExpenseReport,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function ExpenseReportDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.expenses.read");
  const canWrite = posCan(permissions, "backoffice.accounting.expenses.write");
  const canApprove = posCan(permissions, "backoffice.accounting.expenses.approve");
  const canGlWrite = posCan(permissions, "backoffice.accounting.gl.write");

  const [rejectReason, setRejectReason] = useState("");

  const { data: cfg } = useQuery({
    queryKey: ["accounting", "config"],
    queryFn: posFetchAccountingConfig,
    enabled: canRead,
  });

  const { data: report, isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "expense-report", id],
    queryFn: () => posGetExpenseReport(id),
    enabled: canRead && Boolean(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["accounting", "expense-report", id] });
    void queryClient.invalidateQueries({ queryKey: ["accounting", "expense-reports"] });
  };

  const submitMut = useMutation({
    mutationFn: () => posSubmitExpenseReport(id),
    onSuccess: () => {
      toast.success("Submitted.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Submit failed"),
  });

  const approveMut = useMutation({
    mutationFn: () => posApproveExpenseReportDirect(id),
    onSuccess: () => {
      toast.success("Approved.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approve failed"),
  });

  const rejectMut = useMutation({
    mutationFn: () => posRejectExpenseReportDirect(id, rejectReason),
    onSuccess: () => {
      toast.success("Rejected.");
      setRejectReason("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reject failed"),
  });

  const postMut = useMutation({
    mutationFn: () => posPostExpenseReportGl(id),
    onSuccess: () => {
      toast.success("Posted to GL.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Post failed"),
  });

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need expense read permission.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting/expense-reports">Back</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }
  if (isError || !report) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Not found."}</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting/expense-reports">Back</Link>
        </Button>
      </div>
    );
  }

  const formalExpenseApprovals = !!cfg?.requireApprovalsForExpensePosting;
  const showDirectApprove =
    canApprove && report.status === "submitted" && !formalExpenseApprovals;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href="/dashboard/accounting/expense-reports">
          <ArrowLeft className="mr-2 size-4" />
          Expense reports
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">{report.expenseNumber}</h1>
          <p className="text-muted-foreground text-sm capitalize">Status: {report.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && report.status === "draft" ? (
            <Button type="button" disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
              Submit
            </Button>
          ) : null}
          {showDirectApprove ? (
            <>
              <Button type="button" variant="secondary" disabled={approveMut.isPending} onClick={() => approveMut.mutate()}>
                Approve
              </Button>
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="rej" className="text-xs">
                    Reject reason
                  </Label>
                  <Input id="rej" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="h-9 w-48" />
                </div>
                <Button type="button" variant="destructive" disabled={rejectMut.isPending} onClick={() => rejectMut.mutate()}>
                  Reject
                </Button>
              </div>
            </>
          ) : null}
          {canGlWrite && report.status === "approved" ? (
            <Button type="button" disabled={postMut.isPending} onClick={() => postMut.mutate()}>
              Post to GL
            </Button>
          ) : null}
        </div>
      </div>

      {formalExpenseApprovals && report.status === "submitted" ? (
        <p className="text-muted-foreground text-sm">
          Formal expense approvals are on. Use the{" "}
          <Link href="/dashboard/accounting/approvals" className="text-primary underline">
            approvals inbox
          </Link>{" "}
          to approve this report after submit.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lines</CardTitle>
          <CardDescription>Total {formatCurrency(report.total)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.lines || []).map((ln, i) => (
                <TableRow key={ln._id ?? i}>
                  <TableCell>{ln.description}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(ln.amount)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {typeof ln.glAccount === "object" && ln.glAccount != null && "code" in ln.glAccount
                      ? `${ln.glAccount.code} — ${ln.glAccount.name}`
                      : String(ln.glAccount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
