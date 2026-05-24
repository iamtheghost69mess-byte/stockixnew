const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

test("reverseOrderSaleLedger returns null when Finance integration bypasses native GL", async () => {
  const AccountingConfig = require("../../models/accountingConfigModel");
  const JournalEntry = require("../../models/journalEntryModel");
  const Order = require("../../models/orderModel");
  const { reverseOrderSaleLedger } = require("../../services/accountingService");

  const orderId = new mongoose.Types.ObjectId();
  const orgId = new mongoose.Types.ObjectId();

  const findSaleMock = mock.method(JournalEntry, "findOne", async () => null);
  const findOrderMock = mock.method(Order, "findById", () => ({
    select: () => ({
      lean: async () => ({ organization: orgId }),
    }),
  }));
  const cfgMock = mock.method(AccountingConfig, "findOne", () => ({
    select: () => ({
      lean: async () => ({ bigcapitalIntegrationEnabled: true }),
    }),
  }));

  const result = await reverseOrderSaleLedger(String(orderId), null);
  assert.equal(result, null);

  findSaleMock.mock.restore();
  findOrderMock.mock.restore();
  cfgMock.mock.restore();
});

test("reverseOrderSaleLedger throws when no sale and Finance integration off", async () => {
  const AccountingConfig = require("../../models/accountingConfigModel");
  const JournalEntry = require("../../models/journalEntryModel");
  const Order = require("../../models/orderModel");
  const { reverseOrderSaleLedger } = require("../../services/accountingService");

  const orderId = new mongoose.Types.ObjectId();
  const orgId = new mongoose.Types.ObjectId();

  const findSaleMock = mock.method(JournalEntry, "findOne", async () => null);
  const findOrderMock = mock.method(Order, "findById", () => ({
    select: () => ({
      lean: async () => ({ organization: orgId }),
    }),
  }));
  const cfgMock = mock.method(AccountingConfig, "findOne", () => ({
    select: () => ({
      lean: async () => ({ bigcapitalIntegrationEnabled: false }),
    }),
  }));

  await assert.rejects(
    () => reverseOrderSaleLedger(String(orderId), null),
    /No sale journal to reverse/
  );

  findSaleMock.mock.restore();
  findOrderMock.mock.restore();
  cfgMock.mock.restore();
});

test("postOrderRefund returns null when Finance integration bypasses native GL", async () => {
  const AccountingConfig = require("../../models/accountingConfigModel");
  const Order = require("../../models/orderModel");
  const { postOrderRefund } = require("../../services/accountingService");

  const orderId = new mongoose.Types.ObjectId();
  const orgId = new mongoose.Types.ObjectId();

  const findOrderMock = mock.method(Order, "findById", () => ({
    select: () => ({
      lean: async () => ({ organization: orgId }),
    }),
  }));
  const cfgMock = mock.method(AccountingConfig, "findOne", () => ({
    select: () => ({
      lean: async () => ({ bigcapitalIntegrationEnabled: true }),
    }),
  }));

  const result = await postOrderRefund({
    orderId: String(orderId),
    amount: 10,
    userId: null,
  });
  assert.equal(result, null);

  findOrderMock.mock.restore();
  cfgMock.mock.restore();
});
