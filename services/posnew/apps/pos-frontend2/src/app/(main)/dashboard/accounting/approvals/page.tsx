"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  posApproveApprovalRequest,
  posCreateApprovalRequest,
  posListApprovalRequests,
  posRejectApprovalRequest,
  type ApprovalRequestDoc,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const APPROVAL_TARGET_LABELS: Record<string, string> = {
  vendor_bill: "Vendor bill",
  expense_report: "Expense report",
  vendor_return: "Vendor return",
  manual_journal: "Manual journal",
};

function formatApprovalTargetType(targetType: string): string {
  return APPROVAL_TARGET_LABELS[targetType] ?? targetType.replace(/_/g, " ");
}

function formatRequestedAt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

async function copyDocumentReference(targetId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(targetId);
    toast.success("Document reference copied.");
  } catch {
    toast.error("Could not copy to clipboard.");
  }
}

export default function ApprovalsInboxPage() {
  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.approvals.read");
  const canWrite = posCan(permissions, "backoffice.accounting.approvals.write");

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["accounting", "approval-requests", "pending"],
    queryFn: () => posListApprovalRequests({ status: "pending" }),
    enabled: canRead,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["accounting", "approval-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["accounting", "expense-reports"] });
    void queryClient.invalidateQueries({ queryKey: ["accounting", "expense-report"] });
  };

  const approveMut = useMutation({
    mutationFn: (approvalId: string) => posApproveApprovalRequest(approvalId),
    onSuccess: () => {
      toast.success("Approved.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rejectMut = useMutation({
    mutationFn: ({ approvalId, reason }: { approvalId: string; reason: string }) =>
      posRejectApprovalRequest(approvalId, reason),
    onSuccess: () => {
      toast.success("Rejected.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [newTargetType, setNewTargetType] = useState("vendor_bill");
  const [newTargetId, setNewTargetId] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      posCreateApprovalRequest({
        targetType: newTargetType,
        targetId: newTargetId.trim(),
      }),
    onSuccess: () => {
      toast.success("Approval request created.");
      setNewTargetId("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need approvals read permission.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting">
            <ArrowLeft className="mr-2 size-4" />
            Accounting
          </Link>
        </Button>
        <h1 className="font-bold text-3xl tracking-tight">Approvals inbox</h1>
        <p className="text-muted-foreground text-sm">
          Pending vendor bills, expense reports, and other documents. Approving or rejecting an expense report updates
          its workflow status; actions are audited on the server.
        </p>
      </div>

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New request</CardTitle>
            <CardDescription>
              For draft vendor bills or submitted expense reports that need a separate approval record before posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-[12rem] gap-2">
                <Label htmlFor="approval-target-type">Document type</Label>
                <Select value={newTargetType} onValueChange={setNewTargetType}>
                  <SelectTrigger id="approval-target-type" className="w-[min(100%,14rem)]">
                    <SelectValue placeholder="Choose type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendor_bill">Vendor bill</SelectItem>
                    <SelectItem value="expense_report">Expense report</SelectItem>
                    <SelectItem value="vendor_return">Vendor return</SelectItem>
                    <SelectItem value="manual_journal">Manual journal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-[14rem] flex-1 gap-2">
                <Label htmlFor="approval-target-id">Document ID</Label>
                <Input
                  id="approval-target-id"
                  value={newTargetId}
                  onChange={(e) => setNewTargetId(e.target.value)}
                  placeholder="From the document URL or detail screen"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                disabled={createMut.isPending || !newTargetId.trim()}
                onClick={() => createMut.mutate()}
              >
                Create pending
              </Button>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Paste the same identifier you use elsewhere in back office (for example from the browser address bar when
              viewing the document). It is not shown to customers.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending</CardTitle>
          <CardDescription>Review each line and approve or reject as appropriate.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[11rem]">Type</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="w-[9rem] whitespace-nowrap">Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No pending approvals.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((row) => (
                    <ApprovalRow
                      key={row._id}
                      row={row}
                      canWrite={canWrite}
                      onApprove={() => approveMut.mutate(row._id)}
                      onReject={(reason) => rejectMut.mutate({ approvalId: row._id, reason })}
                      busy={approveMut.isPending || rejectMut.isPending}
                    />
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

function ApprovalRow({
  row,
  canWrite,
  onApprove,
  onReject,
  busy,
}: Readonly<{
  row: ApprovalRequestDoc;
  canWrite: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  busy: boolean;
}>) {
  const [reason, setReason] = useState("");
  const summary = row.targetSummary ?? formatApprovalTargetType(row.targetType);
  const path = row.targetDetailPath;

  return (
    <TableRow>
      <TableCell className="align-top text-sm">{formatApprovalTargetType(row.targetType)}</TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1">
          {path ? (
            <Link
              href={path}
              className="inline-flex items-center gap-1 font-medium text-primary text-sm underline-offset-4 hover:underline"
            >
              <span className="line-clamp-2">{summary}</span>
              <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
            </Link>
          ) : (
            <span className="text-muted-foreground text-sm">{summary}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap align-top text-muted-foreground text-xs">
        {formatRequestedAt(row.createdAt)}
      </TableCell>
      <TableCell className="text-right align-top">
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {canWrite ? (
            <>
              <Input
                className="h-8 min-w-0 sm:w-36"
                placeholder="Reject reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-8 shrink-0"
                  title="Copy document reference"
                  onClick={() => void copyDocumentReference(row.targetId)}
                >
                  <Copy className="size-4" />
                  <span className="sr-only">Copy document reference</span>
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onApprove}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onReject(reason)}>
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-8 shrink-0"
                title="Copy document reference"
                onClick={() => void copyDocumentReference(row.targetId)}
              >
                <Copy className="size-4" />
                <span className="sr-only">Copy document reference</span>
              </Button>
              <span className="text-muted-foreground text-xs">Read only</span>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
