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

type Booking = {
  id: string;
  guestId: string;
  roomId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  bookingStatus: string;
  paymentStatus: string;
  totalAmountCents: number;
  platform: string;
  adults: number;
  children: number;
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  checked_in: "secondary",
  checked_out: "outline",
  cancelled: "destructive",
  no_show: "destructive",
};

export default function PmsBookingsPage() {
  const { tenantId } = usePmsTenant();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    propertyId: "", roomId: "", guestId: "",
    checkIn: "", checkOut: "", totalAmountCents: "0", platform: "direct",
  });

  async function load(signal?: AbortSignal) {
    if (!tenantId) return;
    const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    try {
      const res = await pmsFetch(`bookings${qs}`, tenantId, { signal });
      const data = (await res.json()) as { bookings?: Booking[] };
      setBookings(data.bookings ?? []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [tenantId, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(id: string, action: "check-in" | "check-out" | "cancel") {
    if (!tenantId) return;
    setActionId(id);
    await pmsFetch(`bookings/${id}/${action}`, tenantId, { method: "POST", body: "{}" });
    setActionId(null);
    void load(new AbortController().signal);
  }

  async function handleCreate() {
    if (!tenantId) return;
    setSaving(true);
    const amountCents = parseInt(form.totalAmountCents, 10);
    if (Number.isNaN(amountCents) || amountCents < 0) {
      setSaving(false);
      return;
    }
    await pmsFetch("bookings", tenantId, {
      method: "POST",
      body: JSON.stringify({ ...form, totalAmountCents: amountCents }),
    });
    setSaving(false);
    setOpen(false);
    void load(new AbortController().signal);
  }

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  if (!tenantId) {
    return (
      <PmsPageShell title="Bookings">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Bookings" description="All bookings — check in, check out, cancel.">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="checked_in">Checked in</SelectItem>
            <SelectItem value="checked_out">Checked out</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" /> New booking
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Guests</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No bookings.
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="tabular-nums">{b.checkIn}</TableCell>
                  <TableCell className="tabular-nums">{b.checkOut}</TableCell>
                  <TableCell className="capitalize">{b.platform}</TableCell>
                  <TableCell>{b.adults + b.children}</TableCell>
                  <TableCell className="tabular-nums">{fmt(b.totalAmountCents)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[b.bookingStatus] ?? "outline"} className="capitalize">
                      {b.bookingStatus.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={b.paymentStatus === "paid" ? "default" : "secondary"} className="capitalize">
                      {b.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {b.bookingStatus === "confirmed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionId === b.id}
                          onClick={() => void handleAction(b.id, "check-in")}
                        >
                          Check in
                        </Button>
                      )}
                      {b.bookingStatus === "checked_in" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionId === b.id}
                          onClick={() => void handleAction(b.id, "check-out")}
                        >
                          Check out
                        </Button>
                      )}
                      {(b.bookingStatus === "confirmed" || b.bookingStatus === "checked_in") && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actionId === b.id}
                          onClick={() => void handleAction(b.id, "cancel")}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New booking</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["propertyId", "Property UUID"],
              ["roomId", "Room UUID"],
              ["guestId", "Guest UUID"],
              ["checkIn", "Check-in (YYYY-MM-DD)"],
              ["checkOut", "Check-out (YYYY-MM-DD)"],
              ["totalAmountCents", "Amount (cents)"],
            ] as [keyof typeof form, string][]).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
