const backofficeNotificationService = require("./backofficeNotificationService");

const NOTIFICATION_EVENTS = {
  DEVICE_NEW_PENDING: "device.new_pending",
  INVENTORY_LOW_STOCK: "inventory.low_stock",
  INVENTORY_EXPIRING_STOCK: "inventory.expiring_stock",
  ACCOUNTING_SALE_POST_FAILED: "accounting.sale_post_failed",
  ACCOUNTING_COGS_POST_FAILED: "accounting.cogs_post_failed",
  REFUND_LARGE: "order.refund_large",
  RECURRING_INVOICE_FAILED: "accounting.recurring_invoice_failed",
  RECURRING_INVOICE_SKIPPED: "accounting.recurring_invoice_skipped",
  INTEGRATION_SYNC_UNMAPPED: "integration.sync_unmapped_items",
};

function buildEventPayload(eventKey, input) {
  switch (eventKey) {
    case NOTIFICATION_EVENTS.DEVICE_NEW_PENDING:
      return {
        type: "device",
        title: "New pending device requires approval",
        body: input.body || `Device ${input.uuid || ""} is waiting for manager approval.`,
        severity: "warning",
        href: "/dashboard/default",
        sourceType: "device",
        sourceId: input.deviceId || "",
        dedupeKey: `device_pending:${input.deviceId || input.uuid || "unknown"}`,
        dedupeWindowMs: 60 * 60 * 1000,
        metadata: { eventKey, uuid: input.uuid || "" },
      };
    case NOTIFICATION_EVENTS.INVENTORY_LOW_STOCK:
      return {
        type: "inventory",
        title: "Low stock alert",
        body: input.body || "Some ingredients are at or below reorder threshold.",
        severity: "warning",
        href: "/dashboard/inventory",
        sourceType: "inventory",
        dedupeKey: `inventory_low_stock:${input.organizationId || ""}`,
        dedupeWindowMs: 4 * 60 * 60 * 1000,
        metadata: { eventKey, lowStockCount: Number(input.lowStockCount || 0) },
      };
    case NOTIFICATION_EVENTS.INVENTORY_EXPIRING_STOCK:
      return {
        type: "inventory",
        title: "Expiring stock alert",
        body: input.body || "Some stock lots are close to expiration.",
        severity: "warning",
        href: "/dashboard/inventory",
        sourceType: "inventory",
        dedupeKey: `inventory_expiring_stock:${input.organizationId || ""}`,
        dedupeWindowMs: 4 * 60 * 60 * 1000,
        metadata: { eventKey, expiringCount: Number(input.expiringCount || 0) },
      };
    case NOTIFICATION_EVENTS.ACCOUNTING_SALE_POST_FAILED:
      return {
        type: "accounting",
        title: "Order sale posting failed",
        body: input.body || "The order sale journal could not be posted.",
        severity: "critical",
        href: "/dashboard/accounting/journal",
        sourceType: "order",
        sourceId: input.orderId || "",
        dedupeKey: `sale_post_failed:${input.orderId || "unknown"}`,
        dedupeWindowMs: 30 * 60 * 1000,
        metadata: { eventKey, orderId: input.orderId || "" },
      };
    case NOTIFICATION_EVENTS.ACCOUNTING_COGS_POST_FAILED:
      return {
        type: "accounting",
        title: "Order COGS posting failed",
        body: input.body || "The order COGS journal could not be posted.",
        severity: "critical",
        href: "/dashboard/accounting/journal",
        sourceType: "order",
        sourceId: input.orderId || "",
        dedupeKey: `cogs_post_failed:${input.orderId || "unknown"}`,
        dedupeWindowMs: 30 * 60 * 1000,
        metadata: { eventKey, orderId: input.orderId || "" },
      };
    case NOTIFICATION_EVENTS.REFUND_LARGE:
      return {
        type: "orders",
        title: "Large refund posted",
        body: input.body || "A large refund was posted and should be reviewed.",
        severity: "warning",
        href: "/dashboard/accounting/invoices",
        sourceType: "order_refund",
        sourceId: input.orderId || "",
        dedupeKey: `refund_large:${input.orderId || "unknown"}:${Number(input.amount || 0).toFixed(2)}`,
        dedupeWindowMs: 10 * 60 * 1000,
        metadata: { eventKey, orderId: input.orderId || "", amount: Number(input.amount || 0) },
      };
    case NOTIFICATION_EVENTS.RECURRING_INVOICE_FAILED:
      return {
        type: "accounting",
        title: "Recurring invoice run failed",
        body: input.body || "Recurring invoice generation failed.",
        severity: "critical",
        href: "/dashboard/accounting/recurring-invoices",
        sourceType: "recurring_invoice",
        sourceId: input.templateId || "",
        dedupeKey: `recurring_failed:${input.templateId || "unknown"}`,
        dedupeWindowMs: 30 * 60 * 1000,
        metadata: { eventKey, templateId: input.templateId || "" },
      };
    case NOTIFICATION_EVENTS.RECURRING_INVOICE_SKIPPED:
      return {
        type: "accounting",
        title: "Recurring invoice run skipped",
        body: input.body || "Recurring invoice generation was skipped.",
        severity: "info",
        href: "/dashboard/accounting/recurring-invoices",
        sourceType: "recurring_invoice",
        sourceId: input.templateId || "",
        dedupeKey: `recurring_skipped:${input.templateId || "unknown"}`,
        dedupeWindowMs: 2 * 60 * 60 * 1000,
        metadata: { eventKey, templateId: input.templateId || "" },
      };
    case NOTIFICATION_EVENTS.INTEGRATION_SYNC_UNMAPPED:
      return {
        type: "integration",
        title: "Finance sync skipped — unmapped items",
        body:
          input.body
          || "A paid order had no Finance item mappings; the receipt was not created.",
        severity: "warning",
        href: "/dashboard/integrations",
        sourceType: "order",
        sourceId: input.orderId || "",
        dedupeKey: `integration_unmapped:${input.orderId || "unknown"}`,
        dedupeWindowMs: 60 * 60 * 1000,
        metadata: {
          eventKey,
          orderId: input.orderId || "",
          unmappedCount: Number(input.unmappedCount || 0),
        },
      };
    default:
      return null;
  }
}

async function createBackofficeNotificationFromEvent(eventKey, input) {
  const organizationId = input.organizationId;
  if (!organizationId) return null;
  const payload = buildEventPayload(eventKey, input);
  if (!payload) return null;
  return backofficeNotificationService.createNotification({
    organizationId,
    ...payload,
  });
}

module.exports = {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
};
