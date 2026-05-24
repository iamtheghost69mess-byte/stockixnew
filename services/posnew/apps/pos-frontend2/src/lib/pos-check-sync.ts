import {
  enqueueOfflineMutation,
  listOfflineMutations,
  markOfflineMutationAttempt,
  type OfflineMutation,
  removeOfflineMutation,
} from "@/lib/offline-queue";
import {
  posCreateOrder,
  posMarkOrderPaid,
  posPatchOrderItems,
  posPatchOrderReplaceLines,
} from "@/lib/pos-order-api";
import { adjustInventory, type InventoryAdjustParams } from "@/lib/inventory-api";
import { cartToReplaceLines, usePosOrderStore } from "@/stores/pos-order-store";

let lastSentPayloadStr = "";

/** Push local cart to the server (create order or replace lines). Caller should debounce. */
export async function persistPosCheckToServer(): Promise<void> {
  const { tableId, activeOrderId, cart, orderLinesLocked, replaceCartFromPopulatedOrder } = usePosOrderStore.getState();
  if (!tableId || orderLinesLocked) return;

  if (!activeOrderId) {
    if (!cart.length) return;
    const bodyArgs = {
      table: tableId,
      items: cart.map((c) => ({
        menuItem: c.menuItem,
        quantity: c.quantity,
        note: c.note || "",
        name: c.name,
        pricePerQuantity: c.pricePerQuantity,
        price: c.price,
        status: "pending" as const,
      })),
    };
    const signature = JSON.stringify(bodyArgs.items);
    if (signature === lastSentPayloadStr) return;
    lastSentPayloadStr = signature;

    if (typeof window !== "undefined" && !navigator.onLine) {
      await enqueueOfflineMutation("create_order", bodyArgs as Record<string, unknown>, `create:${tableId}`);
      return;
    }

    try {
      const res = await posCreateOrder(bodyArgs);
      if (res.data && typeof res.data === "object") {
        replaceCartFromPopulatedOrder(res.data);
      }
      return;
    } catch {
      await enqueueOfflineMutation("create_order", bodyArgs as Record<string, unknown>, `create:${tableId}`);
      return;
    }
  }

  const patchSignature = JSON.stringify(cartToReplaceLines(cart));
  if (patchSignature === lastSentPayloadStr) return;
  lastSentPayloadStr = patchSignature;

  if (typeof window !== "undefined" && !navigator.onLine) {
    await enqueueOfflineMutation(
      "patch_order_items",
      { orderId: activeOrderId, replaceLines: cartToReplaceLines(cart) },
      `patch:${activeOrderId}`,
    );
    return;
  }

  try {
    const res = await posPatchOrderItems(activeOrderId, cart);
    if (res.data && typeof res.data === "object") {
      replaceCartFromPopulatedOrder(res.data);
    }
  } catch {
    await enqueueOfflineMutation(
      "patch_order_items",
      { orderId: activeOrderId, replaceLines: cartToReplaceLines(cart) },
      `patch:${activeOrderId}`,
    );
  }
}

async function processMutation(mutation: OfflineMutation): Promise<void> {
  if (mutation.kind === "create_order") {
    await posCreateOrder(mutation.payload as Parameters<typeof posCreateOrder>[0]);
    return;
  }

  if (mutation.kind === "pay_order") {
    const { orderId, paymentMethod, paymentData, paymentSplits } = mutation.payload as {
      orderId?: string;
      paymentMethod?: string;
      paymentData?: { amountReceived?: number; reference?: string; note?: string };
      paymentSplits?: { methodKey: string; amount: number }[];
    };
    if (!orderId || !paymentMethod) {
      throw new Error("Invalid offline pay_order payload");
    }
    await posMarkOrderPaid(orderId, paymentMethod, {
      paymentData,
      paymentSplits,
    });
    return;
  }

  if (mutation.kind === "patch_order_items") {
    const { orderId, replaceLines } = mutation.payload as {
      orderId?: string;
      replaceLines?: unknown[];
    };
    if (!orderId || !Array.isArray(replaceLines)) {
      throw new Error("Invalid offline patch payload");
    }
    await posPatchOrderReplaceLines(orderId, replaceLines as any[]);
    return;
  }

  if (mutation.kind === "inventory_adjust") {
    const payload = mutation.payload as InventoryAdjustParams;
    if (!payload?.ingredientId || payload.quantityDelta === undefined) {
      throw new Error("Invalid offline inventory_adjust payload");
    }
    await adjustInventory(payload);
    return;
  }
}

export async function flushOfflineMutationQueue(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const pending = await listOfflineMutations(100);
  for (const mutation of pending) {
    try {
      await processMutation(mutation);
      await removeOfflineMutation(mutation.id);
    } catch {
      await markOfflineMutationAttempt(mutation.id);
    }
  }
}
