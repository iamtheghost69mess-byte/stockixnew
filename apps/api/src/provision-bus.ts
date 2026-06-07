import type { ProvisionEventPayload } from "./provision-trace.js";
import {
  publishProvisionEvent,
  subscribeProvisionEvents,
} from "./lib/provision-pubsub.js";

export function emitProvisionEvent(payload: ProvisionEventPayload): void {
  void publishProvisionEvent(payload);
}

export function subscribeProvision(
  correlationId: string,
  handler: (payload: ProvisionEventPayload) => void,
): () => void {
  return subscribeProvisionEvents(correlationId, handler, () => {});
}
