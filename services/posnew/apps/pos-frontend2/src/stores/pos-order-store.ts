import { create } from "zustand";

import { type MenuItemLike, unitPriceForDocumentCurrency } from "@/lib/pos-menu-prices";

export type PosCartLine = {
  id: string;
  menuItem: string;
  name: string;
  pricePerQuantity: number;
  quantity: number;
  price: number;
  note?: string;
  status?: "pending" | "sent" | "ready" | "served" | "void";
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
};

type PosOrderState = {
  tableId: string | null;
  tableNo: number | null;
  activeOrderId: string | null;
  orderLinesLocked: boolean;
  cart: PosCartLine[];
  setTableContext: (tableId: string, tableNo: number) => void;
  clearSession: () => void;
  setCart: (lines: PosCartLine[]) => void;
  setActiveOrderId: (id: string | null) => void;
  setOrderLinesLocked: (locked: boolean) => void;
  hydrateFromServerOrder: (order: unknown) => void;
  addMenuItem: (payload: {
    menuItemId: string;
    name: string;
    pricePerQuantity: number;
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
  }) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  replaceCartFromPopulatedOrder: (order: unknown) => void;
};

function isPersistedMongoLineId(id: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(id) && id.length === 24;
}

export function cartToReplaceLines(cart: PosCartLine[]) {
  return cart.map((c) => {
    const row: Record<string, unknown> = {
      menuItem: c.menuItem,
      quantity: c.quantity,
      note: c.note || "",
      name: c.name,
      pricePerQuantity: c.pricePerQuantity,
      price: c.price,
      status: c.status ?? "pending",
      selectedModifiers: Array.isArray(c.selectedModifiers) ? c.selectedModifiers : [],
      itemType: c.itemType || "menu_item",
      comboId: c.comboId || null,
      comboName: c.comboName || "",
      comboPrice: c.comboPrice ?? null,
      selectedSlots: Array.isArray(c.selectedSlots) ? c.selectedSlots : [],
    };
    if (isPersistedMongoLineId(String(c.id))) {
      row._id = String(c.id);
    }
    return row;
  });
}

