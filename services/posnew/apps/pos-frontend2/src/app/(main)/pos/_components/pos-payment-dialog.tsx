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
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 text-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] mb-2">Total Due</div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="font-black text-5xl text-white tabular-nums tracking-tighter">
                {formatCurrency(subtotals.usd, { currency: "USD" }).split(".")[0]}
                <span className="text-xl opacity-40">.{formatCurrency(subtotals.usd, { currency: "USD" }).split(".")[1]}</span>
              </div>
              {subtotals.lbp > 0 && (
                <div className="mt-2 flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/50 border border-zinc-700/30">
                  <div className="size-1 rounded-full bg-zinc-500" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest tabular-nums leading-none">
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
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/20"
                    : "border-zinc-800 bg-zinc-900/20 text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300",
                )}
                onClick={() => setMethod(m)}
                disabled={busy}
              >
                {m === "cash" && <Banknote className={cn("size-6", method === m ? "animate-pulse" : "")} />}
                {m === "card" && <CreditCard className="size-6" />}
                {m === "manual" && <div className="font-black text-xl leading-none">M</div>}
                <span className="text-[10px] font-black uppercase tracking-widest">{m}</span>
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
                  "w-full rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors",
                  splitEnabled
                    ? "bg-emerald-900/30 text-emerald-300 border border-emerald-700/40"
                    : "bg-zinc-900/40 text-zinc-400 border border-zinc-800"
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
                    <div className={cn("text-[10px] font-black uppercase tracking-widest", splitRemainderUsd === 0 ? "text-emerald-400" : "text-amber-400")}>
                      Remaining: {formatCurrency(splitRemainderUsd, { currency: "USD" })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            {method === "cash" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <Label htmlFor="received-usd" className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Amount Received (USD)
                    </Label>
                    {Number(amountReceivedUsd) > subtotals.usd && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 animate-in fade-in zoom-in">
                        Change: {formatCurrency(changeUsd, { currency: "USD" })}
                      </span>
                    )}
                  </div>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 font-black text-lg group-focus-within:text-emerald-500 transition-colors">$</div>
                    <Input
                      id="received-usd"
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={amountReceivedUsd}
                      onChange={(e) => setAmountReceivedUsd(e.target.value)}
                      className="h-16 bg-zinc-900/50 pl-10 text-2xl font-black text-white tabular-nums focus:ring-emerald-500/20 rounded-2xl shadow-inner border-zinc-700/50"
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
                      className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/30 text-[10px] font-black text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-all active:scale-95"
                    >
                      ${val}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAmountReceivedUsd(subtotals.usd.toFixed(2))}
                    className="col-span-2 h-10 rounded-xl border border-emerald-900/30 bg-emerald-950/20 text-[10px] font-black text-emerald-500 hover:bg-emerald-900/30 transition-all active:scale-95"
                  >
                    Exact Amount
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountReceivedUsd("")}
                    className="h-10 rounded-xl border border-zinc-800 bg-zinc-900/30 text-[10px] font-black text-zinc-500 hover:bg-zinc-800 transition-all"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {method === "card" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
                <div className="space-y-3">
                  <Label htmlFor="card-ref" className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                    Card Reference / Last 4 Digits
                  </Label>
                  <Input
                    id="card-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. 1234 or Auth-998"
                    className="h-16 bg-zinc-900/50 text-lg font-black text-white focus:ring-emerald-500/20 rounded-2xl shadow-inner border-zinc-700/50"
                    disabled={busy}
                  />
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 flex items-center gap-3">
                  <div className="size-8 rounded-full bg-zinc-800 flex items-center justify-center text-emerald-500">
                    <CreditCard className="size-4" />
                  </div>
                  <p className="text-[10px] text-zinc-500 font-bold leading-relaxed uppercase tracking-widest">
                    Ensure the external terminal transaction is successful before confirming.
                  </p>
                </div>
              </div>
            )}

            {method === "manual" && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
                <Label htmlFor="payment-note" className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  Notes / Internal Reference
                </Label>
                <Input
                  id="payment-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Split payment, Voucher #123"
                  className="h-16 bg-zinc-900/50 text-lg font-black text-white focus:ring-emerald-500/20 rounded-2xl shadow-inner border-zinc-700/50"
                  disabled={busy}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-3 sm:justify-end border-t border-zinc-800/50 pt-6 mt-2">
          <Button
            type="button"
            variant="ghost"
            className="h-12 text-zinc-500 hover:text-white hover:bg-zinc-900 uppercase text-[10px] font-black tracking-widest rounded-xl"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Go Back
          </Button>
          <Button
            type="button"
            className="h-12 min-w-[160px] bg-emerald-600 font-black text-white uppercase text-[10px] tracking-[0.2em] rounded-xl shadow-lg shadow-emerald-950/20 hover:bg-emerald-500 active:scale-[0.98] transition-all"
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
