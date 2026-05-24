# POS Backoffice Notifications by Domain

This file shows what is already implemented and what is not yet implemented, grouped by domain as requested.

## Global (applies to all domains)

### Done
- Tenant-scoped notification storage (`organization` isolation).
- Read/unread lifecycle per user (`readBy`).
- Severity levels: `info`, `warning`, `critical`.
- Dedupe/throttle (`dedupeKey` + time window) to reduce spam.
- APIs:
  - `GET /api/accounting/notifications`
  - `GET /api/accounting/notifications/unread-count`
  - `POST /api/accounting/notifications/:id/read`
  - `POST /api/accounting/notifications/all/read`
- UI:
  - Header bell + unread badge
  - Notifications page
  - filters (`all/unread/read`, severity)
  - mark single read + mark all read
  - realtime refresh via POS websocket event `notifications:updated`
  - Redis adapter is optional; socket falls back to local mode if Redis is unreachable

### Not done
- No archive/delete/snooze workflow.
- No per-user preferences (mute/subscriptions/channels).

## Inventory

### Done
- Low stock summary notification is emitted.
- Expiring stock summary notification is emitted.
- Inventory notifications use warning severity and link to inventory dashboard.
- Inventory notifications are throttled to avoid repeated spam.

### Not done
- No line-by-line action workflow (e.g., assign buyer from notification).
- No dedicated inventory notification channel outside in-app feed.

## Accounting

### Done
- Sale posting failure notification (critical).
- COGS posting failure notification (critical).
- Recurring invoice failed notification (critical).
- Recurring invoice skipped notification (info).
- Large refund notification (warning, threshold-based).

### Not done
- No invoice void-specific dedicated notification yet.
- No approval/escalation flow from accounting notifications.
- No export/analytics for accounting notification performance.

## POS

### Done
- Device pending approval notification (`device.new_pending`) is emitted.
- POS backoffice users can see device alerts in the same notification center.
- Device notifications include dedupe window to prevent repeated duplicates.

### Not done
- No dedicated POS-only notification page; uses shared backoffice notification center.

## Ordering

### Done
- Large refund events related to orders are notified.
- Order/accounting post failures are notified through accounting failure events.

### Not done
- No “new order created” business notification yet.
- No “order delayed/stuck” notification yet.
- No “kitchen send failed” notification yet.
- No customer self-order lifecycle notifications yet.

## Notes

- Current implementation is production-usable for critical backoffice alerts.
- New notification types should be added through the centralized event mapping service so behavior stays consistent.
