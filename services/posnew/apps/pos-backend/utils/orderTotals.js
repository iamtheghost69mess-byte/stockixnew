const MenuItem = require("../models/menuItemModel");
const { unitPriceForDocumentCurrency } = require("./menuItemPrices");
const TaxConfig = require("../models/taxConfigModel");
const AccountingConfig = require("../models/accountingConfigModel");

/** @deprecated Use DB-backed rate via recalcOrderTotals; kept as default fallback constant. */
const TAX_RATE = 0.0525;

let _rateCache = null;
let _rateCacheAt = 0;
const RATE_CACHE_MS = 10_000;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function modifierAdjustmentForLine(line) {
  if (!Array.isArray(line?.selectedModifiers)) return 0;
  let totalAdjustment = 0;
  for (const group of line.selectedModifiers) {
    const options = Array.isArray(group?.selectedOptions) ? group.selectedOptions : [];
    for (const option of options) {
      totalAdjustment += Number(option?.priceAdjustment || 0);
    }
  }
  return round2(totalAdjustment);
}

function clampRate(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  // If the value is > 1, assume it's a percentage (e.g., 15 for 15%) and convert to decimal.
  const normalized = v > 1 ? v / 100 : v;
  return Math.min(1, Math.max(0, normalized));
}

function invalidateTaxRateCache() {
  _rateCache = null;
  _rateCacheAt = 0;
}

async function resolveTaxRate() {
  const now = Date.now();
  if (_rateCache != null && now - _rateCacheAt < RATE_CACHE_MS) {
    return _rateCache;
  }
  let doc = await TaxConfig.findOne({ key: "default" });
  if (!doc) {
    doc = await TaxConfig.create({ key: "default", rate: TAX_RATE });
  }
  const r = Number(doc.rate);
  _rateCache = Number.isNaN(r) ? TAX_RATE : Math.min(1, Math.max(0, r));
  _rateCacheAt = now;
  return _rateCache;
}

function branchVatRateForLocation(cfgDoc, locationId) {
  if (!locationId) return null;
  const rows = Array.isArray(cfgDoc?.branchVatRates) ? cfgDoc.branchVatRates : [];
  const row = rows.find((entry) => String(entry.location) === String(locationId));
  if (!row) return null;
  const ratePercent = Number(row.ratePercent);
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return null;
  return clampRate(ratePercent / 100);
}

function isSalesTaxCode(cfgDoc, taxCode) {
  const c = String(taxCode || "standard").toLowerCase().trim();
  const tr = (cfgDoc?.taxRates || []).find(
    (t) => String(t.code).toLowerCase() === c
  );
  if (!tr) return true;
  return String(tr.kind || "sales").toLowerCase() !== "withholding";
}

async function resolveTaxRateForCode(cfgDoc, taxCode, locationId) {
  const branchVat = branchVatRateForLocation(cfgDoc, locationId);
  if (branchVat != null && isSalesTaxCode(cfgDoc, taxCode)) {
    return branchVat;
  }
  const c = String(taxCode || "standard").toLowerCase().trim();
  const tr = (cfgDoc?.taxRates || []).find(
    (t) => String(t.code).toLowerCase() === c
  );
  if (tr && typeof tr.rate === "number") {
    return clampRate(Number(tr.rate));
  }
  return resolveTaxRate();
}

async function resolveAccountingConfigForOrder(order) {
  const orgId = order?.organization || null;
  if (orgId) {
    const orgCfg = await AccountingConfig.findOne({ organization: orgId }).lean();
    if (orgCfg) return orgCfg;
  }
  return AccountingConfig.findOne({ key: "default" }).lean();
}

function resolveServiceChargeRate(cfgDoc) {
  const enabled = cfgDoc?.serviceChargeEnabled === true;
  if (!enabled) return 0;
  const percent = Number(cfgDoc?.serviceChargeRate);
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return clampRate(percent / 100);
}

function canonicalTaxCode(cfgDoc, taxCode) {
  const c = String(taxCode || "standard").toLowerCase().trim();
  const tr = (cfgDoc?.taxRates || []).find(
    (t) => String(t.code).toLowerCase() === c
  );
  return tr ? String(tr.code) : String(taxCode || "standard");
}

function bumpTaxLine(map, cfgDoc, code, amount) {
  const key = String(code || "standard").toLowerCase();
  const canon = canonicalTaxCode(cfgDoc, key);
  const cur = map.get(key) || {
    code: canon,
    label: "",
    amount: 0,
  };
  cur.amount = round2(cur.amount + amount);
  cur.code = canon;
  map.set(key, cur);
}

