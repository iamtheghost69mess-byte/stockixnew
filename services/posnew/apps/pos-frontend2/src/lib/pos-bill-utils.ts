import type { PosCartLine } from "@/stores/pos-order-store";

export interface BillTaxLine {
  code: string;
  name: string;
  rate: number;
  amountUsd: number;
  amountLbp: number;
}

export interface BillBreakdown {
  subtotalUsd: number;
  subtotalLbp: number;
  taxUsd: number;
  taxLbp: number;
  serviceChargeUsd: number;
  serviceChargeLbp: number;
  serviceChargeRate: number;
  totalUsd: number;
  totalLbp: number;
  /** totalUsd alias for API compatibility */
  totalWithTax: number;
  taxRate: number; // Total effective rate
  taxes: BillTaxLine[];
}

/**
 * Calculates the bills for an order based on cart items and tax configuration.
 * Sums up both USD and LBP prices if available.
 */
export function calculateOrderBills(
  cart: PosCartLine[],
  items: { _id: string; priceUsd?: number | null; priceLbp?: number | null }[],
  taxRates: { code?: string; name?: string; rate?: number }[],
  serviceChargeConfig?: { enabled?: boolean; rate?: number },
  fxRate?: number,
): BillBreakdown {
  let subtotalUsd = 0;
  let subtotalLbp = 0;

  for (const line of cart) {
    const item = items.find((it) => String(it._id) === line.menuItem);
    if (item) {
      const usd = item.priceUsd ?? line.pricePerQuantity;
      const lbp = item.priceLbp || (fxRate ? usd * fxRate : 0);
      subtotalUsd += usd * line.quantity;
      subtotalLbp += lbp * line.quantity;
    } else {
      subtotalUsd += line.price;
    }
  }

  const taxes: BillTaxLine[] = taxRates.map((tr) => {
    const rate = (tr.rate || 0) / 100;
    return {
      code: tr.code || "TAX",
      name: tr.name || "Tax",
      rate: tr.rate || 0,
      amountUsd: subtotalUsd * rate,
      amountLbp: subtotalLbp * rate,
    };
  });

  const taxUsd = taxes.reduce((acc, t) => acc + t.amountUsd, 0);
  const taxLbp = taxes.reduce((acc, t) => acc + t.amountLbp, 0);
  const serviceChargeRate = serviceChargeConfig?.enabled ? serviceChargeConfig.rate || 0 : 0;
  const serviceRate = serviceChargeRate / 100;
  const serviceChargeUsd = subtotalUsd * serviceRate;
  const serviceChargeLbp = subtotalLbp * serviceRate;
  const totalUsd = subtotalUsd + taxUsd + serviceChargeUsd;
  const totalLbp = subtotalLbp + taxLbp + serviceChargeLbp;
  const totalTaxRate = taxRates.reduce((acc, tr) => acc + (tr.rate || 0), 0);

  return {
    subtotalUsd,
    subtotalLbp,
    taxUsd,
    taxLbp,
    serviceChargeUsd,
    serviceChargeLbp,
    serviceChargeRate,
    totalUsd,
    totalLbp,
    totalWithTax: totalUsd,
    taxRate: totalTaxRate,
    taxes,
  };
}
