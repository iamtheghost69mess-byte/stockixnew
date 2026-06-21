const createHttpError = require("http-errors");
const PlatformOwnerSettings = require("../models/platformOwnerSettingsModel");

const ISO_CURRENCY = /^[A-Z]{3}$/;

function normalizeCurrencyList(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const c = String(x || "")
      .trim()
      .toUpperCase();
    if (!ISO_CURRENCY.test(c)) {
      const err = new Error(`Invalid currency code: ${x}`);
      err.status = 400;
      throw err;
    }
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function normalizeTaxRates(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const code = String(r.code || "")
      .trim()
      .toUpperCase();
    if (!code) {
      const err = new Error("Each tax rate needs a code");
      err.status = 400;
      throw err;
    }
    const kind = r.kind === "withholding" ? "withholding" : "sales";
    const ratePercent = Number(r.ratePercent);
    if (Number.isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      const err = new Error("ratePercent must be between 0 and 100");
      err.status = 400;
      throw err;
    }
    out.push({
      code,
      name: String(r.name || "").trim(),
      ratePercent,
      kind,
    });
  }
  return out;
}

function validateAccountingDefaults(d) {
  if (!d || typeof d !== "object") return null;
  const next = {};
  if (d.companyCurrency !== undefined) {
    const c = String(d.companyCurrency).trim().toUpperCase();
    if (!ISO_CURRENCY.test(c)) {
      const err = new Error("Invalid companyCurrency");
      err.status = 400;
      throw err;
    }
    next.companyCurrency = c;
  }
  if (d.defaultCostMethod !== undefined) {
    if (!["fifo", "lifo", "weighted_average", "standard"].includes(d.defaultCostMethod)) {
      const err = new Error("Invalid defaultCostMethod");
      err.status = 400;
      throw err;
    }
    next.defaultCostMethod = d.defaultCostMethod;
  }
  if (d.fiscalYearStartMonth !== undefined) {
    const m = Number(d.fiscalYearStartMonth);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      const err = new Error("fiscalYearStartMonth must be 1–12");
      err.status = 400;
      throw err;
    }
    next.fiscalYearStartMonth = m;
  }
  if (d.stockDeductTrigger !== undefined) {
    if (!["kitchen_send", "payment", "both"].includes(d.stockDeductTrigger)) {
      const err = new Error("Invalid stockDeductTrigger");
      err.status = 400;
      throw err;
    }
    next.stockDeductTrigger = "payment";
  }
  return Object.keys(next).length ? next : null;
}

async function ensureDoc() {
  await PlatformOwnerSettings.updateOne(
    { key: "singleton" },
    {
      $setOnInsert: {
        key: "singleton",
        supportedCurrencies: ["USD", "EUR", "GBP"],
        defaultCurrency: "USD",
        defaultTaxRates: [],
        accountingDefaults: {
          companyCurrency: "USD",
          defaultCostMethod: "fifo",
          fiscalYearStartMonth: 1,
          stockDeductTrigger: "payment",
        },
      },
    },
    { upsert: true }
  );
  return PlatformOwnerSettings.findOne({ key: "singleton" }).lean();
}

const getSystemOwnerSettings = async (req, res, next) => {
  try {
    const doc = await ensureDoc();
    res.json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const patchSystemOwnerSettings = async (req, res, next) => {
  try {
    const body = req.body || {};
    const $set = {};

    if (body.supportedCurrencies !== undefined) {
      $set.supportedCurrencies = normalizeCurrencyList(body.supportedCurrencies);
    }
    if (body.defaultCurrency !== undefined) {
      const c = String(body.defaultCurrency).trim().toUpperCase();
      if (!ISO_CURRENCY.test(c)) return next(createHttpError(400, "Invalid defaultCurrency"));
      $set.defaultCurrency = c;
    }
    if (body.defaultTaxRates !== undefined) {
      $set.defaultTaxRates = normalizeTaxRates(body.defaultTaxRates);
    }
    if (body.accountingDefaults !== undefined) {
      const cur = await ensureDoc();
      const patch = validateAccountingDefaults(body.accountingDefaults);
      if (patch) {
        $set.accountingDefaults = { ...(cur.accountingDefaults || {}), ...patch };
      }
    }

    if (!Object.keys($set).length) {
      return next(createHttpError(400, "No valid fields to update."));
    }

    const doc = await PlatformOwnerSettings.findOneAndUpdate(
      { key: "singleton" },
      { $set },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    if ($set.defaultCurrency && $set.supportedCurrencies) {
      if (!$set.supportedCurrencies.includes($set.defaultCurrency)) {
        return next(createHttpError(400, "defaultCurrency must appear in supportedCurrencies."));
      }
    } else if ($set.defaultCurrency && doc.supportedCurrencies?.length) {
      if (!doc.supportedCurrencies.includes($set.defaultCurrency)) {
        return next(createHttpError(400, "defaultCurrency must appear in supportedCurrencies."));
      }
    } else if ($set.supportedCurrencies && doc.defaultCurrency) {
      if (!$set.supportedCurrencies.includes(doc.defaultCurrency)) {
        return next(createHttpError(400, "supportedCurrencies must include current defaultCurrency."));
      }
    }

    res.json({ success: true, data: doc });
  } catch (e) {
    if (e.status) return next(e);
    next(e);
  }
};

module.exports = {
  getSystemOwnerSettings,
  patchSystemOwnerSettings,
};
