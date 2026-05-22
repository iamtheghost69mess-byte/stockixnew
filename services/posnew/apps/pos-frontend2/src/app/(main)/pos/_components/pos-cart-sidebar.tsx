"use client";

import { CreditCard, Printer, RotateCcw, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BillBreakdown } from "@/lib/pos-bill-utils";
import type { PosMenuItem } from "@/lib/pos-catalog-api";
import { cn, formatCurrency } from "@/lib/utils";
import type { PosCartLine } from "@/stores/pos-order-store";

interface PosCartSidebarProps {
  cart: PosCartLine[];
  items: PosMenuItem[];
  locked: boolean;
  bills: BillBreakdown;
  activeOrderId: string | null;
  onRemove: (id: string) => void;
  onBump: (id: string, next: number) => void;
  onPay: () => void;
  onSplitBill?: () => void;
  onSendToKitchen: () => void;
  onPreviewReceipt: () => void;
  onDiscount: () => void;
  onVoid: () => void;
  onRefund: () => void;
  availabilityMap?: Map<string, { canFulfill: boolean; estimatedPortions?: number | null; reason?: string }>;
  stockDeductTrigger?: string;
  kitchenFlowMode?: "station_tickets" | "kitchen_display";
  sendingToKitchen?: boolean;
  paying?: boolean;
  busy?: boolean;
  userRole?: string | null;
  canPrintReceipt?: boolean;
  canSplitBill?: boolean;
}