function lineFromServerItem(line: Record<string, unknown>): PosCartLine | null {
  const mi = line.menuItem;
  const unit =
    mi && typeof mi === "object" && mi !== null
      ? unitPriceForDocumentCurrency(mi as MenuItemLike, "USD")
      : Number(line.pricePerQuantity || 0);
  const qty = Math.max(1, Number(line.quantity || 1));
  const idRaw = line._id;
  const id =
    idRaw != null && String(idRaw)
      ? String(idRaw)
      : `t-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const menuItemId =
    mi && typeof mi === "object" && mi !== null && "_id" in mi
      ? String((mi as { _id?: unknown })._id)
      : String(mi ?? "");
  if (!menuItemId || !/^[a-fA-F0-9]{24}$/.test(menuItemId)) return null;
  const name =
    mi && typeof mi === "object" && mi !== null && "name" in mi && typeof (mi as { name?: unknown }).name === "string"
      ? (mi as { name: string }).name
      : typeof line.name === "string"
        ? line.name
        : "Item";
  return {
    id,
    menuItem: menuItemId,
    name,
    pricePerQuantity: unit,
    quantity: qty,
    price: unit * qty,
    note: typeof line.note === "string" ? line.note : "",
    status:
      typeof line.status === "string"
        ? (line.status as PosCartLine["status"])
        : "pending",
    selectedModifiers: Array.isArray(line.selectedModifiers)
      ? (line.selectedModifiers as PosCartLine["selectedModifiers"])
      : [],
    itemType:
      typeof line.itemType === "string"
        ? (line.itemType as PosCartLine["itemType"])
        : "menu_item",
    comboId: typeof line.comboId === "string" ? line.comboId : null,
    comboName: typeof line.comboName === "string" ? line.comboName : "",
    comboPrice: line.comboPrice != null ? Number(line.comboPrice) : null,
    selectedSlots: Array.isArray(line.selectedSlots)
      ? (line.selectedSlots as PosCartLine["selectedSlots"])
      : [],
  };
}

export const usePosOrderStore = create<PosOrderState>((set, get) => ({
  tableId: null,
  tableNo: null,
  activeOrderId: null,
  orderLinesLocked: false,
  cart: [],

  setTableContext: (tableId, tableNo) => set({ tableId, tableNo }),

  clearSession: () =>
    set({
      tableId: null,
      tableNo: null,
      activeOrderId: null,
      orderLinesLocked: false,
      cart: [],
    }),

  setCart: (cart) => set({ cart }),

  setActiveOrderId: (activeOrderId) => set({ activeOrderId }),

  setOrderLinesLocked: (orderLinesLocked) => set({ orderLinesLocked }),

  hydrateFromServerOrder: (order) => {
    if (!order || typeof order !== "object") {
      set({ activeOrderId: null, orderLinesLocked: false, cart: [] });
      return;
    }
    const o = order as Record<string, unknown>;
    const oid = o._id != null ? String(o._id) : null;
    const ost = String(o.orderStatus || "")
      .toLowerCase()
      .trim();
    const locked = ["paid", "cancelled"].includes(ost);
    const items = Array.isArray(o.items) ? o.items : [];
    const cart: PosCartLine[] = [];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const line = lineFromServerItem(it as Record<string, unknown>);
      if (line) cart.push(line);
    }
    set({
      activeOrderId: oid,
      orderLinesLocked: locked,
      cart,
    });
  },

  replaceCartFromPopulatedOrder: (order) => {
    get().hydrateFromServerOrder(order);
  },

  addMenuItem: ({
    menuItemId,
    name,
    pricePerQuantity,
    note,
    selectedModifiers,
    itemType,
    comboId,
    comboName,
    comboPrice,
    selectedSlots,
  }) => {
    const unit = Math.max(0, Number(pricePerQuantity) || 0);
    const s = get();
    const normalizedNote = note?.trim() || "";
    const normalizedModifiers = Array.isArray(selectedModifiers) ? selectedModifiers : [];
    const normalizedItemType = itemType || "menu_item";
    const normalizedComboId = comboId || null;
    const modifiersSignature = JSON.stringify(normalizedModifiers);

    // Try to find an existing line with the same menuItem and NO note
    const existingIndex = s.cart.findIndex(
      (c) =>
        c.menuItem === menuItemId &&
        (c.itemType || "menu_item") === normalizedItemType &&
        (c.comboId || null) === normalizedComboId &&
        (c.note || "").trim() === normalizedNote &&
        JSON.stringify(Array.isArray(c.selectedModifiers) ? c.selectedModifiers : []) === modifiersSignature
    );

    if (existingIndex > -1) {
      const existing = s.cart[existingIndex];
      const newQty = existing.quantity + 1;
      const updatedCart = [...s.cart];
      updatedCart[existingIndex] = {
        ...existing,
        quantity: newQty,
        price: existing.pricePerQuantity * newQty,
      };
      set({ cart: updatedCart });
    } else {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? `t-${crypto.randomUUID()}`
          : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      set((s) => ({
        cart: [
          ...s.cart,
          {
            id,
            menuItem: menuItemId,
            name,
            pricePerQuantity: unit,
            quantity: 1,
            price: unit,
            note: normalizedNote,
            status: "pending",
            selectedModifiers: normalizedModifiers,
            itemType: normalizedItemType,
            comboId: normalizedComboId,
            comboName: comboName || "",
            comboPrice: comboPrice ?? null,
            selectedSlots: Array.isArray(selectedSlots) ? selectedSlots : [],
          },
        ],
      }));
    }
  },

  setLineQuantity: (lineId, quantity) => {
    const q = Math.max(1, Math.floor(Number(quantity) || 1));
    set((s) => ({
      cart: s.cart.map((c) => (c.id === lineId ? { ...c, quantity: q, price: c.pricePerQuantity * q } : c)),
    }));
  },

  removeLine: (lineId) =>
    set((s) => ({
      cart: s.cart.filter((c) => c.id !== lineId),
    })),
}));
