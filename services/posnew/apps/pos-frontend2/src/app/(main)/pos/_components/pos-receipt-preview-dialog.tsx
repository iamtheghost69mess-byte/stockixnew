"use client";

import { useMemo } from "react";

import { format } from "date-fns";
import { Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
      <DialogContent className="max-w-[400px] bg-zinc-950 p-0 border-zinc-800" showCloseButton={false}>
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-black tracking-tight text-white uppercase">Receipt Preview</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          <ScrollArea className="h-[520px] rounded-3xl border border-zinc-800 bg-[#f8f8f2] p-8 shadow-2xl relative overflow-hidden group">
            {/* Thermal Paper Texture Overlay */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                 style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")' }} />
            
            {/* The "Paper" Receipt */}
            <div className="flex flex-col items-center text-zinc-900 font-mono text-sm relative z-10">
              <div className="mb-6 flex flex-col items-center">
                <div className="size-12 rounded-full border-2 border-zinc-900 flex items-center justify-center mb-3">
                  <span className="font-black text-xl">P</span>
                </div>
                <h3 className="text-base font-black tracking-[0.2em] uppercase">POS TERMINAL</h3>
                <p className="text-[9px] font-bold opacity-60 mt-1 uppercase tracking-widest">Enterprise Edition v2.0</p>
              </div>

              <div className="w-full space-y-1 text-[10px] font-bold mb-6">
                <div className="flex justify-between border-b border-zinc-200 pb-1 mb-1">
                  <span>Date: {format(now, "dd MMM yyyy")}</span>
                  <span>Time: {format(now, "HH:mm")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Table: <span className="font-black">{tableNo}</span></span>
                  {orderNumber && <span>Order: <span className="font-black">#{orderNumber}</span></span>}
                </div>
              </div>

              <div className="w-full border-t border-zinc-300 border-dashed my-4" />

              <div className="w-full space-y-3 mb-6">
                {cart.map((line) => (
                  <div key={line.id} className="flex justify-between items-start gap-4">
                    <div className="text-left flex-1">
                      <div className="font-black text-xs uppercase leading-tight mb-0.5">{line.name}</div>
                      <div className="text-[9px] font-bold opacity-60">
                        {line.quantity} x {formatCurrency(line.pricePerQuantity, { currency: "USD" })}
                      </div>
                      {Array.isArray(line.selectedSlots) && line.selectedSlots.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {line.selectedSlots.map((slot, idx) => (
                            <div key={`${slot.slotName}-${slot.menuItemId}-${idx}`} className="text-[9px] font-bold opacity-60">
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

              <div className="w-full border-t border-zinc-300 border-dashed my-4" />

              <div className="w-full space-y-2 mb-6">
                <div className="flex justify-between text-[11px] font-bold">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(bills.subtotalUsd, { currency: "USD" })}</span>
                </div>
                {bills.taxes.map((t) => (
                  <div key={t.code} className="flex justify-between text-[11px] font-bold opacity-70">
                    <span>
                      {t.name} ({t.rate}%)
                    </span>
                    <span className="tabular-nums">{formatCurrency(t.amountUsd, { currency: "USD" })}</span>
                  </div>
                ))}
                {bills.serviceChargeUsd > 0 ? (
                  <div className="flex justify-between text-[11px] font-bold opacity-70">
                    <span>Service Charge ({bills.serviceChargeRate}%)</span>
                    <span className="tabular-nums">{formatCurrency(bills.serviceChargeUsd, { currency: "USD" })}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-lg font-black mt-4 pt-4 border-t-2 border-zinc-900 border-double">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{formatCurrency(bills.totalUsd, { currency: "USD" })}</span>
                </div>
              </div>

              <div className="w-full text-center text-[9px] mt-8 space-y-2 font-bold opacity-70 uppercase tracking-widest">
                {staffName && <p>Served by: {staffName}</p>}
                <p>Thank you for dining with us!</p>
                <div className="pt-6 flex flex-col items-center gap-2 opacity-30">
                  <div className="h-10 w-48 bg-zinc-900 flex items-center justify-center">
                    <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px)' }} />
                  </div>
                  <span className="text-[8px] tracking-[0.5em]">010101100101</span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="p-6 pt-2 bg-zinc-950 flex gap-3 border-t border-zinc-800/50 mt-2">
          <Button
            className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl shadow-lg shadow-emerald-950/20 active:scale-95 transition-all"
            onClick={onPrint}
            disabled={busy}
          >
            <Printer className="mr-2 h-4 w-4" />
            {busy ? "Printing..." : "Confirm & Print"}
          </Button>
          <Button
            variant="ghost"
            className="flex-1 h-14 text-zinc-500 hover:text-white hover:bg-zinc-900 uppercase tracking-widest text-[10px] font-black rounded-2xl"
            onClick={() => onOpenChange(false)}
          >
            Go Back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