export function PosCartSidebar({
  cart,
  items,
  locked,
  bills,
  activeOrderId,
  onRemove,
  onBump,
  onPay,
  onSplitBill,
  onSendToKitchen,
  onPreviewReceipt,
  onDiscount,
  onVoid,
  onRefund,
  availabilityMap,
  stockDeductTrigger,
  kitchenFlowMode,
  sendingToKitchen,
  paying,
  busy,
  userRole,
  canPrintReceipt = true,
  canSplitBill = false,
}: PosCartSidebarProps) {
  const isAdmin = String(userRole || "").toLowerCase() === "admin";
  return (
    <div className="flex h-full flex-col bg-zinc-950/40 backdrop-blur-xl border-l border-zinc-800/50 shadow-2xl overflow-hidden">
      {/* Header — Fixed */}
      <div className="shrink-0 p-5 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          <h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none">Check Ledger</h2>
        </div>
        <p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] opacity-70">
          Real-time Terminal Sync
        </p>
        {availabilityMap && stockDeductTrigger && (
          <div className="mt-3 flex items-center gap-2 py-1 px-3 rounded-lg bg-emerald-950/30 border border-emerald-500/10 w-fit">
            <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
            <span className="text-[8px] font-black text-emerald-400/80 uppercase tracking-widest">
              Deduction:{" "}
              {stockDeductTrigger === "kitchen_send"
                ? "On Kitchen Send"
                : stockDeductTrigger === "payment"
                  ? "On Payment"
                  : stockDeductTrigger.replace(/_/g, " ")}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable Items Area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2 scrollbar-hide">
        {cart.length === 0 ? (
          <div className="min-h-[120px] flex flex-col items-center justify-center text-center border border-dashed border-zinc-800/30 rounded-3xl bg-zinc-900/5 p-4">
            <Trash2 className="size-5 text-zinc-800 mb-2" />
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">Cart is empty</h3>
            <p className="text-[8px] text-zinc-700 mt-2 font-bold uppercase tracking-tighter">Select items to begin</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-10">
            {cart.map((line) => (
              <PosCartLineItem
                key={line.id}
                line={line}
                items={items}
                locked={locked}
                onRemove={onRemove}
                onBump={onBump}
                availabilityMap={availabilityMap}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer — Sticky Totals & Buttons */}
      <div className="shrink-0 p-4 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/50 space-y-3">
        <div className="space-y-2 rounded-2xl bg-zinc-900/40 p-4 border border-zinc-800/50 shadow-inner relative overflow-hidden group">
          <div className="space-y-1.5 relative z-10">
            <div className="flex justify-between text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em]">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(bills.subtotalUsd, { currency: "USD" })}</span>
            </div>
            {bills.taxes.map((t) => (
              <div
                key={t.code}
                className="flex justify-between text-zinc-600 text-[8px] font-black uppercase tracking-widest opacity-80"
              >
                <span>
                  {t.name} ({t.rate}%)
                </span>
                <span className="tabular-nums">{formatCurrency(t.amountUsd, { currency: "USD" })}</span>
              </div>
            ))}
            {bills.serviceChargeUsd > 0 ? (
              <div className="flex justify-between text-zinc-600 text-[8px] font-black uppercase tracking-widest opacity-80">
                <span>Service Charge ({bills.serviceChargeRate}%)</span>
                <span className="tabular-nums">{formatCurrency(bills.serviceChargeUsd, { currency: "USD" })}</span>
              </div>
            ) : null}
          </div>

          <div className="flex justify-between items-end pt-2 border-t border-zinc-800/50 relative z-10">
            <div>
              <span className="text-[8px] font-black text-emerald-500/70 uppercase tracking-[0.3em] block mb-0.5">
                Grand Total
              </span>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">
                {formatCurrency(bills.totalUsd, { currency: "USD" }).split(".")[0]}
                <span className="text-base opacity-40">.{formatCurrency(bills.totalUsd, { currency: "USD" }).split(".")[1]}</span>
              </h3>
            </div>
            {bills.totalLbp > 0 && (
              <div className="text-right">
                <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest tabular-nums leading-none">
                  {formatCurrency(bills.totalLbp, { currency: "LBP", noDecimals: true })}
                </div>
                <span className="text-[7px] text-zinc-700 font-bold uppercase tracking-tighter">LBP</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={locked || cart.length === 0 || sendingToKitchen}
            onClick={onSendToKitchen}
            className="h-11 border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 rounded-lg uppercase text-[9px] font-black tracking-widest active:scale-95 transition-all"
          >
            {sendingToKitchen ? <Loader2 className="mr-2 h-3.5 w-3.5" /> : <Send className="mr-2 h-3.5 w-3.5 text-emerald-500" />}
            {kitchenFlowMode === "kitchen_display" ? "Send to KDS" : "Fire"}
          </Button>
          <Button
            variant="outline"
            disabled={!canPrintReceipt}
            onClick={onPreviewReceipt}
            className="h-11 border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 rounded-lg uppercase text-[9px] font-black tracking-widest active:scale-95 transition-all"
          >
            <Printer className="mr-2 h-3.5 w-3.5 text-zinc-500" />
            Print
          </Button>
          <Button
            disabled={locked || cart.length === 0 || paying}
            onClick={onPay}
            className="col-span-2 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl uppercase text-[11px] font-black tracking-[0.2em] shadow-lg shadow-emerald-950/20 active:scale-[0.98] transition-all"
          >
            {paying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="flex items-center justify-center gap-2">
                <CreditCard className="size-4" />
                <span>Pay & Close Check</span>
              </div>
            )}
          </Button>
          {canSplitBill ? (
            <Button
              variant="outline"
              disabled={locked || cart.length === 0 || paying || !onSplitBill}
              onClick={onSplitBill}
              className="col-span-2 h-11 border-zinc-700 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-800 rounded-xl uppercase text-[10px] font-black tracking-[0.18em]"
            >
              Split Bill
            </Button>
          ) : null}

          <div className="col-span-2 flex items-center justify-between px-1 pt-1">
            {isAdmin ? (
              <>
                <Button
                  variant="ghost"
                  disabled={!locked || !activeOrderId || busy}
                  onClick={onRefund}
                  className="h-8 text-zinc-600 hover:text-white hover:bg-zinc-900/50 rounded-lg uppercase text-[8px] font-black tracking-widest transition-colors"
                >
                  Refund
                </Button>
                <div className="h-3 w-px bg-zinc-800/50" />
              </>
            ) : null}
            <Button
              variant="ghost"
              disabled={!activeOrderId || busy}
              onClick={onDiscount}
              className="h-8 text-amber-500/70 hover:text-amber-400 hover:bg-amber-950/10 rounded-lg uppercase text-[8px] font-black tracking-widest transition-colors"
            >
              Discount
            </Button>
            <div className="h-3 w-px bg-zinc-800/50" />
            <Button
              variant="ghost"
              disabled={locked || !activeOrderId || busy}
              onClick={onVoid}
              className="h-8 text-red-900/50 hover:text-red-500 hover:bg-red-950/10 rounded-lg uppercase text-[8px] font-black tracking-widest transition-colors"
            >
              Void Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("animate-spin", className)}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function PosCartLineItem({
  line,
  items,
  locked,
  onRemove,
  onBump,
  availabilityMap,
}: {
  line: PosCartLine;
  items: PosMenuItem[];
  locked: boolean;
  onRemove: (id: string) => void;
  onBump: (id: string, next: number) => void;
  availabilityMap?: Map<string, { canFulfill: boolean; estimatedPortions?: number | null; reason?: string }>;
}) {
  const item = items.find((it) => String(it._id) === String(line.menuItem));
  const avail = availabilityMap?.get(String(line.menuItem));
  const isSoldOut = avail ? !avail.canFulfill : false;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-zinc-800/50 bg-zinc-900/20 p-4 transition-all hover:bg-zinc-900/40",
        isSoldOut && "border-red-500/30 bg-red-500/5",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-4">
          {/* Item Image with Fallback */}
          <div className="size-12 rounded-xl bg-zinc-800 border border-zinc-700/50 overflow-hidden shrink-0">
            {item?.imageUrl ? (
              <img src={item.imageUrl} alt={line.name} className="size-full object-cover" />
            ) : (
              <div className="size-full flex items-center justify-center text-zinc-600 font-bold text-[10px]">IMG</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={cn("font-bold text-zinc-100 text-sm leading-snug truncate", isSoldOut && "text-red-400")}>
                {line.name}
              </h4>
              {isSoldOut ? (
                <span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shrink-0 uppercase tracking-widest shadow-lg shadow-red-950/50">
                  Sold Out
                </span>
              ) : (
                avail &&
                avail.estimatedPortions != null &&
                avail.estimatedPortions <= 5 && (
                  <span
                    className={cn(
                      "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-sm shrink-0",
                      avail.estimatedPortions <= 2 ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500",
                    )}
                  >
                    {avail.estimatedPortions} Left
                  </span>
                )
              )}
            </div>
            <div className="mt-1 text-xs text-zinc-500 font-medium tabular-nums">
              {formatCurrency(line.pricePerQuantity, { currency: "USD" })}
            </div>
            {Array.isArray(line.selectedSlots) && line.selectedSlots.length > 0 ? (
              <div className="mt-2 space-y-1">
                {line.selectedSlots.map((slot, idx) => (
                  <div key={`${slot.slotName}-${slot.menuItemId}-${idx}`} className="text-[10px] text-zinc-400">
                    * {slot.slotName}: {slot.menuItemName}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={locked}
            onClick={() => onRemove(line.id)}
            className={cn(
              "rounded-lg p-1.5 text-zinc-600 transition-all hover:bg-red-950/40 hover:text-red-400",
              locked && "opacity-0 pointer-events-none",
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between border-zinc-800/40 border-t pt-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={locked}
              onClick={() => onBump(line.id, line.quantity - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 active:scale-90 transition-all"
            >
              <span className="font-bold text-lg">−</span>
            </button>
            <div className="w-10 text-center font-black text-base text-white">{line.quantity}</div>
            <button
              type="button"
              disabled={locked || isSoldOut}
              onClick={() => onBump(line.id, line.quantity + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 active:scale-90 transition-all"
            >
              <span className="font-bold text-lg">+</span>
            </button>
          </div>

          <div className="text-right tabular-nums">
            <span className="text-sm font-black text-white">{formatCurrency(line.price, { currency: "USD" })}</span>
          </div>
        </div>
      </div>

      {isSoldOut && (
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl opacity-5"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, #000, #000 10px, transparent 10px, transparent 20px)",
          }}
        />
      )}
    </div>
  );
}
