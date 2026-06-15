const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateOrderPaymentSplitsForPay,
} = require("../../utils/orderPaymentSplits");

test("validateOrderPaymentSplitsForPay accepts balanced splits", () => {
  const order = {
    billingMode: "immediate",
    bills: { totalWithTax: 100 },
    paymentMethod: "",
  };
  validateOrderPaymentSplitsForPay(order, {
    paymentSplits: [
      { methodKey: "cash", amount: 40 },
      { methodKey: "card", amount: 60 },
    ],
  });
  assert.equal(order.paymentSplits.length, 2);
  assert.match(String(order.paymentMethod), /cash/);
});

test("validateOrderPaymentSplitsForPay rejects on_account with splits", () => {
  const order = {
    billingMode: "on_account",
    bills: { totalWithTax: 50 },
  };
  assert.throws(
    () =>
      validateOrderPaymentSplitsForPay(order, {
        paymentSplits: [{ methodKey: "cash", amount: 50 }],
      }),
    /on_account/
  );
});
