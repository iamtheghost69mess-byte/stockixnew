"use client";

import { useMemo } from "react";

import { format } from "date-fns";
import { Printer, } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { BillBreakdown } from "@/lib/pos-bill-utils";
import type { PosMenuItem } from "@/lib/pos-catalog-api";
import { formatCurrency } from "@/lib/utils";
import type { PosCartLine } from "@/stores/pos-order-store";

interface PosReceiptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: PosCartLine[];
  items: PosMenuItem[];
  bills: BillBreakdown;
  tableNo: number | string | null;
  staffName?: string;
  orderNumber?: string | number;
  onPrint?: () => void;
  busy?: boolean;
}

export function PosReceiptPreviewDialog({
  open,
  onOpenChange,
  cart,
  items,
  bills,
  tableNo,
  staffName,
  orderNumber,
  onPrint,
  busy,
}: PosReceiptPreviewDialogProps) {
  const now = useMemo(() => new Date(), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] border-zinc-800 bg-zinc-950 p-0" showCloseButton={false}>
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="font-black text-white text-xl uppercase tracking-tight">Receipt Preview</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          <ScrollArea className="group relative h-[520px] overflow-hidden rounded-3xl border border-zinc-800 bg-[#f8f8f2] p-8 shadow-2xl">
            {/* Thermal Paper Texture Overlay */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.03]" 
                 style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")' }} />
            
            {/* The "Paper" Receipt */}
            <div className="relative z-10 flex flex-col items-center font-mono text-sm text-zinc-900">
              <div className="mb-6 flex flex-col items-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full border-2 border-zinc-900">
                  <span className="font-black text-xl">P</span>
                </div>
                <h3 className="font-black text-base uppercase tracking-[0.2em]">POS TERMINAL</h3>
                <p className="mt-1 font-bold text-[9px] uppercase tracking-widest opacity-60">Enterprise Edition v2.0</p>
              </div>

              <div className="mb-6 w-full space-y-1 font-bold text-[10px]">
                <div className="mb-1 flex justify-between border-zinc-200 border-b pb-1">
                  <span>Date: {format(now, "dd MMM yyyy")}</span>
                  <span>Time: {format(now, "HH:mm")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Table: <span className="font-black">{tableNo}</span></span>
                  {orderNumber && <span>Order: <span className="font-black">#{orderNumber}</span></span>}
                </div>
              </div>

              <div className="my-4 w-full border-zinc-300 border-t border-dashed" />

              <div className="mb-6 w-full space-y-3">
                {cart.map((line) => (
                  <div key={line.id} className="flex items-start justify-between gap-4">
                    <div className="flex-1 text-left">
                      <div className="mb-0.5 font-black text-xs uppercase leading-tight">{line.name}</div>
                      <div className="font-bold text-[9px] opacity-60">
                        {line.quantity} x {formatCurrency(line.pricePerQuantity, { currency: "USD" })}
                      </div>
                      {Array.isArray(line.selectedSlots) && line.selectedSlots.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {line.selectedSlots.map((slot, idx) => (
                            <div key={`${slot.slotName}-${slot.menuItemId}-${idx}`} className="font-bold text-[9px] opacity-60">
                              * {slot.slotName}: {slot.menuItemName}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="font-black text-xs tabular-nums">{formatCurrency(line.price, { currency: "USD" })}</div>
                  </div>
                ))}
              </div>

              <div className="my-4 w-full border-zinc-300 border-t border-dashed" />

              <div className="mb-6 w-full space-y-2">
                <div className="flex justify-between font-bold text-[11px]">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(bills.subtotalUsd, { currency: "USD" })}</span>
                </div>
                {bills.taxes.map((t) => (
                  <div key={t.code} className="flex justify-between font-bold text-[11px] opacity-70">
                    <span>
                      {t.name} ({t.rate}%)
                    </span>
                    <span className="tabular-nums">{formatCurrency(t.amountUsd, { currency: "USD" })}</span>
                  </div>
                ))}
                {bills.serviceChargeUsd > 0 ? (
                  <div className="flex justify-between font-bold text-[11px] opacity-70">
                    <span>Service Charge ({bills.serviceChargeRate}%)</span>
                    <span className="tabular-nums">{formatCurrency(bills.serviceChargeUsd, { currency: "USD" })}</span>
                  </div>
                ) : null}
                <div className="mt-4 flex justify-between border-zinc-900 border-t-2 border-double pt-4 font-black text-lg">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{formatCurrency(bills.totalUsd, { currency: "USD" })}</span>
                </div>
              </div>

              <div className="mt-8 w-full space-y-2 text-center font-bold text-[9px] uppercase tracking-widest opacity-70">
                {staffName && <p>Served by: {staffName}</p>}
                <p>Thank you for dining with us!</p>
                <div className="flex flex-col items-center gap-2 pt-6 opacity-30">
                  <div className="flex h-10 w-48 items-center justify-center bg-zinc-900">
                    <div className="h-full w-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px)' }} />
                  </div>
                  <span className="text-[8px] tracking-[0.5em]">010101100101</span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="mt-2 flex gap-3 border-zinc-800/50 border-t bg-zinc-950 p-6 pt-2">
          <Button
            className="h-14 flex-1 rounded-2xl bg-emerald-600 font-black text-[10px] text-white uppercase tracking-[0.2em] shadow-emerald-950/20 shadow-lg transition-all hover:bg-emerald-500 active:scale-95"
            onClick={onPrint}
            disabled={busy}
          >
            <Printer className="mr-2 h-4 w-4" />
            {busy ? "Printing..." : "Confirm & Print"}
          </Button>
          <Button
            variant="ghost"
            className="h-14 flex-1 rounded-2xl font-black text-[10px] text-zinc-500 uppercase tracking-widest hover:bg-zinc-900 hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            Go Back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
