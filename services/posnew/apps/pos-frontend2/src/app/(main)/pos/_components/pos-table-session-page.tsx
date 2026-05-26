"use client";

import { useCallback, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { OfflineStatusBanner } from "@/components/pos/offline-status-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { posDeleteOrder, posMarkOrderPaid, posUpdateOrderStatus } from "@/lib/pos-order-api";
import { posAccountingPostOrderRefund } from "@/lib/pos-accounting-api";
import { postInventoryReturn } from "@/lib/inventory-api";
import { cn } from "@/lib/utils";
import type { PosMenuItem, PosModifierGroup, PosCombo } from "@/lib/pos-catalog-api";

import { usePosSession } from "../_hooks/use-pos-session";
import { PosCartSidebar } from "./pos-cart-sidebar";
import { PosCategorySidebar } from "./pos-category-sidebar";
import { type PosPaymentConfirmPayload, PosPaymentDialog } from "./pos-payment-dialog";
import { PosProductGrid } from "./pos-product-grid";
import { PosReceiptPreviewDialog } from "./pos-receipt-preview-dialog";
import { type PosRefundConfirmPayload, PosRefundDialog } from "./pos-refund-dialog";

export function PosTableSessionPage({ tableId }: Readonly<{ tableId: string }>) {
  const router = useRouter();
  const {
    ready,
    catalogLoading,
    categories,
    items,
    modifierGroups,
    combos,
    tableNo,
    cart,
    activeOrderId,
    orderLinesLocked,
    bills,
    posUser,
    pickItem,
    setLineQuantity,
    removeLineWithReason,
    paying,
    setPaying,
    handlePayment,
    handlePrintReceipt,
    printingReceipt,
    sendToKitchen,
    sendingToKitchen,
    availabilityMap,
    stockSnapshotUnavailable,
    barcode,
    setBarcode,
    barcodeBusy,
    handleBarcodeSubmit,
    accountingConfigQuery,
    canPrintReceipt,
    applyDiscount,
  } = usePosSession(tableId);

  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [startPaymentWithSplit, setStartPaymentWithSplit] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [postSendVoidOpen, setPostSendVoidOpen] = useState(false);
  const [postSendVoidLineId, setPostSendVoidLineId] = useState<string | null>(null);
  const [postSendVoidReason, setPostSendVoidReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  const [modifierTargetItem, setModifierTargetItem] = useState<PosMenuItem | null>(null);
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});
  const [modifierNote, setModifierNote] = useState("");
  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [comboTarget, setComboTarget] = useState<PosCombo | null>(null);
  const [comboSelections, setComboSelections] = useState<Record<string, string>>({});
  const comboMenuItems = useMemo(() => {
    const map = new Map<string, PosMenuItem>();
    for (const item of items) {
      map.set(String(item._id), item);
    }
    return map;
  }, [items]);
  const canSplitBill = useMemo(() => {
    const role = String(posUser?.role || "").toLowerCase();
    return role === "cashier" || role === "manager";
  }, [posUser?.role]);
  const modifierGroupsByItem = useCallback(
    (item: PosMenuItem): PosModifierGroup[] => {
      const ids = (item.modifierGroups || [])
        .map((entry) => String(entry.groupId || ""))
        .filter((id) => id.length > 0);
      if (ids.length === 0) return [];
      const idSet = new Set(ids);
      return modifierGroups.filter((group) => idSet.has(String(group._id)) && group.isActive);
    },
    [modifierGroups],
  );

  const openModifierDialog = useCallback(
    (item: PosMenuItem) => {
      setModifierTargetItem(item);
      const defaults: Record<string, string[]> = {};
      for (const group of modifierGroupsByItem(item)) {
        defaults[String(group._id)] = [];
      }
      setModifierSelections(defaults);
      setModifierNote("");
      setModifierDialogOpen(true);
    },
    [modifierGroupsByItem],
  );

  const canSubmitModifiers = useMemo(() => {
    if (!modifierTargetItem) return false;
    const groups = modifierGroupsByItem(modifierTargetItem);
    return groups.every((group) => {
      if (!group.required) return true;
      const selected = modifierSelections[String(group._id)] || [];
      return selected.length >= Math.max(1, Number(group.minSelections || 1));
    });
  }, [modifierGroupsByItem, modifierSelections, modifierTargetItem]);

  const handleSelectProduct = useCallback(
    (item: PosMenuItem) => {
      const matchedCombo = combos.find(
        (combo) => combo.isActive && String(combo.name || "").toLowerCase() === String(item.name || "").toLowerCase()
      );
      if (matchedCombo) {
        setComboTarget(matchedCombo);
        setComboSelections({});
        setComboDialogOpen(true);
        return;
      }
      const groups = modifierGroupsByItem(item);
      if (groups.length === 0) {
        pickItem(item);
        return;
      }
      openModifierDialog(item);
    },
    [combos, modifierGroupsByItem, openModifierDialog, pickItem],
  );

  const canSubmitCombo = useMemo(() => {
    if (!comboTarget) return false;
    return comboTarget.slots.every((slot) => {
      if (!slot.required) return true;
      return Boolean(comboSelections[slot.name]);
    });
  }, [comboSelections, comboTarget]);

  const handleConfirmCombo = useCallback(() => {
    if (!comboTarget) return;
    const selectedSlots = comboTarget.slots
      .map((slot) => {
        const selectedMenuItemId = comboSelections[slot.name];
        if (!selectedMenuItemId) return null;
        const menuItem = comboMenuItems.get(String(selectedMenuItemId));
        if (!menuItem) return null;
        return {
          slotName: slot.name,
          menuItemId: String(menuItem._id),
          menuItemName: menuItem.name || "Item",
        };
      })
      .filter((entry): entry is { slotName: string; menuItemId: string; menuItemName: string } => entry !== null);

    pickItem(
      {
        _id: comboTarget._id,
        name: comboTarget.name,
        priceUsd: comboTarget.price,
      } as PosMenuItem,
      {
        selectedModifiers: [],
        itemType: "combo",
        comboId: String(comboTarget._id),
        comboName: comboTarget.name,
        comboPrice: Number(comboTarget.price || 0),
        selectedSlots,
      }
    );
    setComboDialogOpen(false);
    setComboTarget(null);
    setComboSelections({});
  }, [comboMenuItems, comboSelections, comboTarget, pickItem]);

  const handleConfirmModifierItem = useCallback(() => {
    if (!modifierTargetItem) return;
    const groups = modifierGroupsByItem(modifierTargetItem);
    const selectedModifiers = groups.map((group) => {
      const selectedNames = modifierSelections[String(group._id)] || [];
      const selectedOptions = (group.options || [])
        .filter((option) => selectedNames.includes(option.name))
        .map((option) => ({
          name: option.name,
          priceAdjustment: Number(option.priceAdjustment || 0),
        }));
      return {
        groupId: String(group._id),
        groupName: group.name,
        selectedOptions,
      };
    });
    pickItem(modifierTargetItem, {
      note: modifierNote,
      selectedModifiers,
    });
    setModifierDialogOpen(false);
    setModifierTargetItem(null);
    setModifierSelections({});
    setModifierNote("");
  }, [modifierGroupsByItem, modifierNote, modifierSelections, modifierTargetItem, pickItem]);

  const handleRemoveLine = useCallback(
    async (lineId: string) => {
      const line = cart.find((entry) => entry.id === lineId);
      if (!line) return;
      if (String(line.status || "").toLowerCase() === "sent") {
        setPostSendVoidLineId(lineId);
        setPostSendVoidReason("");
        setPostSendVoidOpen(true);
        return;
      }
      await removeLineWithReason(lineId);
    },
    [cart, removeLineWithReason],
  );

  const handleConfirmPostSendVoid = useCallback(async () => {
    if (!postSendVoidLineId || postSendVoidReason.trim().length < 3) return;
    try {
      await removeLineWithReason(postSendVoidLineId, postSendVoidReason.trim());
      setPostSendVoidOpen(false);
      setPostSendVoidLineId(null);
      setPostSendVoidReason("");
      toast.success("Sent item voided.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void sent item.");
    }
  }, [postSendVoidLineId, postSendVoidReason, removeLineWithReason]);

  const handleVoidOrder = useCallback(async () => {
    if (!activeOrderId) return;
    setDeleting(true);
    try {
      await posDeleteOrder(activeOrderId);
      toast.success("Order voided successfully.");
      setVoidConfirmOpen(false);
      router.replace("/pos");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to void order.");
    } finally {
      setDeleting(false);
    }
  }, [activeOrderId, router]);

  const handleRefund = useCallback(
    async (payload: PosRefundConfirmPayload) => {
      if (!activeOrderId) return;
      setDeleting(true);
      try {
        // 1. Optional Restock
        if (payload.restock) {
          await postInventoryReturn({
            ingredientId: payload.restock.ingredientId,
            quantity: payload.restock.quantity,
            note: `Restock from Refund (Order #${activeOrderId.slice(-6)}): ${payload.note}`,
          });
          toast.success("Inventory restocked.");
        }

        // 2. Optional Accounting Refund (Financial)
        // If the order was paid, we post a refund entry.
        // We assume full refund of the total with tax for now.
        if (bills.totalWithTax > 0) {
          try {
            await posAccountingPostOrderRefund(activeOrderId, {
              amount: bills.totalWithTax,
            });
            toast.success("Financial refund posted to ledger.");
          } catch (ae) {
            console.error("Accounting refund failed, but proceeding with cancellation", ae);
            toast.error("Financial refund failed. Ledger may need manual adjustment.");
          }
        }

        // 3. Cancel/Void the Order
        await posDeleteOrder(activeOrderId);

        toast.success("Order refunded and cancelled.");
        setRefundDialogOpen(false);
        router.replace("/pos");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Refund failed.");
      } finally {
        setDeleting(false);
      }
    },
    [activeOrderId, bills.totalWithTax, router],
  );

  if (!ready || catalogLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-8 bg-zinc-950">
        <div className="relative">
          <div className="absolute inset-0 blur-2xl bg-emerald-500/20 animate-pulse rounded-full" />
          <Loader2 className="h-12 w-12 animate-spin text-emerald-500 relative z-10" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Professional POS</p>
          <div className="h-px w-12 bg-zinc-800" />
          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-700">Syncing Catalog...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden text-zinc-100">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-zinc-800/50 border-b bg-zinc-950/50 px-4 md:px-6 backdrop-blur-xl z-30">
        <div className="flex items-center gap-6">
          <Link href="/pos" className="text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-col relative">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
              <h1 className="text-xl font-black text-white uppercase leading-none tracking-tight">Table {tableNo}</h1>
            </div>
            <span className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] mt-1.5 ps-4">
              {activeOrderId ? `Order #${activeOrderId.slice(-6)}` : "Live Session"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-[200px] flex-col gap-2">
            <OfflineStatusBanner />
            {stockSnapshotUnavailable ? (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="size-4" />
                <AlertTitle className="text-xs">Stock mirror unavailable</AlertTitle>
                <AlertDescription className="text-xs">
                  Strict oversell is on but no cached availability exists. Reconnect once to refresh stock before
                  adding items.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="h-8 w-px bg-zinc-800 mx-2" />
          <div className="text-right">
            <div className="text-xs font-black text-white uppercase">{posUser?.name}</div>
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{posUser?.role}</div>
          </div>
        </div>
      </header>

      {/* 3-Column Layout: Stacks vertically on mobile, spreads horizontally on tablets and desktops */}
      <main className="flex flex-1 flex-col md:flex-row overflow-hidden relative min-h-0">
        {/* Sidebar Toggle Button (Floating on Border) - Only visible when side-by-side */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-50 hidden md:flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 shadow-xl hover:text-emerald-500 transition-all duration-300 active:scale-95",
            isSidebarCollapsed ? "left-[60px]" : "left-[268px]",
          )}
        >
          <ChevronLeft
            className={cn("h-5 w-5 transition-transform duration-300", isSidebarCollapsed ? "rotate-180" : "")}
          />
        </button>

        {/* Left: Nested Categories */}
        <aside
          className={cn(
            "shrink-0 bg-zinc-950 transition-all duration-300 relative",
            "hidden md:block", // Hide categories on mobile to save space
            isSidebarCollapsed ? "w-20" : "w-72",
          )}
        >
          <PosCategorySidebar
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={(id) => {
              setSelectedCategoryId(id);
              setSearch("");
            }}
            collapsed={isSidebarCollapsed}
          />
        </aside>

        {/* Middle: Product Selection */}
        <div className="flex-1 overflow-hidden relative min-h-0">
          <PosProductGrid
            items={items}
            selectedCategoryId={selectedCategoryId}
            categories={categories}
            search={search}
            onSearchChange={setSearch}
            onPickItem={handleSelectProduct}
            locked={orderLinesLocked}
            availabilityMap={availabilityMap}
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onBarcodeSubmit={handleBarcodeSubmit}
            barcodeBusy={barcodeBusy}
          />
        </div>

        {/* Check Ledger (Sidebar): Fixed height on mobile, full height on tablets/desktop */}
        <aside className="w-full md:w-[340px] xl:w-[380px] shrink-0 border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-950/40 backdrop-blur-xl flex flex-col h-[460px] md:h-full overflow-hidden">
          <PosCartSidebar
            cart={cart}
            items={items}
            locked={orderLinesLocked}
            bills={bills}
            onBump={setLineQuantity}
            onRemove={handleRemoveLine}
            onPay={() => setPaymentDialogOpen(true)}
            onSplitBill={() => {
              setStartPaymentWithSplit(true);
              setPaymentDialogOpen(true);
            }}
            onPreviewReceipt={() => setReceiptPreviewOpen(true)}
            onDiscount={() => setDiscountDialogOpen(true)}
            onSendToKitchen={sendToKitchen}
            onVoid={() => setVoidConfirmOpen(true)}
            onRefund={() => setRefundDialogOpen(true)}
            sendingToKitchen={sendingToKitchen}
            paying={paying}
            busy={deleting}
            activeOrderId={activeOrderId}
            availabilityMap={availabilityMap}
            stockDeductTrigger={accountingConfigQuery.data?.stockDeductTrigger}
            kitchenFlowMode={accountingConfigQuery.data?.kitchenFlowMode}
            userRole={posUser?.role}
            canPrintReceipt={canPrintReceipt}
            canSplitBill={canSplitBill}
          />
        </aside>
      </main>

      {/* Dialogs */}
      <PosReceiptPreviewDialog
        open={receiptPreviewOpen}
        onOpenChange={setReceiptPreviewOpen}
        cart={cart}
        items={items}
        bills={bills}
        tableNo={tableNo}
        staffName={posUser?.name}
        orderNumber={activeOrderId?.slice(-6)}
        onPrint={handlePrintReceipt}
        busy={printingReceipt}
      />

      {activeOrderId && (
        <PosPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={(open) => {
            setPaymentDialogOpen(open);
            if (!open) {
              setStartPaymentWithSplit(false);
            }
          }}
          orderId={activeOrderId}
          subtotals={{ usd: bills.totalUsd, lbp: bills.totalLbp }}
          onConfirm={handlePayment}
          busy={paying}
          startWithSplit={startPaymentWithSplit}
        />
      )}

      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply discount</DialogTitle>
            <DialogDescription>Bill-level manual discount for this check.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={discountType === "fixed" ? "default" : "outline"}
                onClick={() => setDiscountType("fixed")}
              >
                Fixed
              </Button>
              <Button
                type="button"
                variant={discountType === "percentage" ? "default" : "outline"}
                onClick={() => setDiscountType("percentage")}
              >
                %
              </Button>
            </div>
            <input
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              placeholder={discountType === "percentage" ? "e.g. 10" : "e.g. 5.00"}
              type="number"
              step="0.01"
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />
            <textarea
              value={discountReason}
              onChange={(event) => setDiscountReason(event.target.value)}
              placeholder="Reason"
              className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                Number(discountValue) <= 0 ||
                (accountingConfigQuery.data?.discountReasonRequired !== false &&
                  discountReason.trim().length === 0)
              }
              onClick={async () => {
                try {
                  await applyDiscount({
                    discountType,
                    discountValue: Number(discountValue),
                    reason: discountReason.trim(),
                    discountScope: "bill",
                  });
                  toast.success("Discount applied.");
                  setDiscountDialogOpen(false);
                  setDiscountValue("");
                  setDiscountReason("");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Failed to apply discount.",
                  );
                }
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={postSendVoidOpen} onOpenChange={setPostSendVoidOpen}>
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Reason required for sent item void</DialogTitle>
            <DialogDescription>
              Provide a reason with at least 3 characters before removing this sent line.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={postSendVoidReason}
            onChange={(event) => setPostSendVoidReason(event.target.value)}
            placeholder="Enter reason..."
            className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPostSendVoidOpen(false);
                setPostSendVoidLineId(null);
                setPostSendVoidReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={postSendVoidReason.trim().length < 3}
              onClick={() => void handleConfirmPostSendVoid()}
            >
              Void item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={comboDialogOpen} onOpenChange={setComboDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select combo components</DialogTitle>
            <DialogDescription>{comboTarget?.name || "Combo"}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            {(comboTarget?.slots || []).map((slot) => {
              const selectedMenuItemId = comboSelections[slot.name] || "";
              return (
                <div key={slot.name} className="rounded-lg border border-zinc-800 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-zinc-100">{slot.name}</div>
                    {slot.required ? (
                      <span className="text-[10px] uppercase tracking-widest text-amber-400">Required</span>
                    ) : null}
                  </div>
                  <Select
                    value={selectedMenuItemId}
                    onValueChange={(value: string) =>
                      setComboSelections((previous) => ({
                        ...previous,
                        [slot.name]: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {slot.items.map((entry) => {
                        const menuItem = comboMenuItems.get(String(entry.menuItemId));
                        return (
                          <SelectItem key={entry.menuItemId} value={String(entry.menuItemId)}>
                            {menuItem?.name || String(entry.menuItemId)}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComboDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSubmitCombo} onClick={handleConfirmCombo}>
              Add combo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modifierDialogOpen} onOpenChange={setModifierDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select modifiers</DialogTitle>
            <DialogDescription>
              {modifierTargetItem?.name || "Item"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            {(modifierTargetItem ? modifierGroupsByItem(modifierTargetItem) : []).map((group) => {
              const selected = modifierSelections[String(group._id)] || [];
              const maxSelections = Math.max(1, Number(group.maxSelections || 1));
              return (
                <div key={group._id} className="rounded-lg border border-zinc-800 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-zinc-100">
                      {group.name}
                    </div>
                    {group.required ? (
                      <span className="text-[10px] uppercase tracking-widest text-amber-400">Required</span>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {group.options.map((option) => {
                      const checked = selected.includes(option.name);
                      return (
                        <label key={option.name} className="flex items-center justify-between text-sm text-zinc-300">
                          <span>{option.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setModifierSelections((previous) => {
                                const current = previous[String(group._id)] || [];
                                if (checked) {
                                  return {
                                    ...previous,
                                    [String(group._id)]: current.filter((entry) => entry !== option.name),
                                  };
                                }
                                if (current.length >= maxSelections) return previous;
                                return {
                                  ...previous,
                                  [String(group._id)]: [...current, option.name],
                                };
                              });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-100">Note</div>
              <textarea
                value={modifierNote}
                onChange={(event) => setModifierNote(event.target.value)}
                className="min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                placeholder="Optional note..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifierDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSubmitModifiers} onClick={handleConfirmModifierItem}>
              Add to order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeOrderId && (
        <PosRefundDialog
          open={refundDialogOpen}
          onOpenChange={setRefundDialogOpen}
          orderId={activeOrderId}
          busy={deleting}
          onConfirm={handleRefund}
        />
      )}

      {/* Professional Void Confirmation Dialog */}
      <Dialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <DialogContent className="border-red-900/50 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-950/50 border border-red-500/20">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <DialogTitle className="text-center text-xl font-black text-zinc-50 uppercase tracking-tight">
              Void Entire Order?
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-zinc-400 mt-2">
              This will permanently cancel{" "}
              <span className="font-bold text-zinc-200">Order #{activeOrderId?.slice(-6)}</span> and remove all items
              from the check. This action <span className="font-bold text-red-400">cannot be undone</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex gap-3 sm:justify-center">
            <Button
              variant="ghost"
              className="flex-1 h-12 text-zinc-400 hover:text-white hover:bg-zinc-900 uppercase text-xs font-black tracking-widest"
              disabled={deleting}
              onClick={() => setVoidConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white uppercase text-xs font-black tracking-widest shadow-lg shadow-red-950/50 active:scale-[0.97] transition-all"
              disabled={deleting}
              onClick={() => void handleVoidOrder()}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Void Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
