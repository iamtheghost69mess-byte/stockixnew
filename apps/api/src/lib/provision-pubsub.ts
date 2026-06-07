import { EventEmitter } from "node:events";

import type { Redis } from "ioredis";

import type { ProvisionEventPayload } from "../provision-trace.js";
import { getControlPlaneRedisClient } from "./redis.js";
import { logger } from "./logger.js";

const CHANNEL_PREFIX = "provision";
const localBus = new EventEmitter();
localBus.setMaxListeners(200);

export function provisionChannel(correlationId: string): string {
  return `${CHANNEL_PREFIX}:${correlationId}`;
}

export async function publishProvisionEvent(payload: ProvisionEventPayload): Promise<void> {
  const client = getControlPlaneRedisClient();
  if (!client) {
    localBus.emit(provisionChannel(payload.correlationId), payload);
    return;
  }
  try {
    await client.publish(provisionChannel(payload.correlationId), JSON.stringify(payload));
  } catch (err) {
    logger.debug("Redis provision publish skipped", {
      correlationId: payload.correlationId,
      err: err instanceof Error ? err.message : String(err),
    });
    localBus.emit(provisionChannel(payload.correlationId), payload);
  }
}

export function subscribeProvisionEvents(
  correlationId: string,
  onMessage: (payload: ProvisionEventPayload) => void,
  onError: (err: Error) => void,
): () => void {
  const client = getControlPlaneRedisClient();
  if (!client) {
    const channel = provisionChannel(correlationId);
    localBus.on(channel, onMessage);
    return () => {
      localBus.off(channel, onMessage);
    };
  }

  const subscriber: Redis = client.duplicate();
  const channel = provisionChannel(correlationId);

  subscriber.on("error", (err) => {
    onError(err);
  });

  subscriber.on("message", (_chan, message) => {
    try {
      onMessage(JSON.parse(message) as ProvisionEventPayload);
    } catch (err) {
      logger.warn("Failed to parse provision pub/sub message", {
        correlationId,
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
    void releaseProvisionSubscriber(subscriber, channel);
  };
}

/** Idempotent teardown — never throws; avoids unhandled rejections when Redis is already closed. */
async function releaseProvisionSubscriber(subscriber: Redis, channel: string): Promise<void> {
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
