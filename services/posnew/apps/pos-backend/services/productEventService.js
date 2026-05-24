const ProductEvent = require("../models/productEventModel");

async function recordEvent({
  eventType,
  organizationId,
  actor,
  payload,
  correlationId,
}) {
  await ProductEvent.create({
    eventType,
    organization: organizationId,
    actor: actor || { kind: "system", id: "" },
    payload,
    correlationId: correlationId || "",
  });
}

module.exports = { recordEvent };
