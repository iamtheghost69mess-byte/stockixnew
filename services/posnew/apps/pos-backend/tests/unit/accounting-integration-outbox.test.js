const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Outbox = require("../../models/accountingIntegrationOutboxModel");
const IntegrationConfig = require("../../models/integrationConfigModel");

const jobQueuePath = require.resolve("../../services/jobQueue");
const outboxPath = require.resolve("../../services/accountingIntegrationOutbox");

test("recordAndDispatchAccountingSync persists outbox when Redis unavailable", async (t) => {
  const orgId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();

  const prevJobQueue = require.cache[jobQueuePath];
  const prevOutbox = require.cache[outboxPath];
  const origFind = IntegrationConfig.findOne;
  const origCreate = Outbox.create;
  const origFindOne = Outbox.findOne;
  const origUpdate = Outbox.updateOne;

  const created = {
    _id: new mongoose.Types.ObjectId(),
    status: "pending",
    originatedBy: "",
    payload: {},
  };

  t.after(() => {
    IntegrationConfig.findOne = origFind;
    Outbox.create = origCreate;
    Outbox.findOne = origFindOne;
    Outbox.updateOne = origUpdate;
    if (prevJobQueue) require.cache[jobQueuePath] = prevJobQueue;
    else delete require.cache[jobQueuePath];
    if (prevOutbox) require.cache[outboxPath] = prevOutbox;
    else delete require.cache[outboxPath];
  });

  require.cache[jobQueuePath] = {
    id: jobQueuePath,
    filename: jobQueuePath,
    loaded: true,
    exports: {
      addJob: async () => ({ queued: false, reason: "no_redis" }),
    },
  };
  delete require.cache[outboxPath];
  const { recordAndDispatchAccountingSync } = require("../../services/accountingIntegrationOutbox");

  IntegrationConfig.findOne = () => ({
    lean: async () => ({ bigcapital: { enabled: true } }),
  });
  Outbox.findOne = () => ({
    lean: async () => null,
  });
  Outbox.create = async (doc) => {
    Object.assign(created, doc);
    return created;
  };
  Outbox.updateOne = async () => ({});

  const result = await recordAndDispatchAccountingSync({
    organizationId: String(orgId),
    orderId: String(orderId),
    eventType: "sync_paid_order",
    idempotencyKey: `bigcapital_order_${orderId}`,
    originatedBy: "test.order.paid",
    payload: {},
  });

  assert.equal(result.queued, false);
  assert.equal(result.reason, "no_redis");
  assert.equal(created.originatedBy, "test.order.paid");
});
