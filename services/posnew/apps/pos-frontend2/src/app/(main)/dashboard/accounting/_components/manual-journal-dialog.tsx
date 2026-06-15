"use client";

import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { posFetchAccounts, posPostManualJournal } from "@/lib/pos-accounting-api";
import { buildManualJournalLines, manualJournalFormSchema } from "@/lib/schemas/accounting/manual-journal";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";

type LineDraft = { key: string; accountId: string; debit: string; credit: string; memo: string };

function newLineKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ln-${Date.now()}-${Math.random()}`;
}

function emptyLine(): LineDraft {
  return { key: newLineKey(), accountId: "", debit: "", credit: "", memo: "" };
}

function isPeriodLockedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("period") && lower.includes("closed");
}

export function ManualJournalDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const queryClient = useQueryClient();
  const [memo, setMemo] = useState("Manual entry");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounting", "accounts"],
    queryFn: () => posFetchAccounts({ active: "true" }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      return;
    }
    setFieldErrors({});
    setMemo("Manual entry");
    setEntryDate(new Date().toISOString().slice(0, 10));
    setLines([emptyLine(), emptyLine()]);
  }, [open]);

  const accountOptions = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  const mut = useMutation({
    mutationFn: () => {
      const parsed = buildManualJournalLines(lines);
      return posPostManualJournal({
        memo: memo.trim() || "Manual entry",
        entryDate,
        lines: parsed.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, memo: l.memo })),
        idempotencyKey: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "journals"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
      toast.success("Journal posted.");
      onOpenChange(false);
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Could not post journal.";
      if (isPeriodLockedMessage(message)) {
        toast.error("Posting blocked: the selected period is closed. Use an open period or reopen the period.");
        return;
      }
      toast.error(message);
    },
  });

  function postJournal() {
    const parsed = manualJournalFormSchema.safeParse({ memo, entryDate, lines });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setFieldErrors({});
    mut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manual journal entry</DialogTitle>
          <DialogDescription>
            Double-entry: total debits must equal total credits. Period close rules apply on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="mj-memo">Memo</Label>
            <Input
              id="mj-memo"
              value={memo}
              onChange={(e) => {
                setMemo(e.target.value);
                setFieldErrors((p) => ({ ...p, memo: "" }));
              }}
              disabled={mut.isPending}
            />
            {fieldErrors.memo ? <p className="text-destructive text-sm">{fieldErrors.memo}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mj-date">Entry date</Label>
            <DatePicker
              id="mj-date"
              value={entryDate}
              onValueChange={(v) => {
                setEntryDate(v);
                setFieldErrors((p) => ({ ...p, entryDate: "" }));
              }}
              disabled={mut.isPending}
              className="w-full"
            />
            {fieldErrors.entryDate ? <p className="text-destructive text-sm">{fieldErrors.entryDate}</p> : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="grid gap-1">
              <Label>Lines</Label>
              {fieldErrors.lines ? <p className="text-destructive text-sm">{fieldErrors.lines}</p> : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mut.isPending}
              onClick={() => {
                setLines((rows) => [...rows, emptyLine()]);
                setFieldErrors((p) => ({ ...p, lines: "" }));
              }}
            >
              <Plus className="mr-1 size-4" /> Add line
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            {lines.map((row, i) => (
              <div key={row.key} className="flex flex-wrap items-end gap-2 border-b pb-2 last:border-0">
                <div className="grid min-w-[200px] flex-[2] gap-1">
                  <span className="text-muted-foreground text-xs">Account</span>
                  <Select
                    value={row.accountId || "__none__"}
                    onValueChange={(v) => {
                      setLines((r) => r.map((x, j) => (j === i ? { ...x, accountId: v === "__none__" ? "" : v } : x)));
                      setFieldErrors((p) => ({ ...p, lines: "" }));
                    }}
                    disabled={mut.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select —</SelectItem>
                      {accountOptions.map((a) => (
                        <SelectItem key={a._id} value={a._id}>
                          {a.code} — {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid w-28 gap-1">
                  <span className="text-muted-foreground text-xs">Debit</span>
                  <Input
                    inputMode="decimal"
                    value={row.debit}
                    onChange={(e) => {
                      setLines((r) => r.map((x, j) => (j === i ? { ...x, debit: e.target.value } : x)));
                      setFieldErrors((p) => ({ ...p, lines: "" }));
                    }}
                    disabled={mut.isPending}
                  />
                </div>
                <div className="grid w-28 gap-1">
                  <span className="text-muted-foreground text-xs">Credit</span>
                  <Input
                    inputMode="decimal"
                    value={row.credit}
                    onChange={(e) => {
                      setLines((r) => r.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)));
                      setFieldErrors((p) => ({ ...p, lines: "" }));
                    }}
                    disabled={mut.isPending}
                  />
                </div>
                <div className="grid min-w-[120px] flex-1 gap-1">
                  <span className="text-muted-foreground text-xs">Line memo</span>
                  <Input
                    value={row.memo}
                    onChange={(e) => setLines((r) => r.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))}
                    disabled={mut.isPending}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Remove line"
                  disabled={mut.isPending || lines.length <= 2}
                  onClick={() => setLines((r) => r.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={postJournal} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Post journal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
