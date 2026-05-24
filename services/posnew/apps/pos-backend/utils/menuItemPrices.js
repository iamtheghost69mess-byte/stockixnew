/**
 * Menu catalog dual-currency helpers (USD + LBP).
 * Legacy documents used `price` + `currency` only; new items use `priceUsd` + `priceLbp` (numbers).
 */

function coerceNonNeg(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? x : fallback;
}

function hasExplicitDual(doc) {
  return doc && (doc.priceUsd != null || doc.priceLbp != null);
}

/**
 * @param {Record<string, unknown>} doc MenuItem lean or document
 * @returns {{ priceUsd: number, priceLbp: number }}
 */
function dualPricesFromDoc(doc) {
  if (!doc) return { priceUsd: 0, priceLbp: 0 };
  if (hasExplicitDual(doc)) {
    return {
      priceUsd: coerceNonNeg(doc.priceUsd, 0),
      priceLbp: coerceNonNeg(doc.priceLbp, 0),
    };
  }
  const legacy = coerceNonNeg(doc.price, 0);
  const cur = String(doc.currency || "USD").toUpperCase();
  if (cur === "LBP") {
    return { priceUsd: 0, priceLbp: legacy };
  }
  return { priceUsd: legacy, priceLbp: 0 };
}

/**
 * Unit amount for order math in the order's document currency.
 * @param {Record<string, unknown>} doc
 * @param {string|null|undefined} documentCurrency ISO code or null (treated as USD)
 */
function unitPriceForDocumentCurrency(doc, documentCurrency) {
  const { priceUsd, priceLbp } = dualPricesFromDoc(doc);
  const cur = String(documentCurrency || "USD").toUpperCase();
  if (cur === "LBP") {
    if (priceLbp > 0) return priceLbp;
    return priceUsd;
  }
  if (priceUsd > 0) return priceUsd;
  return priceLbp;
}

/**
 * Keep legacy `price` / `currency` aligned for older readers (reports, exports).
 * @returns {{ price: number, currency: 'USD'|'LBP' }}
 */
function legacyMirrorFromDual(priceUsd, priceLbp) {
  const u = coerceNonNeg(priceUsd, 0);
  const l = coerceNonNeg(priceLbp, 0);
  if (u > 0) return { price: u, currency: "USD" };
  if (l > 0) return { price: l, currency: "LBP" };
  return { price: 0, currency: "USD" };
}

module.exports = {
  dualPricesFromDoc,
  unitPriceForDocumentCurrency,
  legacyMirrorFromDual,
};
