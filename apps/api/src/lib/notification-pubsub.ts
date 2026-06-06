import type { Redis } from "ioredis";

import { getControlPlaneRedisClient } from "./redis.js";
import { logger } from "./logger.js";

const CHANNEL_PREFIX = "owner_notifications";

export function ownerNotificationChannel(ownerId: string): string {
  return `${CHANNEL_PREFIX}:${ownerId}`;
}

export async function publishOwnerNotification(
  ownerId: string,
  notification: unknown,
): Promise<void> {
  const client = getControlPlaneRedisClient();
  if (!client) return;
  try {
    await client.publish(ownerNotificationChannel(ownerId), JSON.stringify(notification));
  } catch (err) {
    logger.debug("Redis notification publish skipped", {
      ownerId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export function subscribeOwnerNotifications(
  ownerId: string,
  onMessage: (notification: unknown) => void,
  onError: (err: Error) => void,
): () => void {
  const client = getControlPlaneRedisClient();
  if (!client) {
    return () => {};
  }

  const subscriber: Redis = client.duplicate();
  const channel = ownerNotificationChannel(ownerId);

  subscriber.on("error", (err) => {
    onError(err);
  });

  subscriber.on("message", (_chan, message) => {
    try {
      onMessage(JSON.parse(message) as unknown);
    } catch (err) {
      logger.warn("Failed to parse notification pub/sub message", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });

  void subscriber
    .connect()
    .then(() => subscriber.subscribe(channel))
    .catch((err: unknown) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    });

  return () => {
    void releaseOwnerNotificationSubscriber(subscriber, channel);
  };
}

/** Idempotent teardown — never throws; avoids unhandled rejections when Redis is already closed. */
async function releaseOwnerNotificationSubscriber(subscriber: Redis, channel: string): Promise<void> {
  const status = subscriber.status;
  if (status === "end" || status === "close") {
    return;
  }
  try {
    await subscriber.unsubscribe(channel);
  } catch {
    // Connection may drop during SSE abort or API shutdown.
  }
  try {
    if (subscriber.status !== "end" && subscriber.status !== "close") {
      subscriber.disconnect();
    }
  } catch {
    // ignore
  }
}
