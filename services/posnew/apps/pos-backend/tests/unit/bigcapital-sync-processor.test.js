const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  buildMappedEntries,
  resolveDepositAccountId,
  resolveLocationMapping,
  isCardMethodKey,
  buildSaleReceiptPayload,
} = require("../../services/bigcapitalSyncProcessor");

const orgId = new mongoose.Types.ObjectId();
const menuBurger = new mongoose.Types.ObjectId();
const menuCustom = new mongoose.Types.ObjectId();
const locationMain = new mongoose.Types.ObjectId();

const baseCfg = {
  defaultWalkInCustomerId: 1,
  defaultCashDepositAccountId: 10001,
  defaultCardDepositAccountId: 10002,
};

test("isCardMethodKey detects card-like methods", () => {
  assert.equal(isCardMethodKey("card"), true);
  assert.equal(isCardMethodKey("credit_card"), true);
  assert.equal(isCardMethodKey("cash"), false);
});

test("resolveDepositAccountId uses cash by default", () => {
  const id = resolveDepositAccountId({ paymentMethod: "cash" }, baseCfg);
  assert.equal(id, 10001);
});

test("resolveDepositAccountId uses card for card paymentMethod", () => {
  const id = resolveDepositAccountId({ paymentMethod: "card" }, baseCfg);
  assert.equal(id, 10002);
});

test("resolveDepositAccountId uses largest split method", () => {
  const id = resolveDepositAccountId(
    {
      paymentSplits: [
        { methodKey: "cash", amount: 5 },
        { methodKey: "card", amount: 20 },
      ],
    },
    baseCfg
  );
  assert.equal(id, 10002);
});

test("buildMappedEntries passes line discount amount", () => {
  const menuId = new mongoose.Types.ObjectId();
  const itemMap = { [String(menuId)]: { id: 9 } };
  const order = {
    items: [
      {
        menuItem: menuId,
        name: "Burger",
        quantity: 1,
        pricePerQuantity: 10,
        discount: { amount: 2 },
      },
    ],
  };
  const entries = buildMappedEntries(order, itemMap);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].discount, 2);
});

test("buildMappedEntries skips unmapped lines", () => {
  const order = {
    items: [
      {
        menuItem: menuBurger,
        name: "Burger",
        quantity: 2,
        pricePerQuantity: 12,
      },
      {
        menuItem: menuCustom,
        name: "Custom",
        quantity: 1,
        pricePerQuantity: 5,
      },
    ],
  };
  const itemMap = { [String(menuBurger)]: { id: 5 } };
  const entries = buildMappedEntries(order, itemMap);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].itemId, 5);
  assert.equal(entries[0].quantity, 2);
  assert.equal(entries[0].rate, 12);
});

test("buildMappedEntries returns empty when nothing mapped", () => {
  const order = {
    items: [{ menuItem: menuCustom, name: "X", quantity: 1, pricePerQuantity: 1 }],
  };
  assert.equal(buildMappedEntries(order, {}).length, 0);
});

test("buildSaleReceiptPayload returns null when all items unmapped", async () => {
  const IntegrationItemMapping = require("../../models/integrationItemMappingModel");
  const findMock = mock.method(IntegrationItemMapping, "find", () => ({
    lean: async () => [],
  }));

  const order = {
    _id: new mongoose.Types.ObjectId(),
    organization: orgId,
    items: [
      { menuItem: menuBurger, name: "Burger", quantity: 1, pricePerQuantity: 10 },
    ],
  };

  const result = await buildSaleReceiptPayload(order, { bigcapital: baseCfg });
  assert.equal(result, null);
  findMock.mock.restore();
});

test("resolveLocationMapping uses mapping row when order location matches", () => {
  const cfg = {
    defaultWarehouseId: 99,
    locationMapping: [
      {
        posLocationId: locationMain,
        bigcapitalBranchId: 7,
        bigcapitalWarehouseId: 42,
      },
    ],
  };
  const { warehouseId, branchId } = resolveLocationMapping(
    { location: locationMain },
    cfg
  );
  assert.equal(warehouseId, 42);
  assert.equal(branchId, 7);
});

test("resolveLocationMapping falls back to defaultWarehouseId", () => {
  const cfg = {
    defaultWarehouseId: 99,
    locationMapping: [
      {
        posLocationId: new mongoose.Types.ObjectId(),
        bigcapitalWarehouseId: 42,
      },
    ],
  };
  const { warehouseId, branchId } = resolveLocationMapping(
    { location: locationMain },
    cfg
  );
  assert.equal(warehouseId, 99);
  assert.equal(branchId, null);
});

test("buildSaleReceiptPayload includes warehouseId when mapping exists", async () => {
  const IntegrationItemMapping = require("../../models/integrationItemMappingModel");
  const findMock = mock.method(IntegrationItemMapping, "find", () => ({
    lean: async () => [
      { posMenuItemId: menuBurger, bigcapitalItemId: 5, bigcapitalItemName: "Burger" },
    ],
  }));

  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    organization: orgId,
    location: locationMain,
    paymentMethod: "cash",
    paidAt: new Date("2026-05-23T12:00:00Z"),
    items: [
      { menuItem: menuBurger, name: "Burger", quantity: 1, pricePerQuantity: 12 },
    ],
  };

  const cfg = {
    ...baseCfg,
    locationMapping: [
      {
        posLocationId: locationMain,
        bigcapitalBranchId: 3,
        bigcapitalWarehouseId: 55,
      },
    ],
  };

  const payload = await buildSaleReceiptPayload(order, { bigcapital: cfg });
  assert.ok(payload);
  assert.equal(payload.warehouseId, 55);
  assert.equal(payload.branchId, 3);
  findMock.mock.restore();
});

test("buildSaleReceiptPayload builds closed receipt with referenceNo", async () => {
  const IntegrationItemMapping = require("../../models/integrationItemMappingModel");
  const findMock = mock.method(IntegrationItemMapping, "find", () => ({
    lean: async () => [
      { posMenuItemId: menuBurger, bigcapitalItemId: 5, bigcapitalItemName: "Burger" },
    ],
  }));

  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    organization: orgId,
    paymentMethod: "cash",
    paidAt: new Date("2026-05-23T12:00:00Z"),
    items: [
      { menuItem: menuBurger, name: "Burger", quantity: 1, pricePerQuantity: 12 },
    ],
    documentCurrency: "EUR",
    fxRateToCompany: 1.1,
  };

  const payload = await buildSaleReceiptPayload(order, { bigcapital: baseCfg });
  assert.ok(payload);
  assert.equal(payload.closed, true);
  assert.equal(payload.referenceNo, String(orderId));
  assert.equal(payload.depositAccountId, 10001);
  assert.equal(payload.entries[0].itemId, 5);
  assert.equal(payload.exchangeRate, 1.1);
  findMock.mock.restore();
});
