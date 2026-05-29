"use client";

import { useEffect, useMemo, useState } from "react";

import { Banknote, CreditCard, Loader2 } from "lucide-react";

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
import { cn, formatCurrency } from "@/lib/utils";

export type PosPaymentConfirmPayload = {
  method: "cash" | "card" | "manual";
  amountReceived?: number;
  reference?: string;
  note?: string;
  paymentData?: { amountReceived?: number; reference?: string; note?: string };
  /** Multi-tender on one check (cash + card). */
  paymentSplits?: { methodKey: string; amount: number }[];
  /** Create `SplitBill` rows and pay each split before closing the order. */
  entitySplitBill?: boolean;
  splitBillRows?: { methodKey: string; amount: number }[];
};

type PosPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  subtotals: { usd: number; lbp: number };
  busy: boolean;
  onConfirm: (payload: PosPaymentConfirmPayload) => Promise<void>;
  startWithSplit?: boolean;
};

export function PosPaymentDialog({
  open,
  onOpenChange,
  orderId,
  subtotals,
  busy,
  onConfirm,
  startWithSplit = false,
}: PosPaymentDialogProps) {
  const [method, setMethod] = useState<"cash" | "card" | "manual">("cash");
  const [amountReceivedUsd, setAmountReceivedUsd] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState<{ methodKey: string; amount: string }[]>([
    { methodKey: "cash", amount: "" },
    { methodKey: "card", amount: "" },
  ]);

  const changeUsd = useMemo(() => {
    const received = Number(amountReceivedUsd) || 0;
    if (received <= 0) return 0;
    return Math.max(0, received - subtotals.usd);
  }, [amountReceivedUsd, subtotals.usd]);
  const splitTotalUsd = useMemo(() => {
    return splitRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }, [splitRows]);
  const splitRemainderUsd = useMemo(() => {
    return Number((subtotals.usd - splitTotalUsd).toFixed(2));
  }, [splitTotalUsd, subtotals.usd]);

  useEffect(() => {
    if (!open) {
      setMethod("cash");
      setAmountReceivedUsd("");
      setReference("");
      setNote("");
      setSplitEnabled(false);
      setSplitRows([
        { methodKey: "cash", amount: "" },
        { methodKey: "card", amount: "" },
      ]);
    } else {
      setAmountReceivedUsd(subtotals.usd.toFixed(2));
      setSplitEnabled(startWithSplit);
      setSplitRows([
        { methodKey: "cash", amount: subtotals.usd.toFixed(2) },
        { methodKey: "card", amount: "" },
      ]);
    }
  }, [open, startWithSplit, subtotals.usd]);

  async function handleSubmit() {
    const payload: PosPaymentConfirmPayload = {
      method,
      note: note.trim() || undefined,
    };

    if (method === "cash") {
      payload.amountReceived = Number(amountReceivedUsd) || subtotals.usd;
    } else if (method === "card") {
      payload.reference = reference.trim();
    }
    payload.paymentData = {
      amountReceived: payload.amountReceived,
      reference: payload.reference,
      note: payload.note,
    };
    if (splitEnabled) {
      const rows = splitRows
        .map((row) => ({
          methodKey: row.methodKey.trim().toLowerCase(),
          amount: Number(row.amount || 0),
        }))
        .filter((row) => row.methodKey.length > 0 && row.amount > 0);
      payload.entitySplitBill = true;
      payload.splitBillRows = rows;
    }

    await onConfirm(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-50">Checkout / Payment</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Select tender type and confirm the received amount to close this check.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Subtotal Display */}
          <div className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="mb-2 font-black text-[10px] text-zinc-500 uppercase tracking-[0.3em]">Total Due</div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="font-black text-5xl text-white tabular-nums tracking-tighter">
                {formatCurrency(subtotals.usd, { currency: "USD" }).split(".")[0]}
                <span className="text-xl opacity-40">.{formatCurrency(subtotals.usd, { currency: "USD" }).split(".")[1]}</span>
              </div>
              {subtotals.lbp > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-full border border-zinc-700/30 bg-zinc-800/50 px-3 py-1">
                  <div className="size-1 rounded-full bg-zinc-500" />
                  <span className="font-black text-[10px] text-zinc-400 uppercase tabular-nums leading-none tracking-widest">
                    {formatCurrency(subtotals.lbp, { currency: "LBP", noDecimals: true })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Method Selection */}
          <div className="grid grid-cols-3 gap-3">
            {(["cash", "card", "manual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  "flex h-24 flex-col items-center justify-center gap-3 rounded-3xl border transition-all duration-300 active:scale-95",
                  method === m
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100 shadow-emerald-950/20 shadow-lg ring-1 ring-emerald-500/20"
                    : "border-zinc-800 bg-zinc-900/20 text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300",
                )}
                onClick={() => setMethod(m)}
                disabled={busy}
              >
                {m === "cash" && <Banknote className={cn("size-6", method === m ? "animate-pulse" : "")} />}
                {m === "card" && <CreditCard className="size-6" />}
                {m === "manual" && <div className="font-black text-xl leading-none">M</div>}
                <span className="font-black text-[10px] uppercase tracking-widest">{m}</span>
              </button>
            ))}
          </div>

          {/* Conditional Inputs */}
          <div className="min-h-[200px] space-y-6">
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/20 p-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setSplitEnabled((prev) => !prev)}
                className={cn(
                  "w-full rounded-xl px-3 py-2 font-black text-[10px] uppercase tracking-widest transition-colors",
                  splitEnabled
                    ? "border border-emerald-700/40 bg-emerald-900/30 text-emerald-300"
                    : "border border-zinc-800 bg-zinc-900/40 text-zinc-400"
                )}
              >
                {splitEnabled ? "Split Bill Enabled" : "Enable Split Bill"}
              </button>
              {splitEnabled ? (
                <div className="mt-3 space-y-2">
                  {splitRows.map((row, idx) => (
                    <div key={`${row.methodKey}-${idx}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input
                        value={row.methodKey}
                        onChange={(event) =>
                          setSplitRows((prev) =>
                            prev.map((entry, entryIdx) =>
                              entryIdx === idx ? { ...entry, methodKey: event.target.value } : entry
                            )
                          )
                        }
                        placeholder="Method (cash/card)"
                        disabled={busy}
                        className="h-10 border-zinc-800 bg-zinc-900/40 text-sm"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(event) =>
                          setSplitRows((prev) =>
                            prev.map((entry, entryIdx) =>
                              entryIdx === idx ? { ...entry, amount: event.target.value } : entry
                            )
                          )
                        }
                        placeholder="0.00"
                        disabled={busy}
                        className="h-10 border-zinc-800 bg-zinc-900/40 text-sm tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 px-3 text-xs"
                        disabled={busy || splitRows.length <= 1}
                        onClick={() => setSplitRows((prev) => prev.filter((_, entryIdx) => entryIdx !== idx))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-zinc-700 text-xs"
                      disabled={busy}
                      onClick={() => setSplitRows((prev) => [...prev, { methodKey: "cash", amount: "" }])}
                    >
                      Add Split
                    </Button>
                    <div className={cn("font-black text-[10px] uppercase tracking-widest", splitRemainderUsd === 0 ? "text-emerald-400" : "text-amber-400")}>
                      Remaining: {formatCurrency(splitRemainderUsd, { currency: "USD" })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            {method === "cash" && (
              <div className="fade-in slide-in-from-top-4 animate-in space-y-6 duration-500 ease-out">
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <Label htmlFor="received-usd" className="font-black text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
                      Amount Received (USD)
                    </Label>
                    {Number(amountReceivedUsd) > subtotals.usd && (
                      <span className="fade-in zoom-in animate-in font-black text-[9px] text-emerald-500 uppercase tracking-widest">
                        Change: {formatCurrency(changeUsd, { currency: "USD" })}
                      </span>
                    )}
                  </div>
                  <div className="group relative">
                    <div className="absolute top-1/2 left-4 -translate-y-1/2 font-black text-lg text-zinc-600 transition-colors group-focus-within:text-emerald-500">$</div>
                    <Input
                      id="received-usd"
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={amountReceivedUsd}
                      onChange={(e) => setAmountReceivedUsd(e.target.value)}
                      className="h-16 rounded-2xl border-zinc-700/50 bg-zinc-900/50 pl-10 font-black text-2xl text-white tabular-nums shadow-inner focus:ring-emerald-500/20"
                      placeholder="0.00"
                      disabled={busy}
                    />
                  </div>
                </div>

                {/* Quick Cash Presets */}
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 20, 50, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmountReceivedUsd(val.toString())}
                      className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/30 font-black text-[10px] text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
                    >
                      ${val}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAmountReceivedUsd(subtotals.usd.toFixed(2))}
                    className="col-span-2 h-10 rounded-xl border border-emerald-900/30 bg-emerald-950/20 font-black text-[10px] text-emerald-500 transition-all hover:bg-emerald-900/30 active:scale-95"
                  >
                    Exact Amount
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountReceivedUsd("")}
                    className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/30 font-black text-[10px] text-zinc-500 transition-all hover:bg-zinc-800"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {method === "card" && (
              <div className="fade-in slide-in-from-top-4 animate-in space-y-4 duration-500 ease-out">
                <div className="space-y-3">
                  <Label htmlFor="card-ref" className="font-black text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
                    Card Reference / Last 4 Digits
                  </Label>
                  <Input
                    id="card-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. 1234 or Auth-998"
                    className="h-16 rounded-2xl border-zinc-700/50 bg-zinc-900/50 font-black text-lg text-white shadow-inner focus:ring-emerald-500/20"
                    disabled={busy}
                  />
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                  <div className="flex size-8 items-center justify-center rounded-full bg-zinc-800 text-emerald-500">
                    <CreditCard className="size-4" />
                  </div>
                  <p className="font-bold text-[10px] text-zinc-500 uppercase leading-relaxed tracking-widest">
                    Ensure the external terminal transaction is successful before confirming.
                  </p>
                </div>
              </div>
            )}

            {method === "manual" && (
              <div className="fade-in slide-in-from-top-4 animate-in space-y-3 duration-500 ease-out">
                <Label htmlFor="payment-note" className="font-black text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
                  Notes / Internal Reference
                </Label>
                <Input
                  id="payment-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Split payment, Voucher #123"
                  className="h-16 rounded-2xl border-zinc-700/50 bg-zinc-900/50 font-black text-lg text-white shadow-inner focus:ring-emerald-500/20"
                  disabled={busy}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2 gap-3 border-zinc-800/50 border-t pt-6 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="h-12 rounded-xl font-black text-[10px] text-zinc-500 uppercase tracking-widest hover:bg-zinc-900 hover:text-white"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Go Back
          </Button>
          <Button
            type="button"
            className="h-12 min-w-[160px] rounded-xl bg-emerald-600 font-black text-[10px] text-white uppercase tracking-[0.2em] shadow-emerald-950/20 shadow-lg transition-all hover:bg-emerald-500 active:scale-[0.98]"
            disabled={
              busy ||
              (splitEnabled && splitRemainderUsd !== 0) ||
              (!splitEnabled &&
                method === "cash" &&
                Number(Number(amountReceivedUsd).toFixed(2)) < Number(subtotals.usd.toFixed(2)))
            }
            onClick={() => void handleSubmit()}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : (
              <div className="flex items-center gap-2">
                <span>Complete Payment</span>
              </div>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
