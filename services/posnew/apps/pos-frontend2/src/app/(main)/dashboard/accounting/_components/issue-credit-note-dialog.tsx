"use client";

import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { posFetchInvoices, posIssueCreditNote } from "@/lib/pos-accounting-api";
import { issueCreditNoteFormSchema } from "@/lib/schemas/accounting/issue-credit-note";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { formatCurrency } from "@/lib/utils";

export function IssueCreditNoteDialog({
  open,
  onOpenChange,
  initialInvoiceId,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialInvoiceId?: string | null;
}>) {
  const qc = useQueryClient();
  const [invoiceId, setInvoiceId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: invoices = [] } = useQuery({
    queryKey: ["accounting", "invoices", "for-credit-note"],
    queryFn: () => posFetchInvoices({ limit: 200 }),
    enabled: open,
  });

  const creditable = invoices.filter((i) => i.status !== "void");

  useEffect(() => {
    if (open && initialInvoiceId) setInvoiceId(initialInvoiceId);
  }, [open, initialInvoiceId]);

  const mut = useMutation({
    mutationFn: async () => {
      const inv = invoiceId.trim() || initialInvoiceId?.trim() || "";
      const amount = amountStr.trim() ? Number.parseFloat(amountStr) : undefined;
      return posIssueCreditNote({
        invoiceId: inv,
        ...(amount != null && Number.isFinite(amount) ? { amount } : {}),
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (cn) => {
      toast.success(`Credit note ${cn.creditNoteNumber} issued.`);
      void qc.invalidateQueries({ queryKey: ["accounting", "credit-notes"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "invoices"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "ar-aging"] });
      void qc.invalidateQueries({ queryKey: ["accounting", "journals"] });
      onOpenChange(false);
      setAmountStr("");
      setReason("");
      setNotes("");
      setInvoiceId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Credit note failed."),
  });

  function submitCreditNote() {
    const effectiveInvoiceId = invoiceId.trim() || initialInvoiceId?.trim() || "";
    const parsed = issueCreditNoteFormSchema.safeParse({
      invoiceId: effectiveInvoiceId,
      amountStr,
      reason,
      notes,
    });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setFieldErrors({});
    mut.mutate();
  }

  const selected = creditable.find((i) => i._id === (invoiceId || initialInvoiceId));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setFieldErrors({});
        if (v && initialInvoiceId) setInvoiceId(initialInvoiceId);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue credit note</DialogTitle>
          <DialogDescription>
            Reverses revenue against AR for the selected invoice. Leave amount empty to use the backend default for that
            invoice.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Invoice</Label>
            <Select
              value={invoiceId || initialInvoiceId || "__pick__"}
              onValueChange={(v) => {
                setInvoiceId(v === "__pick__" ? "" : v);
                setFieldErrors((p) => ({ ...p, invoiceId: "" }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Invoice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__pick__">—</SelectItem>
                {creditable.map((inv) => (
                  <SelectItem key={inv._id} value={inv._id}>
                    {inv.invoiceNumber} · {formatCurrency(inv.total - (inv.amountPaid ?? 0))} due
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.invoiceId ? <p className="text-destructive text-sm">{fieldErrors.invoiceId}</p> : null}
          </div>
          {selected ? (
            <p className="text-muted-foreground text-xs">
              Invoice total {formatCurrency(selected.total)}, paid {formatCurrency(selected.amountPaid ?? 0)}.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="cn-amt">Amount (optional)</Label>
            <Input
              id="cn-amt"
              type="number"
              step="0.01"
              min={0}
              placeholder="Default from invoice"
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setFieldErrors((p) => ({ ...p, amountStr: "" }));
              }}
            />
            {fieldErrors.amountStr ? <p className="text-destructive text-sm">{fieldErrors.amountStr}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cn-reason">Reason</Label>
            <Input
              id="cn-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Return"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cn-notes">Notes</Label>
            <Textarea id="cn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={mut.isPending} onClick={submitCreditNote}>
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Issue credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
