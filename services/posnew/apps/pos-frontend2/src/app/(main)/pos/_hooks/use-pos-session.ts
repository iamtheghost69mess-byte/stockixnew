"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useInventoryPosPolicyQuery } from "@/hooks/use-inventory-pos-policy";
import {
  fetchInventoryMenuAvailability,
  menuInventoryAvailabilityQueryKey,
  normalizeInventoryBarcodeScan,
} from "@/lib/inventory-api";
import { posFetchAccountingConfig } from "@/lib/pos-accounting-api";
import { posApiJson } from "@/lib/pos-api-fetch";
import { calculateOrderBills } from "@/lib/pos-bill-utils";
import {
  type PosCategory,
  type PosMenuItem,
  type PosModifierGroup,
  type PosCombo,
  posFetchCombos,
  posFetchCategories,
  posFetchModifierGroups,
  posFetchMenuItems,
} from "@/lib/pos-catalog-api";
import { enqueueOfflineMutation } from "@/lib/offline-queue";
import {
  cloneMenuAvailabilityRows,
  readStockSnapshot,
  refreshStockSnapshotFromApi,
  resolvePosLocationId,
  stockSnapshotKey,
  writeStockSnapshot,
} from "@/lib/offline-stock-mirror";
import { persistPosCheckToServer } from "@/lib/pos-check-sync";
import { unitPriceForDocumentCurrency } from "@/lib/pos-menu-prices";
import {
  describeAccountingPostingFailures,
  describeFinanceSyncStatus,
  posApplyManualDiscount,
  posCreateSplitBill,
  posGetOpenOrderForTable,
  posMarkOrderPaid,
  posPatchOrderItems,
  posPaySplitBillSplit,
  posPrintOrder,
} from "@/lib/pos-order-api";
import { pickDefaultThermalReceiptPrinterId, posFetchPrinters } from "@/lib/pos-printer-api";
import { posQueryKeys } from "@/lib/pos-query-keys";
import { posFetchTableById } from "@/lib/pos-tables-api";
import { usePosAuthStore } from "@/stores/pos-auth-store";
import { usePosOrderStore } from "@/stores/pos-order-store";

type PosPaymentConfirmPayload = {
  method: "cash" | "card" | "manual";
  amountReceived?: number;
  reference?: string;
  note?: string;
  paymentData?: { amountReceived?: number; reference?: string; note?: string };
  paymentSplits?: { methodKey: string; amount: number }[];
  entitySplitBill?: boolean;
  splitBillRows?: { methodKey: string; amount: number }[];
};

