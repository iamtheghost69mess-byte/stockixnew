export const posQueryKeys = {
  tables: (locationId: string | null) => ["pos", "tables", locationId ?? "none"] as const,
  orders: {
    all: () => ["pos", "orders"] as const,
    openForTable: (tableId: string) => ["pos", "orders", "open-for-table", tableId] as const,
    openAdmin: (tableId: string) => ["pos", "orders", "open-admin", tableId] as const,
    openPreview: (tableId: string) => ["pos", "orders", "open-preview", tableId] as const,
  },
  kitchenOrders: () => ["pos", "kitchen-orders"] as const,
  accountingConfig: () => ["pos", "accounting-config"] as const,
  fxRate: (from: string, to: string) => ["pos", "fx-rate", from, to] as const,
  menuCategories: () => ["pos", "menu-categories"] as const,
  menuItems: () => ["pos", "menu-items"] as const,
  inventory: () => ["pos", "inventory"] as const,
  menuInventoryAvailability: (locationId: string) =>
    ["pos", "menu-inventory-availability", locationId || "default"] as const,
  inventoryPolicy: () => ["pos", "inventory-pos-policy"] as const,
};
