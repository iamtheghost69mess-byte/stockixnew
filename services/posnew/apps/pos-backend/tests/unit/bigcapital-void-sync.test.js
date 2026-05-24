const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const orgId = new mongoose.Types.ObjectId();

test("voidFinanceReceipt skips when integration disabled", async () => {
  const IntegrationConfig = require("../../models/integrationConfigModel");
  const { voidFinanceReceipt } = require("../../services/bigcapitalSyncProcessor");

  const findOneMock = mock.method(IntegrationConfig, "findOne", async () => ({
    bigcapital: { enabled: false },
  }));

  const result = await voidFinanceReceipt(
    String(new mongoose.Types.ObjectId()),
    String(orgId)
  );
  assert.equal(result.skipped, true);
  findOneMock.mock.restore();
});

test("voidFinanceReceipt DELETEs Finance by order reference", async () => {
  const IntegrationConfig = require("../../models/integrationConfigModel");
  const Order = require("../../models/orderModel");
  const { voidFinanceReceipt } = require("../../services/bigcapitalSyncProcessor");

  const orderId = new mongoose.Types.ObjectId();
  const fetchCalls = [];

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return { status: 200, ok: true, text: async () => "" };
  };

  const findOneMock = mock.method(IntegrationConfig, "findOne", async () => ({
    bigcapital: {
      enabled: true,
      internalBaseUrl: "http://finance:3000",
      internalSecret: "secret",
      financeTenantId: 42,
    },
  }));
  const updateMock = mock.method(Order, "findByIdAndUpdate", async () => ({}));

  const result = await voidFinanceReceipt(String(orderId), String(orgId));
  assert.equal(result.success, true);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, new RegExp(`/by-reference/${orderId}$`));
  assert.equal(fetchCalls[0].init.method, "DELETE");
  assert.equal(JSON.parse(fetchCalls[0].init.body).tenantId, 42);

  global.fetch = originalFetch;
  findOneMock.mock.restore();
  updateMock.mock.restore();
});

test("voidFinanceReceipt treats 404 as skipped", async () => {
  const IntegrationConfig = require("../../models/integrationConfigModel");
  const { voidFinanceReceipt } = require("../../services/bigcapitalSyncProcessor");

  const originalFetch = global.fetch;
  global.fetch = async () => ({ status: 404, ok: false, text: async () => "" });

  const findOneMock = mock.method(IntegrationConfig, "findOne", async () => ({
    bigcapital: {
      enabled: true,
      internalBaseUrl: "http://finance:3000",
      internalSecret: "s",
      financeTenantId: 1,
    },
  }));

  const result = await voidFinanceReceipt(
    String(new mongoose.Types.ObjectId()),
    String(orgId)
  );
  assert.equal(result.skipped, true);
  assert.match(result.reason, /not found/i);

  global.fetch = originalFetch;
  findOneMock.mock.restore();
});
