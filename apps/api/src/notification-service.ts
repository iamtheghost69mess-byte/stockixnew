import { ownerNotifications, type OwnerNotification } from "@repo/db/schema";
import { and, asc, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { publishOwnerNotification } from "./lib/notification-pubsub.js";

type Db = PostgresJsDatabase<typeof schema>;

/** Fallback poll when Redis pub/sub is unavailable (dev without Redis). */
export const NOTIFICATION_STREAM_POLL_MS = 10_000;
export const NOTIFICATION_STREAM_PING_MS = 30_000;
/** Rows already in inbox at connect — primed into sent set without SSE emit. */
export const NOTIFICATION_STREAM_PRIME_LIMIT = 50;
export const NOTIFICATION_STREAM_POLL_ROW_LIMIT = 100;

export type NotificationType =
  | "provision.complete"
  | "provision.failed"
  | "provision.partial"
  | "provision.module_added"
  | "provision.module_removed"
  | "deprovision.complete"
  | "license.expiring"
  | "license.expired"
  | "license.revoked"
  | "license.suspended"
  | "job.stuck"
  | "job.dead";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type CreateNotificationInput = {
  ownerId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  tenantId?: string;
  licenseId?: string;
  correlationId?: string;
  actionUrl?: string;
  actionLabel?: string;
  meta?: Record<string, unknown>;
};

export async function createNotification(
  db: Db,
  input: CreateNotificationInput,
): Promise<OwnerNotification | null> {
  const [notification] = await db
    .insert(ownerNotifications)
    .values({
      ownerId: input.ownerId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      tenantId: input.tenantId ?? null,
      licenseId: input.licenseId ?? null,
      correlationId: input.correlationId ?? null,
      actionUrl: input.actionUrl ?? null,
      actionLabel: input.actionLabel ?? null,
      meta: input.meta ?? null,
    })
    .returning();

  if (notification) {
    void publishOwnerNotification(input.ownerId, {
      id: notification.id,
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      body: notification.body,
      tenantId: notification.tenantId,
      licenseId: notification.licenseId,
      correlationId: notification.correlationId,
      actionUrl: notification.actionUrl,
      actionLabel: notification.actionLabel,
      readAt: notification.readAt?.toISOString() ?? null,
      meta: notification.meta,
      createdAt: notification.createdAt.toISOString(),
    });
  }

  return notification ?? null;
}

export async function listNotificationsForStream(
  db: Db,
  ownerId: string,
  since: Date,
): Promise<OwnerNotification[]> {
  return db
    .select()
    .from(ownerNotifications)
    .where(
      and(
        eq(ownerNotifications.ownerId, ownerId),
        gte(ownerNotifications.createdAt, since),
      ),
    )
    .orderBy(asc(ownerNotifications.createdAt), asc(ownerNotifications.id))
    .limit(NOTIFICATION_STREAM_POLL_ROW_LIMIT);
}

/** Fire-and-forget — never throws to callers. */
export function safeCreateNotification(db: Db, input: CreateNotificationInput): void {
  void createNotification(db, input).catch((err) => {
    console.error(
      "[notification] create failed:",
      err instanceof Error ? err.message : String(err),
    );
  });
}

export async function getNotifications(
  db: Db,
  ownerId: string,
  options: {
    unreadOnly?: boolean;
    limit?: number;
    before?: Date;
  } = {},
): Promise<OwnerNotification[]> {
  const { unreadOnly = false, limit = 20, before } = options;
  const conditions = [eq(ownerNotifications.ownerId, ownerId)];

  if (unreadOnly) {
    conditions.push(isNull(ownerNotifications.readAt));
  }
  if (before) {
    conditions.push(lt(ownerNotifications.createdAt, before));
  }

  return db
    .select()
    .from(ownerNotifications)
    .where(and(...conditions))
    .orderBy(desc(ownerNotifications.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));
}

export async function getUnreadCount(db: Db, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(ownerNotifications)
    .where(
      and(eq(ownerNotifications.ownerId, ownerId), isNull(ownerNotifications.readAt)),
    );
  return Number(row?.c ?? 0);
}

export async function markAsRead(
  db: Db,
  notificationId: string,
  ownerId: string,
): Promise<void> {
  await db
    .update(ownerNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(ownerNotifications.id, notificationId),
        eq(ownerNotifications.ownerId, ownerId),
      ),
    );
}

export async function markAllAsRead(db: Db, ownerId: string): Promise<void> {
  await db
    .update(ownerNotifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(ownerNotifications.ownerId, ownerId), isNull(ownerNotifications.readAt)),
    );
}

/** True if an expiry milestone in-app notification was already created for this license. */
export async function hasLicenseExpiryMilestoneNotification(
  db: Db,
  opts: { licenseId: string; milestoneDays: number },
): Promise<boolean> {
  const [row] = await db
    .select({ c: count() })
    .from(ownerNotifications)
    .where(
      and(
        eq(ownerNotifications.type, "license.expiring"),
        eq(ownerNotifications.licenseId, opts.licenseId),
        sql`${ownerNotifications.meta}->>'milestoneDays' = ${String(opts.milestoneDays)}`,
      ),
    );
  return Number(row?.c ?? 0) > 0;
}

export async function hasRecentNotification(
  db: Db,
  opts: {
    type: NotificationType;
    licenseId?: string;
    tenantId?: string;
    withinHours?: number;
  },
): Promise<boolean> {
  const withinHours = opts.withinHours ?? 24;
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const conditions = [
    eq(ownerNotifications.type, opts.type),
    gte(ownerNotifications.createdAt, since),
  ];
  if (opts.licenseId) {
    conditions.push(eq(ownerNotifications.licenseId, opts.licenseId));
  }
  if (opts.tenantId) {
    conditions.push(eq(ownerNotifications.tenantId, opts.tenantId));
  }
  const [row] = await db
    .select({ c: count() })
    .from(ownerNotifications)
    .where(and(...conditions));
  return Number(row?.c ?? 0) > 0;
}
