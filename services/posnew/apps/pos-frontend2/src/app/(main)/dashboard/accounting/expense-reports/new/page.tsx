"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { posCreateExpenseReport, posFetchAccounts } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

type LineRow = { description: string; amount: string; glAccount: string; attachmentUrl: string };

export default function NewExpenseReportPage() {
  const router = useRouter();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.accounting.expenses.write");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounting", "accounts", "expense-picker"],
    queryFn: () => posFetchAccounts({ type: "expense", active: "true" }),
    enabled: canWrite,
  });

  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([
    { description: "", amount: "", glAccount: "", attachmentUrl: "" },
  ]);

  const createMut = useMutation({
    mutationFn: () =>
      posCreateExpenseReport({
        notes,
        lines: lines
          .filter((l) => l.description.trim() && l.glAccount && Number(l.amount) > 0)
          .map((l) => ({
            description: l.description.trim(),
            amount: Number(l.amount),
            glAccount: l.glAccount,
            attachmentUrl: l.attachmentUrl.trim() || undefined,
          })),
      }),
    onSuccess: (doc) => {
      toast.success("Expense report created.");
      void router.push(`/dashboard/accounting/expense-reports/${doc._id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  if (!canWrite) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need expense write permission.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting/expense-reports">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href="/dashboard/accounting/expense-reports">
          <ArrowLeft className="mr-2 size-4" />
          Expense reports
        </Link>
      </Button>
      <h1 className="font-bold text-3xl tracking-tight">New expense report</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lines</CardTitle>
          <CardDescription>
            Use expense-type GL accounts. Optional HTTPS attachment URL per line (max 2048 chars); scan uploads
            before production use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
            >
              <div className="grid gap-2 sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={line.description}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...line, description: e.target.value };
                    setLines(next);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.amount}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...line, amount: e.target.value };
                    setLines(next);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label>GL account</Label>
                <Select
                  value={line.glAccount || "__none__"}
                  onValueChange={(v) => {
                    const next = [...lines];
                    next[idx] = { ...line, glAccount: v === "__none__" ? "" : v };
                    setLines(next);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select —</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Attachment URL (optional)</Label>
                <Input
                  placeholder="https://…"
                  value={line.attachmentUrl}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...line, attachmentUrl: e.target.value };
                    setLines(next);
                  }}
                />
              </div>
              <div className="flex sm:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={lines.length <= 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="mr-1 size-4" />
                  Remove line
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines([...lines, { description: "", amount: "", glAccount: "", attachmentUrl: "" }])
            }
          >
            <Plus className="mr-2 size-4" />
            Add line
          </Button>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <Button
            type="button"
            disabled={createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create draft"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
