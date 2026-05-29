import type { OwnerNotification } from "@repo/db/schema";
import type { createDb } from "@repo/db";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import {
  getControlPlaneRedisClient,
} from "../lib/redis.js";
import {
  publishOwnerNotification,
  subscribeOwnerNotifications,
} from "../lib/notification-pubsub.js";
import { logger } from "../lib/logger.js";
import {
  getNotifications,
  getUnreadCount,
  listNotificationsForStream,
  markAllAsRead,
  markAsRead,
  NOTIFICATION_STREAM_PING_MS,
  NOTIFICATION_STREAM_POLL_MS,
  NOTIFICATION_STREAM_PRIME_LIMIT,
} from "../notification-service.js";

type Db = ReturnType<typeof createDb>;

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
    actorPermissions?: string[];
    apiKeyId?: string;
    requestId: string;
    requestStartMs: number;
  };
};

function serializeNotification(row: OwnerNotification) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

function isSerializedNotification(value: unknown): value is ReturnType<typeof serializeNotification> {
  return (
    typeof value === "object"
    && value !== null
    && "id" in value
    && typeof (value as { id: unknown }).id === "string"
  );
}

export function registerNotificationsApi(app: Hono<ApiEnv>, db: Db | null): void {
  app.get("/notifications", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const ownerId = c.get("actorId");
    const unreadOnly = c.req.query("unreadOnly") === "true";
    const limitParsed = z.coerce.number().int().min(1).max(100).safeParse(
      c.req.query("limit") ?? "20",
    );
    const limit = limitParsed.success ? limitParsed.data : 20;
    const beforeRaw = c.req.query("before");
    const before =
      beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;

    const rows = await getNotifications(db, ownerId, { unreadOnly, limit, before });
    return c.json({
      success: true,
      data: rows.map(serializeNotification),
    });
  });

  app.get("/notifications/count", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const ownerId = c.get("actorId");
    const unread = await getUnreadCount(db, ownerId);
    return c.json({ success: true, data: { unread } });
  });

  app.post("/notifications/read-all", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const ownerId = c.get("actorId");
    await markAllAsRead(db, ownerId);
    return c.json({ success: true });
  });

  app.post("/notifications/:id/read", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const ownerId = c.get("actorId");
    const idParsed = z.string().uuid().safeParse(c.req.param("id"));
    if (!idParsed.success) return c.json({ error: "invalid_notification_id" }, 400);
    await markAsRead(db, idParsed.data, ownerId);
    return c.json({ success: true });
  });

  app.get("/notifications/stream", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const ownerId = c.get("actorId");
    const redis = getControlPlaneRedisClient();

    return streamSSE(c, async (stream) => {
      const sent = new Set<string>();
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });

      const unreadRows = await getNotifications(db, ownerId, {
        unreadOnly: true,
        limit: NOTIFICATION_STREAM_PRIME_LIMIT,
      });
      for (const row of unreadRows) {
        sent.add(row.id);
        await stream.writeSSE({
          event: "notification",
          data: JSON.stringify(serializeNotification(row)),
        });
      }

      const unread = await getUnreadCount(db, ownerId);
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ unread }),
      });

      let lastPingAt = 0;
      const streamStartedAt = new Date(Date.now() - 1000);

      const emitIfNew = async (payload: unknown) => {
        if (!isSerializedNotification(payload)) return;
        if (sent.has(payload.id)) return;
        sent.add(payload.id);
        await stream.writeSSE({
          event: "notification",
          data: JSON.stringify(payload),
        });
      };

      const maybePing = async () => {
        const now = Date.now();
        if (now - lastPingAt < NOTIFICATION_STREAM_PING_MS) return;
        await stream.writeSSE({
          event: "ping",
          data: new Date(now).toISOString(),
        });
        lastPingAt = now;
      };

      if (redis) {
        const unsubscribe = subscribeOwnerNotifications(
          ownerId,
          (notification) => {
            void emitIfNew(notification);
          },
          (err) => {
            logger.error("SSE notification subscription error", err, { ownerId });
          },
        );

        c.req.raw.signal.addEventListener("abort", () => {
          closed = true;
          unsubscribe();
        });

        while (!closed) {
          await maybePing();
          await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_STREAM_PING_MS));
        }
        unsubscribe();
        return;
      }

      // Fallback: DB polling when Redis is unavailable (local dev without CONTROL_PLANE_REDIS_URL)
      while (!closed) {
        const rows = await listNotificationsForStream(db, ownerId, streamStartedAt);
        for (const row of rows) {
          if (sent.has(row.id)) continue;
          sent.add(row.id);
          const serialized = serializeNotification(row);
          await stream.writeSSE({
            event: "notification",
            data: JSON.stringify(serialized),
          });
        }

        await maybePing();
        await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_STREAM_POLL_MS));
      }
    });
  });
}
