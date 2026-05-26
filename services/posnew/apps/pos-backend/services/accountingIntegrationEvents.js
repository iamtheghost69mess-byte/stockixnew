const {
  recordAndDispatchAccountingSync,
  QUEUE_NAME,
} = require("./accountingIntegrationOutbox");
const { EVENT_TYPES } = require("../models/accountingIntegrationOutboxModel");

/**
 * Cross-product accounting bridge event catalog.
 * All Finance sync intents should use dispatchAccountingIntegrationEvent().
 */
const EVENT_CATALOG = Object.freeze({
  sync_paid_order: {
    domain: "sales",
    jobName: "sync_paid_order",
    resourceLabel: "order",
    description: "Create closed Finance sale receipt for paid POS order",
  },
  void_receipt: {
    domain: "sales",
    jobName: "void_receipt",
    resourceLabel: "order",
    description: "Void Finance receipt by POS order reference",
  },
  partial_refund: {
    domain: "sales",
    jobName: "partial_refund",
    resourceLabel: "order",
    description: "Finance credit note for partial refund",
  },
  grn_bill: {
    domain: "inventory",
    jobName: "grn_bill",
    resourceLabel: "grn",
    description: "Finance AP bill from confirmed GRN",
  },
  inventory_adjustment: {
    domain: "inventory",
    jobName: "inventory_adjustment",
    resourceLabel: "ingredient",
    description: "Finance variance journal for stock adjust/waste",
  },
  stock_take_variance: {
    domain: "inventory",
    jobName: "stock_take_variance",
    resourceLabel: "stock_take",
    description: "Finance variance journal from posted stock take",
  },
});

/**
 * @param {string} eventType
 */
function assertKnownEventType(eventType) {
  if (!EVENT_CATALOG[eventType]) {
    throw new Error(`Unknown accounting integration event: ${eventType}`);
  }
}

/**
 * Single entry point for POS → Finance async bridge (outbox + BullMQ).
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.eventType
 * @param {string} params.resourceId
 * @param {string} params.idempotencyKey
 * @param {string} [params.originatedBy]
 * @param {object} [params.payload]
 */
async function dispatchAccountingIntegrationEvent(params) {
  const eventType = params.eventType;
  assertKnownEventType(eventType);
  if (!EVENT_TYPES.includes(eventType)) {
    throw new Error(`Event ${eventType} missing from outbox EVENT_TYPES enum`);
  }

  return recordAndDispatchAccountingSync({
    organizationId: params.organizationId,
    resourceId: params.resourceId,
    orderId: params.resourceId,
    eventType,
    idempotencyKey: params.idempotencyKey,
    originatedBy: params.originatedBy || "",
    payload: params.payload || {},
  });
}

function listEventCatalog() {
  return Object.entries(EVENT_CATALOG).map(([eventType, meta]) => ({
    eventType,
    ...meta,
  }));
}

module.exports = {
  QUEUE_NAME,
  EVENT_CATALOG,
  assertKnownEventType,
  dispatchAccountingIntegrationEvent,
  listEventCatalog,
};
