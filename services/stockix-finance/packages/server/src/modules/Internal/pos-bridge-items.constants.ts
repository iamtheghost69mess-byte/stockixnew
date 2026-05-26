/** Stable SKU codes for POS → Finance receipt adjustment lines (seeded per tenant). */
export const POS_BRIDGE_ITEM_CODES = {
  SERVICE_CHARGE: 'POS-SERVICE-CHARGE',
  ORDER_DISCOUNT: 'POS-ORDER-DISCOUNT',
} as const;

export const POS_BRIDGE_ITEM_NAMES = {
  SERVICE_CHARGE: 'POS Service Charge',
  ORDER_DISCOUNT: 'POS Order Discount',
} as const;
