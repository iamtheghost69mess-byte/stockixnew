import { EventEmitter } from "node:events";

import type { ProvisionEventPayload } from "./provision-trace.js";

const bus = new EventEmitter();
bus.setMaxListeners(200);

export function emitProvisionEvent(payload: ProvisionEventPayload): void {
  bus.emit(channel(payload.correlationId), payload);
}

export function subscribeProvision(
  correlationId: string,
  handler: (payload: ProvisionEventPayload) => void,
): () => void {
  const ch = channel(correlationId);
  bus.on(ch, handler);
  return () => {
    bus.off(ch, handler);
  };
}

function channel(correlationId: string): string {
  return `provision:${correlationId}`;
}
