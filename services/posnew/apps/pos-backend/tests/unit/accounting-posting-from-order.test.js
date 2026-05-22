const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  accountingPostingFromOrder,
} = require("../../services/accountingService");

test("accountingPostingFromOrder returns null statuses for null order", () => {
  assert.deepEqual(accountingPostingFromOrder(null), {
    sale: { status: null },
    cogs: { status: null },
  });
});

test("accountingPostingFromOrder maps ok and errors", () => {
  const doc = {
    accountingSaleStatus: "ok",
    accountingSaleError: "",
    accountingCogsStatus: "failed",
    accountingCogsError: "COGS or inventory account missing",
  };
  const out = accountingPostingFromOrder(doc);
  assert.equal(out.sale.status, "ok");
  assert.equal(out.cogs.status, "failed");
  assert(!("error" in out.sale));
  assert.equal(out.cogs.error, "COGS or inventory account missing");
});

test("accountingPostingFromOrder omits error keys when empty", () => {
  const out = accountingPostingFromOrder({
    accountingSaleStatus: "skipped",
    accountingSaleError: "",
    accountingCogsStatus: "skipped",
    accountingCogsError: "",
  });
  assert.equal(out.sale.status, "skipped");
  assert.equal(out.cogs.status, "skipped");
  assert(!("error" in out.sale));
  assert(!("error" in out.cogs));
});
