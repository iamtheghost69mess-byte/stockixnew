const createHttpError = require("http-errors");

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Validates `paymentSplits` when closing an order as paid (multi-tender).
 * Mutates `order.paymentSplits` / `order.paymentMethod` when valid.
 * @param {import("mongoose").Document} order
 * @param {{ paymentSplits?: unknown }} body
 */
function validateOrderPaymentSplitsForPay(order, body) {
  const bm = String(order.billingMode || "immediate").toLowerCase();
  const splitsIn = body.paymentSplits;

  if (splitsIn === undefined) {
    return;
  }
  if (!Array.isArray(splitsIn)) {
    throw createHttpError(400, "paymentSplits must be an array.");
  }
  if (splitsIn.length === 0) {
    order.paymentSplits = undefined;
    return;
  }
  if (bm === "on_account") {
    throw createHttpError(
      400,
      "paymentSplits is not used when billingMode is on_account."
    );
  }

  const normalized = [];
  for (const row of splitsIn) {
    if (!row || typeof row !== "object") {
      throw createHttpError(400, "Each paymentSplit must be an object.");
    }
    const methodKey = String(row.methodKey ?? row.method ?? "").trim();
    if (!methodKey) {
      throw createHttpError(400, "Each paymentSplit needs methodKey or method.");
    }
    const amount = roundMoney(Number(row.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createHttpError(400, "Each paymentSplit needs a positive amount.");
    }
    normalized.push({
      methodKey: methodKey.toLowerCase().replace(/\s+/g, "_"),
      amount,
    });
  }

  const due = roundMoney(Number(order.bills?.totalWithTax || 0));
  const sum = roundMoney(normalized.reduce((s, x) => s + x.amount, 0));
  if (Math.abs(sum - due) > 0.02) {
    throw createHttpError(
      400,
      `paymentSplits must sum to order total (${due}); got ${sum}.`
    );
  }

  order.paymentSplits = normalized;
  if (!order.paymentMethod || String(order.paymentMethod).trim() === "") {
    order.paymentMethod = normalized.map((x) => x.methodKey).join(" + ");
  }
}

module.exports = { validateOrderPaymentSplitsForPay, roundMoney };