export function usePosSession(tableId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const validId = /^[a-fA-F0-9]{24}$/.test(tableId);
  const posUser = usePosAuthStore((s) => s.user);

  const tableNo = usePosOrderStore((s) => s.tableNo);
  const cart = usePosOrderStore((s) => s.cart);
  const activeOrderId = usePosOrderStore((s) => s.activeOrderId);
  const orderLinesLocked = usePosOrderStore((s) => s.orderLinesLocked);
  const setTableContext = usePosOrderStore((s) => s.setTableContext);
  const clearSession = usePosOrderStore((s) => s.clearSession);
  const hydrateFromServerOrder = usePosOrderStore((s) => s.hydrateFromServerOrder);
  const addMenuItem = usePosOrderStore((s) => s.addMenuItem);
  const removeLine = usePosOrderStore((s) => s.removeLine);
  const replaceCartFromPopulatedOrder = usePosOrderStore((s) => s.replaceCartFromPopulatedOrder);

  const [ready, setReady] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [categories, setCategories] = useState<PosCategory[]>([]);
  const [items, setItems] = useState<PosMenuItem[]>([]);
  const [paying, setPaying] = useState(false);
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [modifierGroups, setModifierGroups] = useState<PosModifierGroup[]>([]);
  const [combos, setCombos] = useState<PosCombo[]>([]);

  const [barcode, setBarcode] = useState("");
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [offlineAvailabilityRows, setOfflineAvailabilityRows] = useState<
    import("@/lib/inventory-api").MenuAvailabilityRow[] | null
  >(null);
  const [offlineSnapshotChecked, setOfflineSnapshotChecked] = useState(true);
  const offlinePortionLedgerRef = useRef<Map<string, number>>(new Map());
  const posLocationId = useMemo(() => resolvePosLocationId(posUser), [posUser]);
  const waiterCanPrintReceipt =
    typeof posUser?.location === "object" &&
    posUser.location !== null &&
    "waiterCanPrintReceipt" in posUser.location
      ? Boolean((posUser.location as { waiterCanPrintReceipt?: boolean }).waiterCanPrintReceipt)
      : false;
  const canPrintReceipt =
    String(posUser?.role || "").toLowerCase() !== "waiter" || waiterCanPrintReceipt;

  const policyQuery = useInventoryPosPolicyQuery({ enabled: validId });
  const accountingConfigQuery = useQuery({
    queryKey: posQueryKeys.accountingConfig(),
    queryFn: posFetchAccountingConfig,
    enabled: validId,
  });

  const availabilityQuery = useQuery({
    queryKey: menuInventoryAvailabilityQueryKey(posLocationId),
    queryFn: async () => {
      const res = await fetchInventoryMenuAvailability(
        posLocationId ? { locationId: posLocationId } : undefined,
      );
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      if (typeof window !== "undefined" && navigator.onLine) {
        await writeStockSnapshot({
          locationId: res.data?.locationId
            ? String(res.data.locationId)
            : stockSnapshotKey(posLocationId),
          fetchedAt: Date.now(),
          strictOversell: policyQuery.data?.strictOversell ?? false,
          menuAvailability: cloneMenuAvailabilityRows(items),
        });
      }
      return items;
    },
    enabled: validId && Boolean(posUser),
    staleTime: 15_000,
  });

  const isOffline = typeof window !== "undefined" && !navigator.onLine;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadOfflineSnapshot = async () => {
      if (navigator.onLine) {
        setOfflineAvailabilityRows(null);
        offlinePortionLedgerRef.current.clear();
        setOfflineSnapshotChecked(true);
        return;
      }
      setOfflineSnapshotChecked(false);
      const snap = await readStockSnapshot(posLocationId);
      if (snap?.menuAvailability?.length) {
        setOfflineAvailabilityRows(cloneMenuAvailabilityRows(snap.menuAvailability));
        offlinePortionLedgerRef.current.clear();
      } else {
        setOfflineAvailabilityRows([]);
      }
      setOfflineSnapshotChecked(true);
    };
    void loadOfflineSnapshot();
    const onOffline = () => {
      void loadOfflineSnapshot();
    };
    const onOnline = () => {
      void refreshStockSnapshotFromApi({
        locationId: posLocationId,
        strictOversell: policyQuery.data?.strictOversell,
      }).catch(() => undefined);
      setOfflineAvailabilityRows(null);
      offlinePortionLedgerRef.current.clear();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [posLocationId, policyQuery.data?.strictOversell]);

  const fxQuery = useQuery({
    queryKey: posQueryKeys.fxRate("USD", "LBP"),
    queryFn: async () => {
      const res = await posApiJson<{ rate: number }>("/api/accounting/fx/resolve?from=USD&to=LBP");
      return res.data?.rate ?? 0;
    },
    enabled: validId,
    staleTime: 60_000,
  });

  const availabilityRows = isOffline ? offlineAvailabilityRows : availabilityQuery.data;

  const stockSnapshotUnavailable = Boolean(
    isOffline &&
      offlineSnapshotChecked &&
      policyQuery.data?.strictOversell &&
      (!offlineAvailabilityRows || offlineAvailabilityRows.length === 0),
  );

  const getAvailabilityForMenuItem = useCallback(
    (menuItemId: string) => {
      const row = (availabilityRows ?? []).find((r) => String(r.menuItemId) === String(menuItemId));
      if (!row) return undefined;
      const ledgerPortions = offlinePortionLedgerRef.current.get(String(menuItemId));
      const estimatedPortions =
        ledgerPortions !== undefined ? ledgerPortions : (row.estimatedPortions ?? null);
      const canFulfill =
        ledgerPortions !== undefined
          ? estimatedPortions == null || estimatedPortions > 0
            ? row.canFulfill || (estimatedPortions ?? 0) > 0
            : false
          : !!row.canFulfill;
      return {
        canFulfill,
        estimatedPortions,
        reason: row.reason,
      };
    },
    [availabilityRows],
  );

  const availabilityMap = useMemo(() => {
    const rows = availabilityRows ?? [];
    const next = new Map<string, { canFulfill: boolean; estimatedPortions?: number | null; reason?: string }>();
    for (const row of rows) {
      const entry = getAvailabilityForMenuItem(String(row.menuItemId));
      if (entry) {
        next.set(String(row.menuItemId), entry);
      }
    }
    return next;
  }, [availabilityRows, getAvailabilityForMenuItem]);

  const applyOfflinePortionDebit = useCallback(
    (menuItemId: string, quantityDelta: number) => {
      if (!isOffline || quantityDelta <= 0) return;
      const current = getAvailabilityForMenuItem(menuItemId);
      if (!current || current.estimatedPortions == null) return;
      const base =
        offlinePortionLedgerRef.current.get(menuItemId) ?? current.estimatedPortions;
      offlinePortionLedgerRef.current.set(menuItemId, Math.max(0, base - quantityDelta));
    },
    [getAvailabilityForMenuItem, isOffline],
  );

  const taxRates = accountingConfigQuery.data?.taxRates ?? [];
  const serviceChargeEnabled = accountingConfigQuery.data?.serviceChargeEnabled === true;
  const serviceChargeRate = Number(accountingConfigQuery.data?.serviceChargeRate ?? 0);
  const bills = useMemo(
    () => calculateOrderBills(cart, items, taxRates, { enabled: serviceChargeEnabled, rate: serviceChargeRate }, fxQuery.data),
    [cart, items, taxRates, serviceChargeEnabled, serviceChargeRate, fxQuery.data],
  );

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;

    (async () => {
      setReady(false);
      try {
        const table = await posFetchTableById(tableId);
        if (cancelled) return;
        setTableContext(String(table._id), Number(table.tableNo) || 0);

        const openRes = await posGetOpenOrderForTable(tableId);
        if (cancelled) return;
        hydrateFromServerOrder(openRes.data ?? null);

        const [cats, menu, modifierRows, comboRows] = await Promise.all([
          posFetchCategories(),
          posFetchMenuItems({ available: true, showOnPOS: true }),
          posFetchModifierGroups(),
          posFetchCombos(),
        ]);
        if (cancelled) return;

        setCategories(Array.isArray(cats) ? cats : []);
        setItems(menu);
        setModifierGroups(Array.isArray(modifierRows) ? modifierRows : []);
        setCombos(Array.isArray(comboRows) ? comboRows : []);
        if (typeof window !== "undefined" && navigator.onLine) {
          void refreshStockSnapshotFromApi({
            locationId: resolvePosLocationId(posUser),
            strictOversell: policyQuery.data?.strictOversell,
          }).catch(() => undefined);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Initialization failed.");
          router.replace("/pos");
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearSession();
    };
  }, [tableId, validId, router, hydrateFromServerOrder, setTableContext, posUser, policyQuery.data?.strictOversell, clearSession]);

  const storeSetLineQuantity = usePosOrderStore((s) => s.setLineQuantity);
  const setLineQuantity = useCallback(
    (lineId: string, quantity: number) => {
      if (orderLinesLocked) return;

      const line = cart.find((c) => c.id === lineId);
      if (!line) return;

      if (stockSnapshotUnavailable) {
        toast.error("Stock data unavailable offline. Reconnect to refresh availability.");
        return;
      }

      // Inventory Check for quantity increase
      if (quantity > line.quantity) {
        const avail = getAvailabilityForMenuItem(String(line.menuItem));
        const isStrict = policyQuery.data?.strictOversell;
        if (isStrict && avail && avail.estimatedPortions != null && quantity > avail.estimatedPortions) {
          toast.error(`Cannot add more "${line.name}". Only ${avail.estimatedPortions} portions available.`);
          return;
        }
        if (isOffline && isStrict) {
          applyOfflinePortionDebit(String(line.menuItem), quantity - line.quantity);
        }
      }

      storeSetLineQuantity(lineId, quantity);
    },
    [
      cart,
      orderLinesLocked,
      getAvailabilityForMenuItem,
      policyQuery.data,
      storeSetLineQuantity,
      stockSnapshotUnavailable,
      isOffline,
      applyOfflinePortionDebit,
    ],
  );

  const removeLineWithReason = useCallback(
    async (lineId: string, reason?: string) => {
      if (orderLinesLocked) return;
      const line = cart.find((entry) => entry.id === lineId);
      if (!line) return;
      const lineStatus = String(line.status || "").toLowerCase();
      const needsReason = lineStatus === "sent";
      if (needsReason && (!reason || reason.trim().length < 3)) {
        throw new Error("Reason is required for post-send void.");
      }
      const nextCart = cart.filter((entry) => entry.id !== lineId);
      if (activeOrderId) {
        const response = await posPatchOrderItems(activeOrderId, nextCart, {
          reason: needsReason ? reason?.trim() : undefined,
        });
        if (response.data && typeof response.data === "object") {
          replaceCartFromPopulatedOrder(response.data);
          return;
        }
      }
      removeLine(lineId);
    },
    [activeOrderId, cart, orderLinesLocked, removeLine, replaceCartFromPopulatedOrder],
  );

  const pickItem = useCallback(
    (
      it: PosMenuItem,
      payload?: {
        note?: string;
        selectedModifiers?: {
          groupId?: string;
          groupName?: string;
          selectedOptions?: { name: string; priceAdjustment?: number }[];
        }[];
        itemType?: "menu_item" | "combo";
        comboId?: string | null;
        comboName?: string;
        comboPrice?: number | null;
        selectedSlots?: { slotName: string; menuItemId: string; menuItemName: string }[];
      },
    ) => {
      if (orderLinesLocked) return;

      if (stockSnapshotUnavailable) {
        toast.error("Stock data unavailable offline. Reconnect to refresh availability.");
        return;
      }

      // Inventory Policy Check (Strict Oversell)
      const avail = getAvailabilityForMenuItem(String(it._id));
      const isStrict = policyQuery.data?.strictOversell;
      if (isStrict && avail && !avail.canFulfill) {
        toast.error(`"${it.name}" is out of stock (${avail.reason || "Sold Out"}).`);
        return;
      }
      if (isOffline && isStrict) {
        applyOfflinePortionDebit(String(it._id), 1);
      }

      const price = unitPriceForDocumentCurrency(it, "USD");
      const modifierAdjustment = (payload?.selectedModifiers || []).reduce((sum, group) => {
        const options = Array.isArray(group.selectedOptions) ? group.selectedOptions : [];
        return (
          sum +
          options.reduce(
            (groupSum, option) => groupSum + Number(option.priceAdjustment || 0),
            0
          )
        );
      }, 0);
      addMenuItem({
        menuItemId: String(it._id),
        name: it.name || "Item",
        pricePerQuantity:
          payload?.itemType === "combo"
            ? Number(payload.comboPrice ?? price)
            : price + modifierAdjustment,
        note: payload?.note,
        selectedModifiers: payload?.selectedModifiers,
        itemType: payload?.itemType,
        comboId: payload?.comboId,
        comboName: payload?.comboName,
        comboPrice: payload?.comboPrice,
        selectedSlots: payload?.selectedSlots,
      });
    },
    [
      addMenuItem,
      orderLinesLocked,
      getAvailabilityForMenuItem,
      policyQuery.data,
      stockSnapshotUnavailable,
      isOffline,
      applyOfflinePortionDebit,
    ],
  );

  const handleBarcodeSubmit = useCallback(
    async (code: string) => {
      const q = code.trim();
      if (!q || barcodeBusy) return;
      setBarcodeBusy(true);
      try {
        const result = await normalizeInventoryBarcodeScan(q);
        if (result.kind === "menu_item_variant") {
          const rawMi = result.raw?.menuItem;
          const targetId = typeof rawMi === "string" ? rawMi : rawMi?._id;

          if (targetId) {
            const it = items.find((i) => String(i._id) === String(targetId));
            if (it) pickItem(it);
            else toast.error("Item not found in current catalog.");
          } else {
            toast.error("This barcode is not linked to a menu item.");
          }
        } else {
          toast.error("Scanning ingredient directly is not allowed in POS sales.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Barcode scan failed.");
      } finally {
        setBarcodeBusy(false);
        setBarcode("");
      }
    },
    [items, barcodeBusy, pickItem],
  );

  const sendToKitchen = useCallback(async () => {
    if (cart.length === 0 || sendingToKitchen) return;

    // Pre-flight Inventory Check
    if (stockSnapshotUnavailable) {
      toast.error("Stock data unavailable offline. Reconnect to refresh availability.");
      return;
    }

    const isStrict = policyQuery.data?.strictOversell;
    if (isStrict) {
      for (const line of cart) {
        // Only check lines that are not already locked/sent
        const avail = getAvailabilityForMenuItem(String(line.menuItem));
        if (avail && !avail.canFulfill) {
          toast.error(`"${line.name}" is now out of stock. Please remove it before sending.`);
          return;
        }
        if (avail && avail.estimatedPortions != null && line.quantity > avail.estimatedPortions) {
          toast.error(`Only ${avail.estimatedPortions} portions of "${line.name}" remaining. Please adjust quantity.`);
          return;
        }
      }
    }

    setSendingToKitchen(true);
    try {
      // 1. Ensure order is persisted (created on server if needed) before firing
      let targetId = activeOrderId;
      if (!targetId) {
        await persistPosCheckToServer();
        targetId = usePosOrderStore.getState().activeOrderId;
      }

      if (!targetId) throw new Error("Could not initialize order for kitchen send.");

      const printRes = await posPrintOrder(targetId, { type: "kitchen" });
      if (printRes.data && typeof printRes.data === "object") {
        replaceCartFromPopulatedOrder(printRes.data);
      }
      toast.success("Order sent to kitchen.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send to kitchen.");
    } finally {
      setSendingToKitchen(false);
    }
  }, [
    activeOrderId, 
    cart, 
    sendingToKitchen, 
    policyQuery.data, 
    replaceCartFromPopulatedOrder, stockSnapshotUnavailable, getAvailabilityForMenuItem
  ]);

  const handlePayment = useCallback(
    async (payload: PosPaymentConfirmPayload) => {
      if (cart.length === 0 || paying) return;
      setPaying(true);
      try {
        // Ensure order is persisted before payment
        let targetId = activeOrderId;
        if (!targetId) {
          await persistPosCheckToServer();
          // The store should be updated now
          targetId = usePosOrderStore.getState().activeOrderId;
        }

        if (!targetId) throw new Error("Could not initialize order for payment.");

        const queueOfflinePayment = async () => {
          await enqueueOfflineMutation(
            "pay_order",
            {
              orderId: targetId,
              paymentMethod: payload.method,
              paymentData: payload.paymentData,
              paymentSplits: payload.paymentSplits,
            },
            `pay:${targetId}`,
          );
          toast.success("Payment queued — will sync when back online.");
          clearSession();
          router.replace("/pos");
        };

        if (typeof window !== "undefined" && !navigator.onLine) {
          if (payload.entitySplitBill) {
            throw new Error("Split-bill payment requires an internet connection.");
          }
          await queueOfflinePayment();
          return;
        }

        if (payload.entitySplitBill && payload.splitBillRows?.length) {
          const sum = payload.splitBillRows.reduce((s, row) => s + row.amount, 0);
          if (Math.abs(sum - bills.totalUsd) > 0.02) {
            throw new Error(
              `Split total (${sum.toFixed(2)}) must match check total (${bills.totalUsd.toFixed(2)}).`,
            );
          }
          const createRes = await posCreateSplitBill({
            orderId: targetId,
            method: "custom",
            splits: payload.splitBillRows.map((row, idx) => ({
              label: row.methodKey.trim() || `Guest ${idx + 1}`,
              amount: row.amount,
            })),
          });
          const doc = createRes.data;
          if (!doc?._id || !Array.isArray(doc.splits)) {
            throw new Error("Invalid split bill response from server.");
          }
          for (const sp of doc.splits) {
            const amt = Number(sp.amount);
            if (!Number.isFinite(amt) || amt <= 0) continue;
            await posPaySplitBillSplit(doc._id, String(sp._id), {
              amount: amt,
              paymentMethod: payload.method,
            });
          }
          const paidRes = await posMarkOrderPaid(targetId, payload.method, {
            paymentData: payload.paymentData,
          });
          const postingMsgs = [
            ...describeAccountingPostingFailures(paidRes.accountingPosting),
            describeFinanceSyncStatus(paidRes.accountingPosting),
          ].filter((m): m is string => Boolean(m));
          toast.success("Payment successful. Order closed.");
          for (const msg of postingMsgs) {
            toast.message(msg);
          }
        } else {
          const paidRes = await posMarkOrderPaid(targetId, payload.method, {
            paymentData: payload.paymentData,
            paymentSplits: payload.paymentSplits,
          });
          const postingMsgs = [
            ...describeAccountingPostingFailures(paidRes.accountingPosting),
            describeFinanceSyncStatus(paidRes.accountingPosting),
          ].filter((m): m is string => Boolean(m));
          toast.success("Payment successful. Order closed.");
          for (const msg of postingMsgs) {
            toast.message(msg);
          }
        }
        clearSession();
        router.replace("/pos");
      } catch (e) {
        if (
          typeof window !== "undefined"
          && !navigator.onLine
          && activeOrderId
          && !payload.entitySplitBill
        ) {
          try {
            await enqueueOfflineMutation(
              "pay_order",
              {
                orderId: activeOrderId,
                paymentMethod: payload.method,
                paymentData: payload.paymentData,
                paymentSplits: payload.paymentSplits,
              },
              `pay:${activeOrderId}`,
            );
            toast.success("Payment queued — will sync when back online.");
            clearSession();
            router.replace("/pos");
            return;
          } catch {
            /* fall through */
          }
        }
        toast.error(e instanceof Error ? e.message : "Payment failed.");
      } finally {
        setPaying(false);
      }
    },
    [activeOrderId, bills.totalUsd, cart.length, paying, clearSession, router],
  );

  const handlePrintReceipt = useCallback(async () => {
    if (!activeOrderId || printingReceipt) return;
    if (!canPrintReceipt) {
      toast.error("Receipt printing is disabled for waiters in this branch.");
      return;
    }
    setPrintingReceipt(true);
    try {
      const listRes = await posFetchPrinters();
      const printers = Array.isArray(listRes.data) ? listRes.data : [];
      const printerId = pickDefaultThermalReceiptPrinterId(printers);
      if (!printerId) {
        toast.error("Add a network, ePOS, or Bluetooth printer in Studio (Printers) to print receipts.");
        return;
      }
      await posPrintOrder(activeOrderId, { type: "receipt", printerId });
      toast.success("Receipt sent to printer.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to print receipt.");
    } finally {
      setPrintingReceipt(false);
    }
  }, [activeOrderId, canPrintReceipt, printingReceipt]);

  const applyDiscount = useCallback(
    async (payload: {
      discountType: "percentage" | "fixed";
      discountValue: number;
      reason?: string;
      discountScope?: "bill" | "item";
      itemId?: string;
    }) => {
      if (!activeOrderId) throw new Error("No active order.");
      const response = await posApplyManualDiscount(activeOrderId, payload);
      if (response.data && typeof response.data === "object") {
        replaceCartFromPopulatedOrder(response.data);
      }
      await queryClient.invalidateQueries({
        queryKey: posQueryKeys.orders.openForTable(tableId),
      });
      return response.data ?? null;
    },
    [activeOrderId, queryClient, replaceCartFromPopulatedOrder, tableId],
  );

  return {
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
    removeLine,
    removeLineWithReason,
    paying,
    setPaying,
    handlePayment,
    handlePrintReceipt,
    printingReceipt,
    sendToKitchen,
    sendingToKitchen,
    hydrateFromServerOrder,
    availabilityMap,
    stockSnapshotUnavailable,
    barcode,
    setBarcode,
    barcodeBusy,
    handleBarcodeSubmit,
    policy: policyQuery.data,
    accountingConfigQuery,
    canPrintReceipt,
    applyDiscount,
  };
}
