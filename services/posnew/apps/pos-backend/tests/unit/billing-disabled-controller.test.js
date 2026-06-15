const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inboundWebhook,
  simulateLifecycle,
  simulateSuspend,
} = require("../../controllers/platformBillingController");
const {
  listSubscriptions,
  updateSubscription,
} = require("../../controllers/platformSubscriptionController");

async function expectDisabled(handler, req = {}) {
  let captured = null;
  const next = (err) => {
    captured = err;
  };
  await handler(req, {}, next);
  assert.ok(captured, "expected controller to call next(error)");
  assert.equal(captured.status, 410);
}

test("billing endpoints return 410 disabled", async () => {
  await expectDisabled(inboundWebhook, { query: {}, body: {} });
  await expectDisabled(simulateLifecycle, { body: {} });
  await expectDisabled(simulateSuspend, { body: {} });
});

test("subscription endpoints return 410 disabled", async () => {
  await expectDisabled(listSubscriptions, { query: {} });
  await expectDisabled(updateSubscription, { params: { id: "x" }, body: {} });
});
