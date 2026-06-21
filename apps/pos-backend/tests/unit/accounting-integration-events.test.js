const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  EVENT_CATALOG,
  listEventCatalog,
  assertKnownEventType,
} = require("../../services/accountingIntegrationEvents");
const { EVENT_TYPES } = require("../../models/accountingIntegrationOutboxModel");

test("EVENT_CATALOG covers all outbox EVENT_TYPES", () => {
  for (const eventType of EVENT_TYPES) {
    assert.ok(EVENT_CATALOG[eventType], `missing catalog entry for ${eventType}`);
  }
  assert.equal(listEventCatalog().length, EVENT_TYPES.length);
});

test("assertKnownEventType rejects unknown events", () => {
  assert.throws(() => assertKnownEventType("not_a_real_event"), /Unknown accounting integration event/);
});

test("dispatchAccountingIntegrationEvent validates event type", async () => {
  const outboxPath = require.resolve("../../services/accountingIntegrationOutbox");
  const eventsPath = require.resolve("../../services/accountingIntegrationEvents");
  const prevOutbox = require.cache[outboxPath];
  const prevEvents = require.cache[eventsPath];

  require.cache[outboxPath] = {
    id: outboxPath,
    filename: outboxPath,
    loaded: true,
    exports: {
      recordAndDispatchAccountingSync: async () => ({ queued: true }),
      QUEUE_NAME: "bigcapital_sync",
      JOB_NAME_BY_EVENT: {},
    },
  };
  delete require.cache[eventsPath];
  const { dispatchAccountingIntegrationEvent } = require("../../services/accountingIntegrationEvents");

  try {
    await assert.rejects(
      () =>
        dispatchAccountingIntegrationEvent({
          organizationId: String(new mongoose.Types.ObjectId()),
          resourceId: String(new mongoose.Types.ObjectId()),
          eventType: "invalid",
          idempotencyKey: "x",
        }),
      /Unknown accounting integration event/
    );
  } finally {
    if (prevOutbox) require.cache[outboxPath] = prevOutbox;
    else delete require.cache[outboxPath];
    if (prevEvents) require.cache[eventsPath] = prevEvents;
    else delete require.cache[eventsPath];
  }
});
