import { formatCurrency } from "@/lib/utils";

export type MenuItemLike = {
  price?: number;
  priceUsd?: number | null;
  priceLbp?: number | null;
  currency?: string;
};

function coerceNonNeg(n: unknown, fallback = 0): number {
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? x : fallback;
}

/** Matches server `dualPricesFromDoc` for catalog items and populated order lines. */
export function resolveMenuItemDualPrices(item: MenuItemLike): { priceUsd: number; priceLbp: number } {
  const rawUsd = item.priceUsd;
  const rawLbp = item.priceLbp;
  const hasExplicit =
    (rawUsd != null && !Number.isNaN(Number(rawUsd))) || (rawLbp != null && !Number.isNaN(Number(rawLbp)));
  if (hasExplicit) {
    return {
      priceUsd: coerceNonNeg(rawUsd, 0),
      priceLbp: coerceNonNeg(rawLbp, 0),
    };
  }
  const legacy = coerceNonNeg(item.price, 0);
  const cur = String(item.currency || "USD").toUpperCase();
  if (cur === "LBP") {
    return { priceUsd: 0, priceLbp: legacy };
  }
  return { priceUsd: legacy, priceLbp: 0 };
}

/** Same rules as server `unitPriceForDocumentCurrency` (default POS checks use USD). */
export function unitPriceForDocumentCurrency(item: MenuItemLike, documentCurrency?: string | null): number {
  const { priceUsd, priceLbp } = resolveMenuItemDualPrices(item);
  const cur = String(documentCurrency || "USD").toUpperCase();
  if (cur === "LBP") {
    if (priceLbp > 0) return priceLbp;
    return priceUsd;
  }
  if (priceUsd > 0) return priceUsd;
  return priceLbp;
}

export function formatMenuItemDualLines(item: MenuItemLike): { primary: string; secondary: string | null } {
  const { priceUsd, priceLbp } = resolveMenuItemDualPrices(item);
  const hasUsd = priceUsd > 0;
  const hasLbp = priceLbp > 0;
  if (hasUsd) {
    return {
      primary: formatCurrency(priceUsd, { currency: "USD" }),
      secondary: hasLbp ? formatCurrency(priceLbp, { currency: "LBP", noDecimals: true }) : null,
    };
  }
  if (hasLbp) {
    return {
      primary: formatCurrency(priceLbp, { currency: "LBP", noDecimals: true }),
      secondary: null,
    };
  }
  return { primary: "—", secondary: null };
}
