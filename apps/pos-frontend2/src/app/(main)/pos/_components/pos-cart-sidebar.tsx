"use client";

import { CreditCard, Printer, Send, Trash2 } from "lucide-react";

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
    <div className="flex h-full flex-col overflow-hidden border-zinc-800/50 border-l bg-zinc-950/40 shadow-2xl backdrop-blur-xl">
      {/* Header — Fixed */}
      <div className="shrink-0 p-5 pb-2">
        <div className="mb-1 flex items-center gap-2">
          <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          <h2 className="font-black text-lg text-white uppercase leading-none tracking-tighter">Check Ledger</h2>
        </div>
        <p className="font-black text-[9px] text-zinc-500 uppercase tracking-[0.2em] opacity-70">
          Real-time Terminal Sync
        </p>
        {availabilityMap && stockDeductTrigger && (
          <div className="mt-3 flex w-fit items-center gap-2 rounded-lg border border-emerald-500/10 bg-emerald-950/30 px-3 py-1">
            <div className="size-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
            <span className="font-black text-[8px] text-emerald-400/80 uppercase tracking-widest">
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
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {cart.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-3xl border border-zinc-800/30 border-dashed bg-zinc-900/5 p-4 text-center">
            <Trash2 className="mb-2 size-5 text-zinc-800" />
            <h3 className="font-black text-[10px] text-zinc-500 uppercase leading-none tracking-widest">Cart is empty</h3>
            <p className="mt-2 font-bold text-[8px] text-zinc-700 uppercase tracking-tighter">Select items to begin</p>
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
      <div className="shrink-0 space-y-3 border-zinc-800/50 border-t bg-zinc-950/95 p-4 backdrop-blur-md">
        <div className="group relative space-y-2 overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-4 shadow-inner">
          <div className="relative z-10 space-y-1.5">
            <div className="flex justify-between font-black text-[9px] text-zinc-500 uppercase tracking-[0.2em]">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(bills.subtotalUsd, { currency: "USD" })}</span>
            </div>
            {bills.taxes.map((t) => (
              <div
                key={t.code}
                className="flex justify-between font-black text-[8px] text-zinc-600 uppercase tracking-widest opacity-80"
              >
                <span>
                  {t.name} ({t.rate}%)
                </span>
                <span className="tabular-nums">{formatCurrency(t.amountUsd, { currency: "USD" })}</span>
              </div>
            ))}
            {bills.serviceChargeUsd > 0 ? (
              <div className="flex justify-between font-black text-[8px] text-zinc-600 uppercase tracking-widest opacity-80">
                <span>Service Charge ({bills.serviceChargeRate}%)</span>
                <span className="tabular-nums">{formatCurrency(bills.serviceChargeUsd, { currency: "USD" })}</span>
              </div>
            ) : null}
          </div>

          <div className="relative z-10 flex items-end justify-between border-zinc-800/50 border-t pt-2">
            <div>
              <span className="mb-0.5 block font-black text-[8px] text-emerald-500/70 uppercase tracking-[0.3em]">
                Grand Total
              </span>
              <h3 className="font-black text-2xl text-white uppercase leading-none tracking-tighter">
                {formatCurrency(bills.totalUsd, { currency: "USD" }).split(".")[0]}
                <span className="text-base opacity-40">.{formatCurrency(bills.totalUsd, { currency: "USD" }).split(".")[1]}</span>
              </h3>
            </div>
            {bills.totalLbp > 0 && (
              <div className="text-right">
                <div className="font-black text-[9px] text-zinc-500 uppercase tabular-nums leading-none tracking-widest">
                  {formatCurrency(bills.totalLbp, { currency: "LBP", noDecimals: true })}
                </div>
                <span className="font-bold text-[7px] text-zinc-700 uppercase tracking-tighter">LBP</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={locked || cart.length === 0 || sendingToKitchen}
            onClick={onSendToKitchen}
            className="h-11 rounded-lg border-zinc-800 bg-zinc-900/50 font-black text-[9px] text-zinc-300 uppercase tracking-widest transition-all hover:bg-zinc-800 active:scale-95"
          >
            {sendingToKitchen ? <Loader2 className="mr-2 h-3.5 w-3.5" /> : <Send className="mr-2 h-3.5 w-3.5 text-emerald-500" />}
            {kitchenFlowMode === "kitchen_display" ? "Send to KDS" : "Fire"}
          </Button>
          <Button
            variant="outline"
            disabled={!canPrintReceipt}
            onClick={onPreviewReceipt}
            className="h-11 rounded-lg border-zinc-800 bg-zinc-900/50 font-black text-[9px] text-zinc-300 uppercase tracking-widest transition-all hover:bg-zinc-800 active:scale-95"
          >
            <Printer className="mr-2 h-3.5 w-3.5 text-zinc-500" />
            Print
          </Button>
          <Button
            disabled={locked || cart.length === 0 || paying}
            onClick={onPay}
            className="col-span-2 h-14 rounded-xl bg-emerald-600 font-black text-[11px] text-white uppercase tracking-[0.2em] shadow-emerald-950/20 shadow-lg transition-all hover:bg-emerald-500 active:scale-[0.98]"
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
              className="col-span-2 h-11 rounded-xl border-zinc-700 bg-zinc-900/40 font-black text-[10px] text-zinc-200 uppercase tracking-[0.18em] hover:bg-zinc-800"
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
                  className="h-8 rounded-lg font-black text-[8px] text-zinc-600 uppercase tracking-widest transition-colors hover:bg-zinc-900/50 hover:text-white"
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
              className="h-8 rounded-lg font-black text-[8px] text-amber-500/70 uppercase tracking-widest transition-colors hover:bg-amber-950/10 hover:text-amber-400"
            >
              Discount
            </Button>
            <div className="h-3 w-px bg-zinc-800/50" />
            <Button
              variant="ghost"
              disabled={locked || !activeOrderId || busy}
              onClick={onVoid}
              className="h-8 rounded-lg font-black text-[8px] text-red-900/50 uppercase tracking-widest transition-colors hover:bg-red-950/10 hover:text-red-500"
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
          <div className="size-12 shrink-0 overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-800">
            {item?.imageUrl ? (
              <img src={item.imageUrl} alt={line.name} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center font-bold text-[10px] text-zinc-600">IMG</div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className={cn("truncate font-bold text-sm text-zinc-100 leading-snug", isSoldOut && "text-red-400")}>
                {line.name}
              </h4>
              {isSoldOut ? (
                <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 font-black text-[8px] text-white uppercase tracking-widest shadow-lg shadow-red-950/50">
                  Sold Out
                </span>
              ) : (
                avail &&
                avail.estimatedPortions != null &&
                avail.estimatedPortions <= 5 && (
                  <span
                    className={cn(
                      "shrink-0 rounded-sm px-1.5 py-0.5 font-black text-[8px] uppercase",
                      avail.estimatedPortions <= 2 ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500",
                    )}
                  >
                    {avail.estimatedPortions} Left
                  </span>
                )
              )}
            </div>
            <div className="mt-1 font-medium text-xs text-zinc-500 tabular-nums">
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
              locked && "pointer-events-none opacity-0",
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
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 transition-all hover:bg-zinc-700 active:scale-90 disabled:opacity-30"
            >
              <span className="font-bold text-lg">−</span>
            </button>
            <div className="w-10 text-center font-black text-base text-white">{line.quantity}</div>
            <button
              type="button"
              disabled={locked || isSoldOut}
              onClick={() => onBump(line.id, line.quantity + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 transition-all hover:bg-zinc-700 active:scale-90 disabled:opacity-30"
            >
              <span className="font-bold text-lg">+</span>
            </button>
          </div>

          <div className="text-right tabular-nums">
            <span className="font-black text-sm text-white">{formatCurrency(line.price, { currency: "USD" })}</span>
          </div>
        </div>
      </div>

      {isSoldOut && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-5"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, #000, #000 10px, transparent 10px, transparent 20px)",
          }}
        />
      )}
    </div>
  );
}
