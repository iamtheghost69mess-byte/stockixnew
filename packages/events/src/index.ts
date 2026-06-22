import type { Redis } from "ioredis";
import { z } from "zod";

export const EventSchemas = {
  "tenant.provisioned": z.object({
    tenantId: z.string().uuid(),
    slug: z.string(),
    modules: z.array(z.string()),
    timestamp: z.string().datetime(),
  }),
  "pos.credentials.generated": z.object({
    tenantId: z.string().uuid(),
    posOrganizationId: z.string(),
    credentials: z.array(
      z.object({
        role: z.string(),
        username: z.string(),
        pin: z.string(),
      })
    ),
    timestamp: z.string().datetime(),
  }),
};

export type EventName = keyof typeof EventSchemas;
export type EventPayload<T extends EventName> = z.infer<typeof EventSchemas[T]>;

/**
 * Publishes an event to a Redis Stream.
 */
export async function publishEvent<T extends EventName>(
  redis: Redis,
  streamName: string,
  eventName: T,
  payload: EventPayload<T>
): Promise<string> {
  const schema = EventSchemas[eventName];
  const validated = schema.parse(payload);
  
  // XADD streamName * eventName <jsonPayload>
  const messageId = await redis.xadd(
    streamName,
    "*",
    "event",
    eventName,
    "payload",
    JSON.stringify(validated)
  );
  
  return messageId;
}

export interface ConsumeOptions {
  streamName: string;
  consumerGroup: string;
  consumerName: string;
  /** Max messages to read at once */
  count?: number;
  /** Milliseconds to block before returning if no messages */
  blockMs?: number;
}

export interface StreamMessage {
  id: string;
  eventName: string;
  payload: unknown;
}

/**
 * Consumes events from a Redis Stream.
 * Ensures the consumer group exists, then calls XREADGROUP.
 */
export async function consumeEvents(
  redis: Redis,
  opts: ConsumeOptions
): Promise<StreamMessage[]> {
  try {
    // Create consumer group if it doesn't exist. MKSTREAM makes the stream if it doesn't exist.
    await redis.xgroup("CREATE", opts.streamName, opts.consumerGroup, "0", "MKSTREAM");
  } catch (err: any) {
    if (!err.message.includes("BUSYGROUP")) {
      throw err;
    }
  }

  // Read new messages (">")
  const results = await redis.xreadgroup(
    "GROUP",
    opts.consumerGroup,
    opts.consumerName,
    "COUNT",
    opts.count ?? 10,
    "BLOCK",
    opts.blockMs ?? 5000,
    "STREAMS",
    opts.streamName,
    ">"
  );

  if (!results || results.length === 0) {
    return [];
  }

  const messages: StreamMessage[] = [];
  
  // results is an array of [streamName, [ [messageId, [field1, value1, field2, value2]] ]]
  for (const [stream, streamMessages] of results) {
    if (stream !== opts.streamName) continue;

    for (const [id, fields] of streamMessages) {
      let eventName = "";
      let payloadStr = "";
      
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "event") eventName = fields[i + 1];
        if (fields[i] === "payload") payloadStr = fields[i + 1];
      }

      if (eventName && payloadStr) {
        try {
          messages.push({
            id,
            eventName,
            payload: JSON.parse(payloadStr),
          });
        } catch {
          // invalid json payload, skip or log
        }
      }
    }
  }

  return messages;
}

/**
 * Acknowledges a successfully processed message.
 */
export async function ackEvent(
  redis: Redis,
  streamName: string,
  consumerGroup: string,
  messageId: string
): Promise<number> {
  return redis.xack(streamName, consumerGroup, messageId);
}
