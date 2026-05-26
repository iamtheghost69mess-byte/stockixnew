import type { OwnerNotification } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

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

type Db = PostgresJsDatabase<typeof schema>;

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
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

    return streamSSE(c, async (stream) => {
      const sent = new Set<string>();
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });

      const streamStartedAt = new Date(Date.now() - 1000);

      const primed = await getNotifications(db, ownerId, {
        limit: NOTIFICATION_STREAM_PRIME_LIMIT,
      });
      for (const row of primed) {
        sent.add(row.id);
      }

      const unread = await getUnreadCount(db, ownerId);
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ unread }),
      });

      let lastPingAt = 0;

      while (!closed) {
        const rows = await listNotificationsForStream(db, ownerId, streamStartedAt);

        for (const row of rows) {
          if (sent.has(row.id)) continue;
          sent.add(row.id);
          await stream.writeSSE({
            event: "notification",
            data: JSON.stringify(serializeNotification(row)),
          });
        }

        const now = Date.now();
        if (now - lastPingAt >= NOTIFICATION_STREAM_PING_MS) {
          await stream.writeSSE({
            event: "ping",
            data: new Date(now).toISOString(),
          });
          lastPingAt = now;
        }

        await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_STREAM_POLL_MS));
      }
    });
  });
}
