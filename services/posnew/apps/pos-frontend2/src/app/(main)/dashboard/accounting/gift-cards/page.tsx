"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type GiftCardStatus,
  type PosAccount,
  posAccountingIssueGiftCard,
  posAccountingRedeemGiftCard,
  posFetchAccounts,
  posFetchGiftCards,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { giftCardIssueFormSchema, giftCardRedeemFormSchema } from "@/lib/schemas/accounting/gift-card";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const STATUS_BADGES: Record<
  GiftCardStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  redeemed: { label: "Redeemed", variant: "secondary" },
  expired: { label: "Expired", variant: "outline" },
  void: { label: "Void", variant: "destructive" },
};

export default function AccountingGiftCardsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.accounting.write");
  const canReadAr = posCan(permissions, "backoffice.accounting.ar.read");
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<GiftCardStatus | "all">("all");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounting", "accounts"],
    queryFn: () => posFetchAccounts(),
    enabled: canWrite,
  });

  const giftCardsQuery = useQuery({
    queryKey: ["accounting", "gift-cards", statusFilter],
    queryFn: () =>
      posFetchGiftCards({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      }),
    enabled: canReadAr,
  });

  const cashCandidates = useMemo(
    () =>
      accounts.filter(
        (a: PosAccount) => a.type === "bank" || a.type === "asset" || String(a.type).toLowerCase() === "cash",
      ),
    [accounts],
  );

  const [issueAmount, setIssueAmount] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [issueFieldErrors, setIssueFieldErrors] = useState<Record<string, string>>({});
  const [redeemFieldErrors, setRedeemFieldErrors] = useState<Record<string, string>>({});

  const issueMut = useMutation({
    mutationFn: () => {
      const amount = Number.parseFloat(issueAmount);
      return posAccountingIssueGiftCard({ amount, cashAccountId });
    },
    onSuccess: (data) => {
      toast.success("Gift card issued.");
      setIssueFieldErrors({});
      if (data && typeof data === "object" && "code" in data) {
        toast.message(`Code: ${String((data as { code: string }).code)}`);
      }
      setIssueAmount("");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "gift-cards"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Issue failed."),
  });

  const redeemMut = useMutation({
    mutationFn: () => {
      const amount = Number.parseFloat(redeemAmount);
      return posAccountingRedeemGiftCard({ code: redeemCode.trim(), amount });
    },
    onSuccess: () => {
      toast.success("Redemption posted.");
      setRedeemFieldErrors({});
      setRedeemCode("");
      setRedeemAmount("");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "gift-cards"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Redeem failed."),
  });

  function submitIssueGiftCard() {
    const parsed = giftCardIssueFormSchema.safeParse({ issueAmount, cashAccountId });
    if (!parsed.success) {
      setIssueFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setIssueFieldErrors({});
    issueMut.mutate();
  }

  function submitRedeemGiftCard() {
    const parsed = giftCardRedeemFormSchema.safeParse({ redeemCode, redeemAmount });
    if (!parsed.success) {
      setRedeemFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setRedeemFieldErrors({});
    redeemMut.mutate();
  }

  if (!canWrite && !canReadAr) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Gift cards require accounting AR read or write access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/accounts">
            <ArrowLeft className="mr-2 size-4" />
            Chart of accounts
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 font-bold text-3xl tracking-tight">
          <Gift className="size-8" />
          Gift cards
        </h1>
        <p className="text-muted-foreground text-sm">
          Posts GL journals via <code className="text-xs">/api/accounting/gift-cards/issue</code> and{" "}
          <code className="text-xs">/api/accounting/gift-cards/redeem</code>. Use only for trusted finance operators.
        </p>
      </div>

      {canReadAr ? <GiftCardList /> : null}

      {canWrite ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Issue</CardTitle>
              <CardDescription>Creates a gift liability and moves cash from the selected account.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="issue-amt">Amount</Label>
                <Input
                  id="issue-amt"
                  inputMode="decimal"
                  value={issueAmount}
                  onChange={(e) => {
                    setIssueAmount(e.target.value);
                    setIssueFieldErrors((p) => ({ ...p, issueAmount: "" }));
                  }}
                  placeholder="e.g. 50"
                />
                {issueFieldErrors.issueAmount ? (
                  <p className="text-destructive text-sm">{issueFieldErrors.issueAmount}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label>Cash / clearing account</Label>
                <Select
                  value={cashAccountId || "__none__"}
                  onValueChange={(v) => {
                    setCashAccountId(v === "__none__" ? "" : v);
                    setIssueFieldErrors((p) => ({ ...p, cashAccountId: "" }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select —</SelectItem>
                    {(cashCandidates.length ? cashCandidates : accounts).map((a: PosAccount) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {issueFieldErrors.cashAccountId ? (
                  <p className="text-destructive text-sm">{issueFieldErrors.cashAccountId}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <Button type="button" disabled={issueMut.isPending} onClick={submitIssueGiftCard}>
                  {issueMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Issue gift card
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Redeem</CardTitle>
              <CardDescription>Reduces gift liability and posts clearing per server rules.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="redeem-code">Code</Label>
                <Input
                  id="redeem-code"
                  value={redeemCode}
                  onChange={(e) => {
                    setRedeemCode(e.target.value);
                    setRedeemFieldErrors((p) => ({ ...p, redeemCode: "" }));
                  }}
                />
                {redeemFieldErrors.redeemCode ? (
                  <p className="text-destructive text-sm">{redeemFieldErrors.redeemCode}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="redeem-amt">Amount</Label>
                <Input
                  id="redeem-amt"
                  inputMode="decimal"
                  value={redeemAmount}
                  onChange={(e) => {
                    setRedeemAmount(e.target.value);
                    setRedeemFieldErrors((p) => ({ ...p, redeemAmount: "" }));
                  }}
                  placeholder="e.g. 25"
                />
                {redeemFieldErrors.redeemAmount ? (
                  <p className="text-destructive text-sm">{redeemFieldErrors.redeemAmount}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <Button type="button" disabled={redeemMut.isPending} onClick={submitRedeemGiftCard}>
                  {redeemMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Redeem
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );

  function GiftCardList() {
    const items = giftCardsQuery.data?.items ?? [];
    const total = giftCardsQuery.data?.total ?? 0;
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Gift cards</CardTitle>
            <CardDescription>
              {total > 0 ? `${total} card${total === 1 ? "" : "s"} on file.` : "No gift cards issued yet."}
            </CardDescription>
          </div>
          <div className="w-40">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as GiftCardStatus | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="redeemed">Redeemed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {giftCardsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">No gift cards.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Initial</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Last redeem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((gc) => {
                  const badge = STATUS_BADGES[gc.status] ?? STATUS_BADGES.active;
                  return (
                    <TableRow key={gc._id}>
                      <TableCell className="font-mono text-xs">{gc.code}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(gc.balance)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(gc.initialAmount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {gc.createdAt ? new Date(gc.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {gc.lastRedeemedAt ? new Date(gc.lastRedeemedAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }
}