/**
 * Recompute bills from line items (menuItem price or legacy line fields).
 * Uses per-line tax from menu item (taxCode, priceTaxInclusive) when available.
 */
async function recalcOrderTotals(order) {
  const cfgDoc = await resolveAccountingConfigForOrder(order);
  const orderLocationId = order?.location ? String(order.location) : null;
  const taxLinesAgg = new Map();

  let subtotalNet = 0;
  let taxTotal = 0;
  const docCur = order.documentCurrency;

  for (const line of order.items) {
    const menuItemId = line.menuItem;

    let taxCode =
      line.taxCode != null && line.taxCode !== ""
        ? line.taxCode
        : null;
    let inclusive =
      line.priceTaxInclusive != null ? line.priceTaxInclusive : null;

    if (menuItemId) {
      const m = await MenuItem.findById(menuItemId).select(
        "price currency priceUsd priceLbp name taxCode priceTaxInclusive"
      );
      if (m) {
        line.name = line.name || m.name;
        const qty = Math.max(1, Number(line.quantity || 1));
        const plain = typeof m.toObject === "function" ? m.toObject() : m;
        const baseUnitPrice = unitPriceForDocumentCurrency(plain, docCur);
        const price = round2(
          line.itemType === "combo"
            ? Number(line.comboPrice ?? line.pricePerQuantity ?? baseUnitPrice)
            : baseUnitPrice + modifierAdjustmentForLine(line)
        );
        if (taxCode == null || taxCode === "") {
          taxCode = m.taxCode || "standard";
        }
        if (inclusive == null) inclusive = !!m.priceTaxInclusive;

        const rate = await resolveTaxRateForCode(cfgDoc, taxCode, orderLocationId);

        if (inclusive) {
          const gross = round2(price * qty);
          const net = rate >= 1 ? 0 : round2(gross / (1 + rate));
          const tax = round2(gross - net);
          subtotalNet = round2(subtotalNet + net);
          taxTotal = round2(taxTotal + tax);
          bumpTaxLine(taxLinesAgg, cfgDoc, taxCode, tax);
        } else {
          const net = round2(price * qty);
          const tax = round2(net * rate);
          subtotalNet = round2(subtotalNet + net);
          taxTotal = round2(taxTotal + tax);
          bumpTaxLine(taxLinesAgg, cfgDoc, taxCode, tax);
        }
        continue;
      }
    }

    const qty = Math.max(1, Number(line.quantity || 1));
    const code = taxCode || "standard";
    const rate = await resolveTaxRateForCode(cfgDoc, code, orderLocationId);
    const inc = inclusive === true;

    if (line.price != null) {
      const raw = Number(line.price);
      if (inc) {
        const gross = round2(raw);
        const net = rate >= 1 ? 0 : round2(gross / (1 + rate));
        const tax = round2(gross - net);
        subtotalNet = round2(subtotalNet + net);
        taxTotal = round2(taxTotal + tax);
        bumpTaxLine(taxLinesAgg, cfgDoc, code, tax);
      } else {
        const net = round2(raw);
        const tax = round2(net * rate);
        subtotalNet = round2(subtotalNet + net);
        taxTotal = round2(taxTotal + tax);
        bumpTaxLine(taxLinesAgg, cfgDoc, code, tax);
      }
    } else if (line.pricePerQuantity != null) {
      const net = round2(Number(line.pricePerQuantity) * qty);
      const tax = round2(net * rate);
      subtotalNet = round2(subtotalNet + net);
      taxTotal = round2(taxTotal + tax);
      bumpTaxLine(taxLinesAgg, cfgDoc, code, tax);
    }
  }

  if (!order.bills) order.bills = {};
  const serviceChargeRate = resolveServiceChargeRate(cfgDoc);
  const serviceChargeAmount = round2(subtotalNet * serviceChargeRate);
  order.bills.total = round2(subtotalNet);
  order.bills.tax = round2(taxTotal);
  order.bills.serviceChargeRate = round2(serviceChargeRate * 100);
  order.bills.serviceChargeAmount = serviceChargeAmount;
  order.bills.totalWithTax = round2(subtotalNet + taxTotal + serviceChargeAmount);
  const tls = [...taxLinesAgg.values()].filter((t) => t.amount > 0);
  order.bills.taxLines = tls.length ? tls : undefined;

  const cap = order.bills.totalWithTax;
  const md = Number(order.manualDiscountAmount);
  if (Number.isFinite(md) && md > cap) {
    order.manualDiscountAmount = cap;
  }
}

module.exports = {
  recalcOrderTotals,
  modifierAdjustmentForLine,
  TAX_RATE,
  resolveTaxRate,
  invalidateTaxRateCache,
};
