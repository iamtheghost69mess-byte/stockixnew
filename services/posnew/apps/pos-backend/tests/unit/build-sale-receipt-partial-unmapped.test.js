const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

test("buildSaleReceiptPayload rejects partial unmapped sellable lines by default", async () => {
  const IntegrationItemMapping = require("../../models/integrationItemMappingModel");
  const backofficePath = require.resolve("../../services/backofficeNotificationEvents");
  const prevBackoffice = require.cache[backofficePath];

  require.cache[backofficePath] = {
    id: backofficePath,
    filename: backofficePath,
    loaded: true,
    exports: {
      NOTIFICATION_EVENTS: { INTEGRATION_SYNC_UNMAPPED: "integration.sync_unmapped" },
      createBackofficeNotificationFromEvent: async () => {},
    },
  };

  const mappedId = new mongoose.Types.ObjectId();
  const unmappedId = new mongoose.Types.ObjectId();
  const findMock = mock.method(IntegrationItemMapping, "find", () => ({
    select: () => ({
      lean: async () => [{ posMenuItemId: mappedId, bigcapitalItemId: 10 }],
    }),
    lean: async () => [{ posMenuItemId: mappedId, bigcapitalItemId: 10 }],
  }));

  const { buildSaleReceiptPayload } = require("../../services/bigcapitalSyncProcessor");

  const order = {
    _id: new mongoose.Types.ObjectId(),
    organization: new mongoose.Types.ObjectId(),
    items: [
      {
        menuItem: mappedId,
        name: "Mapped",
        quantity: 1,
        pricePerQuantity: 5,
      },
      {
        menuItem: unmappedId,
        name: "Unmapped",
        quantity: 1,
        pricePerQuantity: 3,
      },
    ],
    paymentMethod: "cash",
  };

  const integrationConfig = {
    bigcapital: {
      defaultWalkInCustomerId: 1,
      defaultCashDepositAccountId: 2,
      allowPartialUnmappedReceipt: false,
    },
  };

  try {
    const payload = await buildSaleReceiptPayload(order, integrationConfig);
    assert.equal(payload, null);
  } finally {
    findMock.mock.restore();
    if (prevBackoffice) require.cache[backofficePath] = prevBackoffice;
    else delete require.cache[backofficePath];
  }
});
