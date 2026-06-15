"use client";

import { useEffect, useState } from "react";

import { PlusIcon } from "lucide-react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

type Payment = {
  id: string;
  bookingId: string;
  amountCents: number;
  method: string;
  status: string;
  transactionId: string | null;
  createdAt: string;
};

export default function PmsPaymentsPage() {
  const { tenantId } = usePmsTenant();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bookingId: "", amountCents: "0", method: "cash", transactionId: "",
  });

  async function load() {
    if (!tenantId) return;
    const res = await pmsFetch("payments", tenantId);
    const data = (await res.json()) as { payments?: Payment[] };
    setPayments(data.payments ?? []);
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function handleCreate() {
    if (!tenantId || !form.bookingId) return;
    setSaving(true);
    await pmsFetch("payments", tenantId, {
      method: "POST",
      body: JSON.stringify({ ...form, amountCents: parseInt(form.amountCents, 10) }),
    });
    setSaving(false);
    setOpen(false);
    void load();
  }

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  if (!tenantId) {
    return (
      <PmsPageShell title="Payments">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Payments" description="Payment records for all bookings.">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" /> Record payment
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Booking ID</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transaction ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No payments recorded.
                </TableCell>
              </TableRow>
            ) : (
              payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.bookingId.slice(0, 8)}…</TableCell>
                  <TableCell className="capitalize">{p.method.replace("_", " ")}</TableCell>
                  <TableCell className="tabular-nums font-medium">{fmt(p.amountCents)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={p.status === "completed" ? "default" : p.status === "refunded" ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.transactionId ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Booking UUID</Label>
              <Input value={form.bookingId} onChange={(e) => setForm((f) => ({ ...f, bookingId: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (cents)</Label>
                <Input type="number" min={0} value={form.amountCents} onChange={(e) => setForm((f) => ({ ...f, amountCents: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v ?? "cash" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["cash", "card", "bank_transfer", "online", "other"].map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Transaction ID (optional)</Label>
              <Input value={form.transactionId} onChange={(e) => setForm((f) => ({ ...f, transactionId: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !form.bookingId}>
              {saving ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
